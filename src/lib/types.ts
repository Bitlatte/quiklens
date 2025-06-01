export interface CropRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ImageProcessingParams {
  brightness?: number;
  exposure?: number;
  temperature?: number;
  contrast?: number;
  saturation?: number;
  tint?: number;
  sharpness?: number;
  crop?: CropRegion;
  width?: number;
  height?: number;

  _sourceImageDimensionsForNextStep?: { width: number; height: number } | null; // Dimensions of the image this state will operate on
  _appliedCropForThisState?: CropRegion | null; // The crop region that *resulted* in this state's base image
}

export type ImageEffectType =
  | 'applyAll'
  | 'grayscale'
  | 'resize'
  | 'brightness'
  | 'exposure'
  | 'temperature'
  | 'contrast'
  | 'saturation'
  | 'tint'
  | 'sharpness'
  | 'crop';

export interface ProcessImagePayload {
  effect: ImageEffectType // Add more effects
  params?: ImageProcessingParams;
}

export interface ProcessImageResponse {
  message?: string; // For general messages or success
  error?: string;   // Error message
  details?: string; // Additional error details
}

export interface ImageMetadata {
  format?: string;
  width?: number;
  height?: number;
  size?: number;
}

export type AspectRatioOption = 
  | "freeform" 
  | "original" 
  | "1:1" 
  | "16:9" 
  | "9:16" 
  | "4:3" 
  | "3:4";

export const ASPECT_RATIO_OPTIONS: { value: AspectRatioOption; label: string }[] = [
  { value: "freeform", label: "Freeform" },
  { value: "original", label: "Original" },
  { value: "1:1", label: "Square" },
  { value: "16:9", label: "Landscape (16:9)" },
  { value: "9:16", label: "Portrait (9:16)" },
  { value: "4:3", label: "Standard (4:3)" },
  { value: "3:4", label: "Portrait (3:4)" },
];

// This might be used by the frontend to manage the interactive crop tool
export interface UICropState {
  x: number; // position on displayed canvas
  y: number;
  width: number; // dimensions on displayed canvas
  height: number;
  aspectRatio?: AspectRatioOption | null; // The currently selected aspect ratio string
  isCropping: boolean; // Is the crop tool active?
}