// app/api/image/process/route.ts
import { NextRequest, NextResponse } from 'next/server';
import sharp, { Sharp, Region, Metadata } from 'sharp';
import type { ImageProcessingParams, ImageEffectType, ProcessImageResponse } from '@/lib/types';

// Helper functions (exposureToBrightnessMultiplier, temperatureToRgbTint, greenMagentaTintToRgb)
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

    // --- Apply Crop First if specified in params, regardless of the main 'effect' type, if params.crop exists ---
    // This ensures crop is always from the original if a crop region is provided.
    if (params.crop) {
        const { left, top, width, height } = params.crop;
        if (width > 0 && height > 0 && left >= 0 && top >= 0 &&
            left + width <= (initialMetadata.width || Infinity) &&
            top + height <= (initialMetadata.height || Infinity)
        ) {
            console.log('API: Applying crop region from params:', params.crop);
            try {
                pImage = pImage.extract(params.crop as Region);
                const metadataAfterCrop: Metadata = await pImage.metadata(); // Get new metadata after extract
                console.log('API: Metadata AFTER CROP extraction:', { width: metadataAfterCrop.width, height: metadataAfterCrop.height });
            } catch (cropError: any) {
                console.error("API: Error during pImage.extract():", cropError.message);
                return NextResponse.json({ error: 'Failed during crop extraction.', details: cropError.message } as ProcessImageResponse, { status: 500 });
            }
        } else {
            console.warn('API: Invalid or out-of-bounds crop parameters received, skipping crop:', params.crop, "Original Dims:", initialMetadata);
            // If crop is invalid, we proceed with the uncropped image (or previously cropped if chaining correctly)
        }
    }

    // --- Apply other adjustments ---
    // This block will now run for 'applyAll', 'crop' (after crop is done), or specific adjustment effects.
    if (effect === 'applyAll' || effect === 'crop' || ['brightness', 'exposure', 'temperature', 'contrast', 'saturation', 'tint', 'sharpness'].includes(effect)) {
      
      // Exposure (Note: Sharp's modulate brightness is multiplicative, so ensure param.brightness is handled well if both are applied)
      if (params.exposure !== undefined && params.exposure !== 0) {
        console.log('API: Applying exposure:', params.exposure);
        pImage = pImage.modulate({ brightness: exposureToBrightnessMultiplier(params.exposure) });
      }
      // Brightness
      if (params.brightness !== undefined && params.brightness !== 1) { // Default brightness is 1
        console.log('API: Applying brightness:', params.brightness);
        // If exposure was also applied, this will multiply. Consider if they should be exclusive or combined differently.
        pImage = pImage.modulate({ brightness: params.brightness });
      }
      // Contrast
      if (params.contrast !== undefined && params.contrast !== 0) { // Default contrast is 0
        console.log('API: Applying contrast:', params.contrast);
        const contrastValue = params.contrast; // Assuming -100 to 100 range
        // A common way to apply contrast: normalize, scale, then de-normalize.
        // Or use linear transform: factor > 1 increases contrast, < 1 decreases.
        // factor = (100 + contrastValue) / 100
        // For Sharp: .linear(a,b) ->  a*input + b.
        // A simple linear scaling for contrast:
        const factorA = 1.0 + (contrastValue / 100.0); // e.g., contrast 20 -> 1.2, contrast -20 -> 0.8
        const offsetB = 128 * (1 - factorA); // To keep mid-tones roughly the same
        pImage = pImage.linear(factorA, offsetB);
      }
      // Temperature
      if (params.temperature !== undefined && params.temperature !== 0) {
        console.log('API: Applying temperature:', params.temperature);
        const tempTintColor = temperatureToRgbTint(params.temperature);
        if (tempTintColor) pImage = pImage.tint(tempTintColor);
      }
      // Saturation
      if (params.saturation !== undefined && params.saturation !== 1.0) { // Default saturation is 1
        console.log('API: Applying saturation:', params.saturation);
        const saturationValue = Math.max(0, params.saturation); // Ensure non-negative
        pImage = pImage.modulate({ saturation: saturationValue });
      }
      // Tint
      if (params.tint !== undefined && params.tint !== 0) {
        console.log('API: Applying tint:', params.tint);
        const greenMagentaTintColor = greenMagentaTintToRgb(params.tint);
        if (greenMagentaTintColor) pImage = pImage.tint(greenMagentaTintColor);
      }
      // Sharpness
      if (params.sharpness !== undefined && params.sharpness > 0) { // Apply only if sharpness > 0
        console.log('API: Applying sharpness:', params.sharpness);
        // Sigma calculation can be tuned. Example:
        const sharpnessFactor = params.sharpness / 100.0; // Normalize 0-100 to 0-1
        const sigma = 0.3 + (sharpnessFactor * 1.7); // Map to a reasonable sigma range (e.g., 0.3 to 2.0)
        // You might also want to control flat/jagged parameters of sharpen
        pImage = pImage.sharpen({ sigma });
      }
    }
    
    // Specific named effects that might be exclusive or applied differently
    if (effect === 'grayscale') {
      console.log('API: Applying grayscale');
      pImage = pImage.grayscale();
    } else if (effect === 'resize') {
      if (params.width || params.height) {
        console.log('API: Applying resize:', { width: params.width, height: params.height });
        pImage = pImage.resize(
          typeof params.width === 'number' ? params.width : undefined,
          typeof params.height === 'number' ? params.height : undefined
          // Consider adding options like fit, kernel, etc.
        );
      }
    }
    // Note: If 'grayscale' is an effect, and it's part of an 'applyAll' or 'crop' that also has color adjustments,
    // the order matters. Grayscale will remove color information. Typically, grayscale is an exclusive effect.
    // The current structure implies if effect is 'grayscale', other color adjustments might not apply unless
    // it's also part of the 'applyAll' condition. The frontend sends specific effect types.

    const outputFormat = 'png'; // Or 'jpeg' based on file.type or a quality setting
    const mimeType = `image/${outputFormat}`;
    const outputBuffer: Buffer = await pImage
      .toFormat(outputFormat as keyof sharp.FormatEnum)
      .toBuffer();

    const finalMetadata = await sharp(outputBuffer).metadata();
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