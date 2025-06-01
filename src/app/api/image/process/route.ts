import { NextRequest, NextResponse } from 'next/server';
import sharp, { Sharp, Region, Metadata } from 'sharp'; // Import Region and Metadata
import type { ImageProcessingParams, ImageEffectType, ProcessImageResponse } from '@/lib/types';

// --- Helper functions (exposureToBrightnessMultiplier, temperatureToRgbTint, greenMagentaTintToRgb) remain the same ---
function exposureToBrightnessMultiplier(ev: number): number { return Math.pow(2, ev); }
function temperatureToRgbTint(temp: number): { r: number; g: number; b: number } | null {
  if (temp === 0) return null;
  const intensity = Math.abs(temp) / 100.0;
  let r = 255, g = 255, b = 255;
  if (temp > 0) { // Warmer
    b = Math.max(0, 255 - Math.floor(200 * intensity));
    g = Math.max(0, 255 - Math.floor(50 * intensity));
  } else { // Cooler
    r = Math.max(0, 255 - Math.floor(200 * intensity));
    g = Math.max(0, 255 - Math.floor(50 * intensity));
  }
  return { r, g, b };
}
function greenMagentaTintToRgb(tintValue: number): { r: number; g: number; b: number } | null {
  if (tintValue === 0) return null;
  const intensity = Math.abs(tintValue) / 100.0;
  let r = 255, g = 255, b = 255;
  if (tintValue > 0) { // Magenta tint
    g = Math.max(0, Math.floor(255 * (1 - (intensity * 0.65))));
  } else { // Green tint
    const rbComponent = Math.max(0, Math.floor(255 * (1 - (intensity * 0.65))));
    r = rbComponent;
    b = rbComponent;
  }
  return { r, g, b };
}

export async function POST(request: NextRequest): Promise<NextResponse | Response> {
  try {
    const formData = await request.formData();
    const file = formData.get('imageFile') as File | null;
    const effect = formData.get('effect') as ImageEffectType | null;
    const paramsString = formData.get('params') as string | null;

    let params: ImageProcessingParams = {};
    if (paramsString) {
      try { params = JSON.parse(paramsString); }
      catch (e) { console.warn("API: Could not parse params JSON:", paramsString); }
    }

    if (!file) return NextResponse.json({ error: 'No image file provided.' } as ProcessImageResponse, { status: 400 });
    if (!effect) return NextResponse.json({ error: 'No effect specified.' } as ProcessImageResponse, { status: 400 });

    const imageBuffer = Buffer.from(await file.arrayBuffer());
    let pImage: Sharp = sharp(imageBuffer);

    console.log(`API: Processing effect: ${effect} with params:`, params);

    const initialMetadata: Metadata = await pImage.metadata();
    console.log('API: Initial image metadata:', { width: initialMetadata.width, height: initialMetadata.height, format: initialMetadata.format });


    // --- Apply Crop First if specified ---
    if ((effect === 'crop' || effect === 'applyAll') && params.crop) {
        const { left, top, width, height } = params.crop;
        if (width > 0 && height > 0 && left >= 0 && top >= 0 &&
            left + width <= (initialMetadata.width || Infinity) && // Basic bounds check
            top + height <= (initialMetadata.height || Infinity)
        ) {
            console.log('API: Applying crop:', params.crop);
            try {
                pImage = pImage.extract(params.crop as Region); // This reassigns pImage
                const metadataAfterCrop: Metadata = await pImage.metadata();
                console.log('API: Metadata AFTER CROP:', { width: metadataAfterCrop.width, height: metadataAfterCrop.height, format: metadataAfterCrop.format });
            } catch (cropError: any) {
                console.error("API: Error during pImage.extract():", cropError.message);
                return NextResponse.json({ error: 'Failed during crop extraction.', details: cropError.message } as ProcessImageResponse, { status: 500 });
            }
        } else {
            console.warn('API: Invalid or out-of-bounds crop parameters received:', params.crop, "Original Dims:", initialMetadata);
            // Decide if you want to proceed without crop or return an error
            // For now, we proceed, and other adjustments will apply to the uncropped image if crop is invalid.
        }
    }

    // If the effect is ONLY crop, we can skip other adjustments for focused debugging
    // if (effect === 'crop') {
    //   // For debugging, just output the (hopefully) cropped image
    //   const outputBufferOnlyCrop: Buffer = await pImage.png().toBuffer();
    //   console.log("API: Returning ONLY CROPPED image buffer. Size:", outputBufferOnlyCrop.length);
    //   return new Response(outputBufferOnlyCrop, {
    //     status: 200,
    //     headers: { 'Content-Type': 'image/png', 'Content-Disposition': `inline; filename="cropped_debug.png"`},
    //   });
    // }


    if (effect === 'grayscale') {
      pImage = pImage.grayscale();
    } else if (effect === 'applyAll' || ['brightness', 'exposure', 'temperature', 'contrast', 'saturation', 'tint', 'sharpness'].includes(effect)) {
      // Only apply these if not *just* a crop effect (or if applyAll)
      // This 'if' condition might need adjustment if crop was already handled and we don't want to re-apply other things
      // if the primary effect was 'crop'.
      // For 'applyAll', all adjustments including crop (handled above) are applied.
      
      // Exposure
      if (params.exposure !== undefined && params.exposure !== 0) {
        pImage = pImage.modulate({ brightness: exposureToBrightnessMultiplier(params.exposure) });
      }
      // Brightness
      if (params.brightness !== undefined && params.brightness !== 1) {
        pImage = pImage.modulate({ brightness: params.brightness });
      }
      // Contrast
      if (params.contrast !== undefined && params.contrast !== 0) {
        const contrastValue = params.contrast;
        const factorA = 1.0 + (contrastValue / 100.0);
        const offsetB = 128 * (1 - factorA);
        pImage = pImage.linear(factorA, offsetB);
      }
      // Temperature
      if (params.temperature !== undefined && params.temperature !== 0) {
        const tempTintColor = temperatureToRgbTint(params.temperature);
        if (tempTintColor) pImage = pImage.tint(tempTintColor);
      }
      // Saturation
      if (params.saturation !== undefined && params.saturation !== 1.0) {
        const saturationValue = Math.max(0, params.saturation);
        pImage = pImage.modulate({ saturation: saturationValue });
      }
      // Tint
      if (params.tint !== undefined && params.tint !== 0) {
        const greenMagentaTintColor = greenMagentaTintToRgb(params.tint);
        if (greenMagentaTintColor) pImage = pImage.tint(greenMagentaTintColor);
      }
      // Sharpness
      if (params.sharpness !== undefined && params.sharpness > 0) {
        const sharpnessFactor = params.sharpness / 100.0;
        const sigma = 0.3 + (sharpnessFactor * 1.7);
        pImage = pImage.sharpen({ sigma });
      }
    } else if (effect === 'resize') { 
      if (params.width || params.height) {
        pImage = pImage.resize(
          typeof params.width === 'number' ? params.width : undefined,
          typeof params.height === 'number' ? params.height : undefined
        );
      }
    }

    const outputFormat = 'png';
    const mimeType = `image/${outputFormat}`;
    const outputBuffer: Buffer = await pImage
      .toFormat(outputFormat as keyof sharp.FormatEnum) // Ensure format is valid for Sharp
      .toBuffer();

    const finalMetadata = await sharp(outputBuffer).metadata(); // Get metadata of the FINAL buffer
    console.log('API: Final output buffer metadata:', { width: finalMetadata.width, height: finalMetadata.height, size: outputBuffer.length });


    return new Response(outputBuffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename="processed_image.${outputFormat}"`,
      },
    });

  } catch (error: any) {
    console.error('API: Processing API error:', error);
    return NextResponse.json(
      { error: 'Error processing image.', details: error.message || String(error) } as ProcessImageResponse,
      { status: 500 }
    );
  }
}
