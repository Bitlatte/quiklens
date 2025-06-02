// app/api/image/process/route.ts
import { NextRequest, NextResponse } from 'next/server';
import sharp, { Region, Metadata } from 'sharp';
import type { ImageProcessingParams, ImageEffectType, ProcessImageResponse } from '@/lib/types';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

function exposureToBrightnessMultiplier(ev: number): number { return Math.pow(2, ev); }
function temperatureToRgbTint(temp: number): { r: number; g: number; b: number } | null { /* ... */ 
  if (temp === 0) return null;
  const intensity = Math.abs(temp) / 100.0;
  let r = 255, g = 255, b = 255;
  if (temp > 0) { b = Math.max(0, 255 - Math.floor(200 * intensity)); g = Math.max(0, 255 - Math.floor(50 * intensity)); }
  else { r = Math.max(0, 255 - Math.floor(200 * intensity)); g = Math.max(0, 255 - Math.floor(50 * intensity)); }
  return { r, g, b };
}
function greenMagentaTintToRgb(tintValue: number): { r: number; g: number; b: number } | null { /* ... */ 
  if (tintValue === 0) return null;
  const intensity = Math.abs(tintValue) / 100.0;
  let r = 255, g = 255, b = 255;
  if (tintValue > 0) { g = Math.max(0, Math.floor(255 * (1 - (intensity * 0.65)))); }
  else { const rb = Math.max(0, Math.floor(255 * (1 - (intensity * 0.65)))); r = rb; b = rb; }
  return { r, g, b };
}

export async function POST(request: NextRequest): Promise<NextResponse | Response> {
  let tempRawInputPath: string | undefined;
  let tempTiffOutputPathFromRaw: string | undefined;

  try {
    const formData = await request.formData();
    const file = formData.get('imageFile') as File | null;
    const effect = formData.get('effect') as ImageEffectType | null;
    const paramsString = formData.get('params') as string | null;

    let params: ImageProcessingParams = {};
    if (paramsString) {
      try { params = JSON.parse(paramsString); } 
      catch { console.warn("[API /process] Could not parse params JSON:", paramsString); }
    }

    if (!file) return NextResponse.json({ error: 'No image file provided.' } as ProcessImageResponse, { status: 400 });
    if (!effect) return NextResponse.json({ error: 'No effect specified.' } as ProcessImageResponse, { status: 400 });

    console.log(`[API /process] Received effect: ${effect} for file: ${file.name}, params:`, params);

    const imageBuffer = Buffer.from(await file.arrayBuffer());
    let sourceForSharp: string | Buffer = imageBuffer;

    const rawExtensions = /\.(cr2|cr3|nef|arw|orf|raf|rw2|pef|srw|dng)$/i;
    const isRawFile = rawExtensions.test(file.name);

    if (isRawFile) {
      console.log(`[API /process] RAW file detected: ${file.name}. Pre-processing with dcraw_emu.`);
      const uniqueId = Date.now() + "_" + Math.random().toString(36).substring(2, 10);
      tempRawInputPath = path.join(os.tmpdir(), `process_raw_input_${uniqueId}_${file.name}`);
      tempTiffOutputPathFromRaw = tempRawInputPath + ".tiff";

      await fs.writeFile(tempRawInputPath, imageBuffer);
      console.log(`[API /process] Temporary RAW file written: ${tempRawInputPath}`);

      console.log(`[API /process] Executing: dcraw_emu -w -T "${tempRawInputPath}" (output expected: ${tempTiffOutputPathFromRaw})`);
      const { stdout, stderr } = await execFileAsync('dcraw_emu', ['-w', '-T', tempRawInputPath]);
      
      if (stderr && stderr.trim() !== "") console.warn(`[API /process] dcraw_emu stderr: ${stderr.trim()}`);
      if (stdout && stdout.trim() !== "") console.log(`[API /process] dcraw_emu stdout: ${stdout.trim()}`);

      try {
        await fs.access(tempTiffOutputPathFromRaw);
        console.log(`[API /process] dcraw_emu converted RAW to TIFF: ${tempTiffOutputPathFromRaw}`);
        sourceForSharp = tempTiffOutputPathFromRaw;
      } catch (tiffError) {
        console.error(`[API /process] dcraw_emu TIFF output file not found at ${tempTiffOutputPathFromRaw}. Error:`, tiffError);
        throw new Error(`dcraw_emu failed to produce TIFF. Stderr: ${stderr}`);
      }
    } else {
      console.log(`[API /process] Standard image file detected: ${file.name}. Processing directly.`);
    }
    
    let pImageWorkingInstance = sharp(sourceForSharp)
        .rotate(); // Apply EXIF rotation immediately after loading

    // Get metadata *after* applying .rotate()
    const orientedMetadata: Metadata = await pImageWorkingInstance.metadata();
    console.log('[API /process] Metadata for sharp processing (post-orientation):', { 
        width: orientedMetadata.width, 
        height: orientedMetadata.height, 
        format: orientedMetadata.format,
        orientation: orientedMetadata.orientation 
    });

    // All subsequent operations (crop, adjustments) will use pImageWorkingInstance
    if (params.crop) {
        const { left, top, width, height } = params.crop;
        // Validate crop dimensions against the (now correctly oriented) metadata
        if (width > 0 && height > 0 && left >= 0 && top >= 0 &&
            orientedMetadata.width && left + width <= orientedMetadata.width &&
            orientedMetadata.height && top + height <= orientedMetadata.height
        ) {
            console.log('[API /process] Applying crop region to oriented image:', params.crop);
            try {
                pImageWorkingInstance = pImageWorkingInstance.extract(params.crop as Region);
            } catch (cropError: unknown) {
                const message = cropError instanceof Error ? cropError.message : String(cropError);
                console.error("[API /process] Error during pImage.extract():", message);
                return NextResponse.json({ error: 'Failed during crop extraction.', details: message } as ProcessImageResponse, { status: 500 });
            }
        } else {
            console.warn('[API /process] Invalid or out-of-bounds crop parameters for current image, skipping crop:', params.crop, "Oriented Image Dims:", {w: orientedMetadata.width, h: orientedMetadata.height});
        }
    }

    // Apply adjustments to the (potentially cropped and already oriented) image
    if (effect === 'applyAll' || effect === 'crop' || ['brightness', 'exposure', 'temperature', 'contrast', 'saturation', 'tint', 'sharpness'].includes(effect)) {
      if (params.exposure !== undefined && params.exposure !== 0) {
        pImageWorkingInstance = pImageWorkingInstance.modulate({ brightness: exposureToBrightnessMultiplier(params.exposure) });
      }
      if (params.brightness !== undefined && params.brightness !== 1) {
        pImageWorkingInstance = pImageWorkingInstance.modulate({ brightness: params.brightness });
      }
      // ... (rest of the adjustments applied to pImageWorkingInstance) ...
      if (params.contrast !== undefined && params.contrast !== 0) {
        const contrastValue = params.contrast; const factorA = 1.0 + (contrastValue / 100.0); const offsetB = 128 * (1 - factorA);
        pImageWorkingInstance = pImageWorkingInstance.linear(factorA, offsetB);
      }
      if (params.temperature !== undefined && params.temperature !== 0) {
        const tempTintColor = temperatureToRgbTint(params.temperature);
        if (tempTintColor) pImageWorkingInstance = pImageWorkingInstance.tint(tempTintColor);
      }
      if (params.saturation !== undefined && params.saturation !== 1.0) {
        const saturationValue = Math.max(0, params.saturation);
        pImageWorkingInstance = pImageWorkingInstance.modulate({ saturation: saturationValue });
      }
      if (params.tint !== undefined && params.tint !== 0) {
        const greenMagentaTintColor = greenMagentaTintToRgb(params.tint);
        if (greenMagentaTintColor) pImageWorkingInstance = pImageWorkingInstance.tint(greenMagentaTintColor);
      }
      if (params.sharpness !== undefined && params.sharpness > 0) {
        const sharpnessFactor = params.sharpness / 100.0; const sigma = 0.3 + (sharpnessFactor * 1.7);
        pImageWorkingInstance = pImageWorkingInstance.sharpen({ sigma });
      }
    }
    
    if (effect === 'grayscale') {
      pImageWorkingInstance = pImageWorkingInstance.grayscale();
    } else if (effect === 'resize') {
      if (params.width || params.height) {
        pImageWorkingInstance = pImageWorkingInstance.resize(
          typeof params.width === 'number' ? params.width : undefined,
          typeof params.height === 'number' ? params.height : undefined
        );
      }
    }

    const outputFormat = 'png';
    const mimeType = `image/${outputFormat}`;
    const outputBuffer: Buffer = await pImageWorkingInstance
      .toFormat(outputFormat as keyof sharp.FormatEnum)
      .toBuffer();

    return new Response(outputBuffer, {
      status: 200,
      headers: { 'Content-Type': mimeType, 'Content-Disposition': `inline; filename="processed_image.${outputFormat}"`},
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[API /process] Overall error in POST handler:', message);
    return NextResponse.json(
      { error: 'Error processing image.', details: message } as ProcessImageResponse,
      { status: 500 }
    );
  } finally {
    if (tempRawInputPath) {
      await fs.unlink(tempRawInputPath).catch(err => console.error(`[API /process] Error deleting temp RAW input file ${tempRawInputPath}:`, err));
    }
    if (tempTiffOutputPathFromRaw) {
        try {
            if (await fs.stat(tempTiffOutputPathFromRaw).then(() => true).catch(() => false)) {
                 await fs.unlink(tempTiffOutputPathFromRaw).catch(err => console.error(`[API /process] Error deleting temp TIFF output file ${tempTiffOutputPathFromRaw}:`, err));
            }
        } catch { /* ignore */ }
    }
  }
}