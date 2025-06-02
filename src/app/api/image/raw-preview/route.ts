// app/api/image/raw-preview/route.ts
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

interface RawPreviewResponse {
  previewDataUrl?: string;
  originalWidth?: number;
  originalHeight?: number;
  previewWidth?: number;
  previewHeight?: number;
  error?: string;
  details?: string;
}

interface ExifToolCliOutput {
  SourceFile: string;
  ImageWidth?: number;
  ImageHeight?: number;
  MIMEType?: string;
  FileType?: string;
  FileTypeExtension?: string;
  Orientation?: number | string;
  SubFileType?: string;
  Error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<RawPreviewResponse>> {
  let tempInputPath: string | undefined;
  let tempTiffPath: string | undefined;

  try {
    const formData = await request.formData();
    const file = formData.get('rawImageFile') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No image file provided.' }, { status: 400 });
    }

    const imageBuffer = Buffer.from(await file.arrayBuffer());
    const uniqueId = Date.now() + "_" + Math.random().toString(36).substring(2, 10);
    const originalName = file.name || 'inputfile';
    tempInputPath = path.join(os.tmpdir(), `raw_input_${uniqueId}_${originalName}`);
    
    await fs.writeFile(tempInputPath, imageBuffer);
    console.log(`[API /raw-preview] Temp input file written: ${tempInputPath}`);

    console.log(`[API /raw-preview] Attempting to read metadata with CLI ExifTool for: ${tempInputPath}`);
    const exifToolArgs = [
        '-json', '-n', '-ImageWidth', '-ImageHeight', '-MIMEType',
        '-FileType', '-FileTypeExtension', '-SubFileType', '-Orientation', tempInputPath
    ];
    const { stdout: exifJsonString, stderr: exifError } = await execFileAsync('exiftool', exifToolArgs);

    if (exifError && exifError.trim() !== "") console.warn(`[API /raw-preview] ExifTool stderr: ${exifError.trim()}`);
    if (!exifJsonString) throw new Error('ExifTool returned no output.');

    const metadataArray = JSON.parse(exifJsonString) as ExifToolCliOutput[];
    if (!metadataArray || metadataArray.length === 0) throw new Error('ExifTool returned empty JSON array.');
    const metadata = metadataArray[0];
    if (metadata.Error) throw new Error(`ExifTool error: ${metadata.Error}`);
    
    console.log(`[API /raw-preview] ExifTool CLI read complete. FileType: ${metadata.FileType || 'Unknown'}, MIMEType: ${metadata.MIMEType || 'Unknown'}`);

    const exifImageWidth = metadata.ImageWidth;
    const exifImageHeight = metadata.ImageHeight;
    const mimeType = metadata.MIMEType?.toLowerCase();
    const orientation = metadata.Orientation; 

    if (typeof exifImageWidth !== 'number' || typeof exifImageHeight !== 'number') {
      throw new Error(`Could not extract valid dimensions using ExifTool. Width: ${exifImageWidth}, Height: ${exifImageHeight}`);
    }
    console.log(`[API /raw-preview] ExifTool Raw Dimensions: ${exifImageWidth}x${exifImageHeight}, Orientation: ${orientation}`);

    let originalOrientedWidth = exifImageWidth;
    let originalOrientedHeight = exifImageHeight;

    if (typeof orientation === 'number' && orientation >= 5 && orientation <= 8) {
        console.log(`[API /raw-preview] Swapping dimensions based on EXIF Orientation: ${orientation}`);
        originalOrientedWidth = exifImageHeight; 
        originalOrientedHeight = exifImageWidth;  
    } else if (typeof orientation === 'string') {
        if (orientation.includes('90') || orientation.includes('270')) {
            console.log(`[API /raw-preview] Swapping dimensions due to EXIF Orientation string: ${orientation}`);
            originalOrientedWidth = exifImageHeight;
            originalOrientedHeight = exifImageWidth;
        }
    }
    console.log(`[API /raw-preview] Original orientation-corrected dimensions: ${originalOrientedWidth}x${originalOrientedHeight}`);

    let inputForSharp: string | Buffer; 
    const knownRawMimeTypes = [
        'image/x-canon-cr2', 'image/x-canon-cr3', 'image/x-nikon-nef', 
        'image/x-sony-arw', 'image/x-adobe-dng', 'image/x-fuji-raf',
        'image/x-olympus-orf', 'image/x-panasonic-rw2', 'image/x-pentax-pef',
        'application/octet-stream' 
    ];
    const commonWebFormats = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
    let isConsideredRaw = false;

    if (mimeType) {
        if (knownRawMimeTypes.includes(mimeType) || 
            (mimeType === 'image/tiff' && (metadata.FileTypeExtension === 'dng' || metadata.FileType === 'DNG')) ||
            !commonWebFormats.includes(mimeType)
           ) {
             isConsideredRaw = true;
        }
    }
    if (!isConsideredRaw || mimeType === 'application/octet-stream') {
        const rawExtensions = /\.(cr2|cr3|nef|arw|orf|raf|rw2|pef|srw|dng)$/i;
        if (rawExtensions.test(originalName)) {
            isConsideredRaw = true;
            console.log(`[API /raw-preview] Considered RAW based on extension: ${originalName}`);
        }
    }

    if (isConsideredRaw) {
      console.log(`[API /raw-preview] Identified as RAW. Processing with dcraw_emu...`);
      tempTiffPath = tempInputPath + ".tiff"; 

      console.log(`[API /raw-preview] Executing: dcraw_emu -w -T "${tempInputPath}" (output expected at: ${tempTiffPath})`);
      const { stdout: dcrawStdout, stderr: dcrawStderr } = await execFileAsync('dcraw_emu', ['-w', '-T', tempInputPath]);
      if (dcrawStderr && dcrawStderr.trim() !== "") console.warn(`[API /raw-preview] dcraw_emu stderr: ${dcrawStderr.trim()}`);
      if (dcrawStdout && dcrawStdout.trim() !== "") console.log(`[API /raw-preview] dcraw_emu stdout: ${dcrawStdout.trim()}`);
      
      try {
          await fs.access(tempTiffPath);
          console.log(`[API /raw-preview] dcraw_emu converted RAW to TIFF: ${tempTiffPath}`);
          inputForSharp = tempTiffPath; 
      } catch (tiffError) {
          console.error(`[API /raw-preview] dcraw_emu TIFF output file not found at ${tempTiffPath}. Input was ${tempInputPath}. Error:`, tiffError);
          throw new Error(`dcraw_emu failed to produce TIFF output. Check LibRaw CLI tools. Stderr: ${dcrawStderr}`);
      }
    } else {
      console.log(`[API /raw-preview] File not treated as RAW (MIME: ${mimeType}). Processing original with sharp directly from buffer.`);
      inputForSharp = imageBuffer;
    }
    
    console.log(`[API /raw-preview] Preparing to process with sharp. Input type: ${typeof inputForSharp === 'string' ? 'path' : 'buffer'}`);
    
    const sharpInstanceForPreview = sharp(inputForSharp).rotate(); // Apply rotation first
    
    // The 'preResizeMetadata' line was removed as it was unused.

    const previewBuffer = await sharpInstanceForPreview // Use the already rotated instance
      .resize({ width: 1080, height: 1080, fit: sharp.fit.inside, withoutEnlargement: true })
      .jpeg({ quality: 80, progressive: true })
      .toBuffer();
    console.log('[API /raw-preview] Sharp preview processing complete.');

    // Get dimensions of the *actual generated preview* to return to the client
    const finalPreviewMetadata = await sharp(previewBuffer).metadata();
    const previewWidth = finalPreviewMetadata.width;
    const previewHeight = finalPreviewMetadata.height;

    if (typeof previewWidth !== 'number' || typeof previewHeight !== 'number') {
        throw new Error('Could not determine dimensions of the generated preview image.');
    }
    console.log(`[API /raw-preview] Actual preview dimensions: ${previewWidth}x${previewHeight}`);


    const previewDataUrl = `data:image/jpeg;base64,${previewBuffer.toString('base64')}`;

    return NextResponse.json({
      previewDataUrl,
      originalWidth: originalOrientedWidth,
      originalHeight: originalOrientedHeight,
      previewWidth: previewWidth,
      previewHeight: previewHeight,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[API /raw-preview] Overall error in POST handler:', message);
    return NextResponse.json({ error: 'Error generating preview.', details: message }, { status: 500 });
  } finally {
    if (tempInputPath) {
      await fs.unlink(tempInputPath).catch(err => console.error(`Error deleting temp input file ${tempInputPath}:`, err));
    }
    if (tempTiffPath) {
        try {
            if (await fs.stat(tempTiffPath).then(() => true).catch(() => false)) {
                 await fs.unlink(tempTiffPath).catch(err => console.error(`Error deleting temp TIFF file ${tempTiffPath}:`, err));
            }
        } catch { /* ignore */ }
    }
    // No exiftool.end() needed for CLI
  }
}