// lib/store.ts
import { create } from 'zustand';
import type {
  ImageProcessingParams,
  CropRegion,
  AspectRatioOption,
  ImageEffectType
} from './types';
import { debounce } from './utils';

export const MAX_HISTORY_LENGTH = 20;
export const MIN_CROP_SIZE = 20;
export const DEBOUNCE_DELAY = 500;

const getAspectRatioValue = (aspectRatio: AspectRatioOption): number | null => {
    if (aspectRatio === "1:1") return 1;
    if (aspectRatio === "16:9") return 16 / 9;
    if (aspectRatio === "9:16") return 9 / 16;
    if (aspectRatio === "4:3") return 4 / 3;
    if (aspectRatio === "3:4") return 3 / 4;
    return null;
};

export interface EditorState {
  selectedFile: File | null;
  currentBaseImagePreviewUrl: string | null;
  currentBaseImageDimensions: { width: number; height: number } | null;
  trueOriginalImageDimensions: { width: number; height: number } | null;
  isLoading: boolean;
  error: string | null;
  imageDisplayKeySuffix: number;
  brightness: number;
  exposure: number;
  temperature: number;
  contrast: number;
  saturation: number;
  tint: number;
  sharpness: number;
  isCropping: boolean;
  currentAspectRatio: AspectRatioOption;
  appliedCropRegionToOriginal: CropRegion | null;
  uiCropRegion: Partial<CropRegion> | null;
  history: ImageProcessingParams[];
  currentHistoryIndex: number;
  canUndo: () => boolean;
  canRedo: () => boolean;
  canExport: () => boolean;
  isPristineState: () => boolean;
  setSelectedFile: (file: File | null) => void;
  resetApplicationState: (newFile?: File) => Promise<void>;
  setBrightness: (value: number) => void;
  setExposure: (value: number) => void;
  setTemperature: (value: number) => void;
  setContrast: (value: number) => void;
  setSaturation: (value: number) => void;
  setTint: (value: number) => void;
  setSharpness: (value: number) => void;
  toggleCropMode: () => void;
  setCurrentAspectRatio: (aspectRatio: AspectRatioOption) => void;
  setUiCropRegion: (region: Partial<CropRegion> | null) => void;
  applyCrop: () => Promise<void>;
  applyNamedEffect: (effect: ImageEffectType, params?: Partial<Omit<ImageProcessingParams, 'crop'>>) => Promise<void>;
  undo: () => void;
  redo: () => void;
  setError: (message: string | null) => void;
  processImageWithCurrentAdjustments: (shouldAddToHistory: boolean) => Promise<void>;
}

const defaultSliders = { brightness: 1, exposure: 0, temperature: 0, contrast: 0, saturation: 1, tint: 0, sharpness: 0 };

export const useEditorStore = create<EditorState>((set, get) => {
  const _getCurrentUserParamsSnapshot = (): ImageProcessingParams => {
    const state = get();
    return {
      brightness: state.brightness,
      exposure: state.exposure,
      temperature: state.temperature,
      contrast: state.contrast,
      saturation: state.saturation,
      tint: state.tint,
      sharpness: state.sharpness,
      crop: state.appliedCropRegionToOriginal || undefined,
    };
  };

  const _addProcessedStateToHistory = (processedParams: ImageProcessingParams) => {
    set(state => {
      const newHistoryBase = state.history.slice(0, state.currentHistoryIndex + 1);
      const historyEntry: ImageProcessingParams = {
        ...processedParams,
        _sourceImageDimensionsForNextStep: state.currentBaseImageDimensions,
        _appliedCropForThisState: processedParams.crop || null,
      };
      const updatedHistory = [...newHistoryBase, historyEntry];
      let finalHistory = updatedHistory;
      if (updatedHistory.length > MAX_HISTORY_LENGTH) {
        finalHistory = updatedHistory.slice(updatedHistory.length - MAX_HISTORY_LENGTH);
      }
      return { history: finalHistory, currentHistoryIndex: finalHistory.length - 1 };
    });
  };

  const _executeApiProcessing = async (
    paramsForAPI: ImageProcessingParams,
    effectForAPI: ImageEffectType,
    shouldAddToHistory: boolean
  ): Promise<void> => {
    const { selectedFile, currentBaseImagePreviewUrl } = get();
    if (!selectedFile) {
      set({ isLoading: false }); return;
    }
    set({ isLoading: true, error: null });
    const formData = new FormData();
    formData.append('imageFile', selectedFile);
    formData.append('effect', effectForAPI);
    const { ...apiParamsClean } = paramsForAPI;
    formData.append('params', JSON.stringify(apiParamsClean));

    try {
      const response = await fetch('/api/image/process', { method: 'POST', body: formData });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: `Processing failed: ${response.statusText}` }));
        throw new Error(errData.error || 'Image processing failed.');
      }
      const imageBlob = await response.blob();
      const newBlobUrl = URL.createObjectURL(imageBlob);

      if (currentBaseImagePreviewUrl && currentBaseImagePreviewUrl !== newBlobUrl) {
        URL.revokeObjectURL(currentBaseImagePreviewUrl);
      }

      let newBaseDimensions = get().trueOriginalImageDimensions;
      if (apiParamsClean.crop && apiParamsClean.crop.width > 0 && apiParamsClean.crop.height > 0) {
        newBaseDimensions = { width: apiParamsClean.crop.width, height: apiParamsClean.crop.height };
      } else {
         const currentAppliedCrop = get().appliedCropRegionToOriginal;
         if(currentAppliedCrop && effectForAPI === 'applyAll' && !apiParamsClean.crop) {
            newBaseDimensions = {width: currentAppliedCrop.width, height: currentAppliedCrop.height};
         } else if (!currentAppliedCrop && get().trueOriginalImageDimensions) {
            newBaseDimensions = get().trueOriginalImageDimensions;
         }
      }

      set(state => ({
        currentBaseImagePreviewUrl: newBlobUrl,
        currentBaseImageDimensions: newBaseDimensions, // These are dimensions of the newBlobUrl
        imageDisplayKeySuffix: state.imageDisplayKeySuffix + 1,
      }));

      if (shouldAddToHistory) {
        _addProcessedStateToHistory(paramsForAPI);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Store] _executeApiProcessing: Error:', message);
      set({ error: message || 'An unknown error occurred.' });
    } finally {
      set({ isLoading: false });
    }
  };

  const _debouncedProcessSliderChanges = debounce(() => {
    const state = get();
    if (state.isCropping || !state.selectedFile) return;
    const currentParams = _getCurrentUserParamsSnapshot();
    _executeApiProcessing(currentParams, 'applyAll', true);
  }, DEBOUNCE_DELAY);

  const _applyStateFromHistory = (params: ImageProcessingParams) => {
    set({
        brightness: params.brightness ?? defaultSliders.brightness,
        exposure: params.exposure ?? defaultSliders.exposure,
        temperature: params.temperature ?? defaultSliders.temperature,
        contrast: params.contrast ?? defaultSliders.contrast,
        saturation: params.saturation ?? defaultSliders.saturation,
        tint: params.tint ?? defaultSliders.tint,
        sharpness: params.sharpness ?? defaultSliders.sharpness,
        appliedCropRegionToOriginal: params.crop || null,
        isCropping: false,
        uiCropRegion: null,
    });
  };

  return {
    ...defaultSliders,
    selectedFile: null, currentBaseImagePreviewUrl: null, currentBaseImageDimensions: null,
    trueOriginalImageDimensions: null, isLoading: false, error: null, imageDisplayKeySuffix: 0,
    isCropping: false, currentAspectRatio: "freeform", appliedCropRegionToOriginal: null, uiCropRegion: null,
    history: [], currentHistoryIndex: -1,

    canUndo: () => get().currentHistoryIndex > 0,
    canRedo: () => get().currentHistoryIndex < get().history.length - 1,
    canExport: () => !!get().currentBaseImagePreviewUrl,
    isPristineState: () => {
      const { currentHistoryIndex, appliedCropRegionToOriginal, brightness, exposure, temperature, contrast, saturation, tint, sharpness } = get();
      return ( currentHistoryIndex <= 0 && !appliedCropRegionToOriginal && brightness === defaultSliders.brightness && exposure === defaultSliders.exposure && temperature === defaultSliders.temperature && contrast === defaultSliders.contrast && saturation === defaultSliders.saturation && tint === defaultSliders.tint && sharpness === defaultSliders.sharpness );
    },

    setSelectedFile: (file) => {
      const oldUrl = get().currentBaseImagePreviewUrl;
      if (oldUrl) { URL.revokeObjectURL(oldUrl); }
      set({
        selectedFile: file, 
        isLoading: true, error: null, currentBaseImagePreviewUrl: null,
        currentBaseImageDimensions: null, trueOriginalImageDimensions: null,
        appliedCropRegionToOriginal: null, uiCropRegion: null, isCropping: false,
        history: [], currentHistoryIndex: -1, ...defaultSliders,
        imageDisplayKeySuffix: get().imageDisplayKeySuffix + 1
      });
      get().resetApplicationState(file || undefined);
    },

    resetApplicationState: async (newFile?: File) => {
      set(state => ({
        ...defaultSliders, appliedCropRegionToOriginal: null, isCropping: false,
        currentAspectRatio: "freeform", uiCropRegion: null, error: null,
        imageDisplayKeySuffix: state.imageDisplayKeySuffix + 1,
      }));

      if (newFile) {
        const rawExtensions = /\.(cr2|cr3|nef|arw|orf|raf|rw2|pef|srw|dng)$/i;
        const isRawFile = rawExtensions.test(newFile.name);

        if (isRawFile) {
          set({ isLoading: true, error: null, currentBaseImagePreviewUrl: null, currentBaseImageDimensions: null, trueOriginalImageDimensions: null });
          console.log("[Store] RAW file detected:", newFile.name);
          const formData = new FormData();
          formData.append('rawImageFile', newFile);

          try {
            const response = await fetch('/api/image/raw-preview', { method: 'POST', body: formData });
            console.log('[Store] Response from /api/image/raw-preview status:', response.status);
            if (!response.ok) {
              const errData = await response.json().catch(() => ({ error: `Server error ${response.status}` }));
              throw new Error(errData.error || `RAW preview failed (status: ${response.status})`);
            }
            
            const data = await response.json();
            console.log('[Store] Data received from /api/image/raw-preview:', data);
            
            if (!data.previewDataUrl || 
                typeof data.originalWidth !== 'number' || typeof data.originalHeight !== 'number' ||
                typeof data.previewWidth !== 'number' || typeof data.previewHeight !== 'number') {
              console.error('[Store] Invalid preview data structure or types:', data);
              throw new Error('Invalid preview data received from server for RAW file.');
            }

            const originalDims = { width: data.originalWidth, height: data.originalHeight };
            const previewDims = { width: data.previewWidth, height: data.previewHeight };

            const initialHistoryEntry: ImageProcessingParams = {
              ...defaultSliders, crop: undefined,
              _sourceImageDimensionsForNextStep: previewDims,
              _appliedCropForThisState: null,
            };
            set({
              trueOriginalImageDimensions: originalDims,
              currentBaseImageDimensions: previewDims,
              currentBaseImagePreviewUrl: data.previewDataUrl,
              history: [initialHistoryEntry], currentHistoryIndex: 0,
              isLoading: false, error: null,
            });
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("[Store] Error fetching/processing RAW preview:", message);
            set({
              error: `Could not load RAW file preview: ${message}. Adjustments might still work on the full RAW.`,
              isLoading: false, currentBaseImagePreviewUrl: null,
              currentBaseImageDimensions: null, trueOriginalImageDimensions: null, // Dimensions unknown on failure
            });
          }
        } else { 
          set({ isLoading: true, error: null });
          const objectURL = URL.createObjectURL(newFile);
          const img = new Image();
          img.onload = () => {
            URL.revokeObjectURL(objectURL); 
            const dims = { width: img.naturalWidth, height: img.naturalHeight };
            const initialHistoryEntry: ImageProcessingParams = {
              ...defaultSliders, crop: undefined,
              _sourceImageDimensionsForNextStep: dims,
              _appliedCropForThisState: null,
            };
            // For non-RAW, create a new ObjectURL for the store to own for consistency,
            // or ensure the one used for Image() is not prematurely revoked if it's the same.
            const displayUrl = URL.createObjectURL(newFile); 
            set({
              trueOriginalImageDimensions: dims, currentBaseImageDimensions: dims,
              currentBaseImagePreviewUrl: displayUrl,
              history: [initialHistoryEntry], currentHistoryIndex: 0,
              isLoading: false, error: null,
            });
          };
          img.onerror = () => {
              URL.revokeObjectURL(objectURL);
              set({
                  error: "Failed to load image details.", isLoading: false, selectedFile: null,
                  currentBaseImagePreviewUrl: null, trueOriginalImageDimensions: null, currentBaseImageDimensions: null,
              });
          }
          img.src = objectURL;
        }
      } else { 
        set({
          selectedFile: null, currentBaseImagePreviewUrl: null,
          trueOriginalImageDimensions: null, currentBaseImageDimensions: null,
          history: [{...defaultSliders, crop: undefined, _sourceImageDimensionsForNextStep: null, _appliedCropForThisState: null }],
          currentHistoryIndex: 0, isLoading: false, error: null,
        });
      }
    },

    setBrightness: (value) => { set({ brightness: value }); _debouncedProcessSliderChanges(); },
    setExposure: (value) => { set({ exposure: value }); _debouncedProcessSliderChanges(); },
    setTemperature: (value) => { set({ temperature: value }); _debouncedProcessSliderChanges(); },
    setContrast: (value) => { set({ contrast: value }); _debouncedProcessSliderChanges(); },
    setSaturation: (value) => { set({ saturation: value }); _debouncedProcessSliderChanges(); },
    setTint: (value) => { set({ tint: value }); _debouncedProcessSliderChanges(); },
    setSharpness: (value) => { set({ sharpness: value }); _debouncedProcessSliderChanges(); },

    toggleCropMode: () => {
      set(state => {
        if (!state.selectedFile) return {};
        const newIsCropping = !state.isCropping;
        return {
          isCropping: newIsCropping,
          uiCropRegion: newIsCropping && state.currentBaseImageDimensions ? { left: 0, top: 0, width: state.currentBaseImageDimensions.width, height: state.currentBaseImageDimensions.height } : null,
          currentAspectRatio: newIsCropping ? "freeform" : state.currentAspectRatio
        };
      });
    },
    setCurrentAspectRatio: (aspectRatio) => {
        set(state => {
            if (!state.isCropping || !state.uiCropRegion || !state.currentBaseImageDimensions) { return { currentAspectRatio: aspectRatio }; }
            let { left = 0, top = 0, width = state.currentBaseImageDimensions.width, height = state.currentBaseImageDimensions.height } = state.uiCropRegion;
            const baseWidth = state.currentBaseImageDimensions.width; const baseHeight = state.currentBaseImageDimensions.height;
            const arValue = getAspectRatioValue(aspectRatio);
            if (aspectRatio === "original" && state.trueOriginalImageDimensions) {
                const trueOriginalAR = state.trueOriginalImageDimensions.width / state.trueOriginalImageDimensions.height;
                width = baseWidth; height = width / trueOriginalAR;
                if (height > baseHeight) { height = baseHeight; width = height * trueOriginalAR; }
                left = (baseWidth - width) / 2; top = (baseHeight - height) / 2;
            } else if (arValue) {
                let tempWidth = width; let tempHeight = tempWidth / arValue;
                if (left + tempWidth > baseWidth || top + tempHeight > baseHeight) {
                    tempHeight = height; tempWidth = tempHeight * arValue;
                    if (left + tempWidth > baseWidth || top + tempHeight > baseHeight) {
                        const scaleRatioWidth = (baseWidth - left) / width; const scaleRatioHeight = (baseHeight - top) / height;
                        if (width * scaleRatioHeight * arValue <= baseWidth - left) { tempWidth = width * scaleRatioHeight; tempHeight = height * scaleRatioHeight; }
                        else { tempWidth = width * scaleRatioWidth; tempHeight = height * scaleRatioWidth; }
                    }
                }
                 width = tempWidth; height = tempHeight;
            } else if (aspectRatio === "freeform") { return { currentAspectRatio: aspectRatio }; }
            width = Math.max(MIN_CROP_SIZE, Math.min(width, baseWidth - left)); height = Math.max(MIN_CROP_SIZE, Math.min(height, baseHeight - top));
            if (arValue) {
                const currentAR = width / height;
                if (Math.abs(currentAR - arValue) > 0.01) {
                    if (currentAR > arValue) { height = width / arValue; } else { width = height * arValue; }
                    width = Math.max(MIN_CROP_SIZE, Math.min(width, baseWidth - left)); height = Math.max(MIN_CROP_SIZE, Math.min(height, baseHeight - top));
                }
            }
            return { currentAspectRatio: aspectRatio, uiCropRegion: { left: Math.round(left), top: Math.round(top), width: Math.round(width), height: Math.round(height) }};
        });
    },
    setUiCropRegion: (region) => set({ uiCropRegion: region }),

    applyCrop: async () => {
      const { 
        uiCropRegion, 
        currentBaseImageDimensions,  // Dimensions of the current preview
        trueOriginalImageDimensions,   // Dimensions of the true original image
        appliedCropRegionToOriginal,   // The first crop's region, relative to trueOriginal
        selectedFile 
      } = get();

      if (!uiCropRegion || !currentBaseImageDimensions || !trueOriginalImageDimensions || !selectedFile) {
        set({ error: "Cannot apply crop: required image data for scaling/processing is missing." });
        return;
      }
      
      const validatedUiCrop: CropRegion = {
          left: Math.max(0, Math.round(uiCropRegion.left ?? 0)),
          top: Math.max(0, Math.round(uiCropRegion.top ?? 0)),
          width: Math.max(MIN_CROP_SIZE, Math.round(uiCropRegion.width ?? currentBaseImageDimensions.width)),
          height: Math.max(MIN_CROP_SIZE, Math.round(uiCropRegion.height ?? currentBaseImageDimensions.height)),
      };
      validatedUiCrop.width = Math.min(validatedUiCrop.width, currentBaseImageDimensions.width - validatedUiCrop.left);
      validatedUiCrop.height = Math.min(validatedUiCrop.height, currentBaseImageDimensions.height - validatedUiCrop.top);

      if (validatedUiCrop.width < MIN_CROP_SIZE || validatedUiCrop.height < MIN_CROP_SIZE) {
          set({ error: "Crop dimensions selected on the preview are too small." });
          return;
      }

      let finalCropForApi: CropRegion;

      if (appliedCropRegionToOriginal) {
          // This is a second (or subsequent) crop.
          // uiCropRegion is relative to currentBaseImageDimensions, which shows the result of appliedCropRegionToOriginal.
          // We need to scale uiCropRegion to the dimensions of appliedCropRegionToOriginal.
          const scaleToFirstCropX = appliedCropRegionToOriginal.width / currentBaseImageDimensions.width;
          const scaleToFirstCropY = appliedCropRegionToOriginal.height / currentBaseImageDimensions.height;

          const selectionInFirstCropCoords = {
              left: validatedUiCrop.left * scaleToFirstCropX,
              top: validatedUiCrop.top * scaleToFirstCropY,
              width: validatedUiCrop.width * scaleToFirstCropX,
              height: validatedUiCrop.height * scaleToFirstCropY,
          };

          finalCropForApi = {
              left: Math.round(appliedCropRegionToOriginal.left + selectionInFirstCropCoords.left),
              top: Math.round(appliedCropRegionToOriginal.top + selectionInFirstCropCoords.top),
              width: Math.round(selectionInFirstCropCoords.width),
              height: Math.round(selectionInFirstCropCoords.height),
          };
          console.log("[Store applyCrop - Re-crop] Preview Dims:", currentBaseImageDimensions);
          console.log("[Store applyCrop - Re-crop] First Crop Dims (appliedToOrig):", appliedCropRegionToOriginal);
          console.log("[Store applyCrop - Re-crop] UI Selection on Preview:", validatedUiCrop);
          console.log("[Store applyCrop - Re-crop] Scale Factors to First Crop:", scaleToFirstCropX, scaleToFirstCropY);
          console.log("[Store applyCrop - Re-crop] Selection in First Crop Coords:", selectionInFirstCropCoords);

      } else {
          // This is the first crop.
          // uiCropRegion is relative to currentBaseImageDimensions, which is a preview of trueOriginalImageDimensions.
          const scaleToOriginalX = trueOriginalImageDimensions.width / currentBaseImageDimensions.width;
          const scaleToOriginalY = trueOriginalImageDimensions.height / currentBaseImageDimensions.height;

          finalCropForApi = {
              left: Math.round(validatedUiCrop.left * scaleToOriginalX),
              top: Math.round(validatedUiCrop.top * scaleToOriginalY),
              width: Math.round(validatedUiCrop.width * scaleToOriginalX),
              height: Math.round(validatedUiCrop.height * scaleToOriginalY),
          };
          console.log("[Store applyCrop - First crop] Preview Dims:", currentBaseImageDimensions);
          console.log("[Store applyCrop - First crop] True Original Dims:", trueOriginalImageDimensions);
          console.log("[Store applyCrop - First crop] UI Selection on Preview:", validatedUiCrop);
          console.log("[Store applyCrop - First crop] Scale Factors to Original:", scaleToOriginalX, scaleToOriginalY);
      }
      
      console.log("[Store applyCrop] Final crop for API:", finalCropForApi);

      // Final clamping to the true original dimensions
      finalCropForApi.left = Math.max(0, finalCropForApi.left);
      finalCropForApi.top = Math.max(0, finalCropForApi.top);
      finalCropForApi.width = Math.max(MIN_CROP_SIZE, Math.min(finalCropForApi.width, trueOriginalImageDimensions.width - finalCropForApi.left));
      finalCropForApi.height = Math.max(MIN_CROP_SIZE, Math.min(finalCropForApi.height, trueOriginalImageDimensions.height - finalCropForApi.top));

      if (finalCropForApi.width < MIN_CROP_SIZE || finalCropForApi.height < MIN_CROP_SIZE) {
          set({ error: "Final calculated crop dimensions for the original image are too small." }); 
          return;
      }
      console.log("[Store applyCrop] Final clamped crop for API:", finalCropForApi);

      const currentSliders = _getCurrentUserParamsSnapshot();
      const paramsForProcessing: ImageProcessingParams = { ...currentSliders, crop: finalCropForApi };
      
      set({ appliedCropRegionToOriginal: finalCropForApi }); // Update the current "master" crop
      await _executeApiProcessing(paramsForProcessing, 'crop', true);
      set({ isCropping: false, uiCropRegion: null });
    },

    applyNamedEffect: async (effect, params) => {
        const baseParams = _getCurrentUserParamsSnapshot();
        const finalParams: ImageProcessingParams = params ? {...baseParams, ...params } : baseParams;
        await _executeApiProcessing(finalParams, effect, true);
    },
    undo: () => {
      const { currentHistoryIndex, history } = get();
      if (currentHistoryIndex > 0) {
        const newIndex = currentHistoryIndex - 1;
        const paramsToRestore = history[newIndex];
        _applyStateFromHistory(paramsToRestore);
        set({ currentHistoryIndex: newIndex });
        _executeApiProcessing(paramsToRestore, 'applyAll', false);
      }
    },
    redo: () => {
      const { currentHistoryIndex, history } = get();
      if (currentHistoryIndex < history.length - 1) {
        const newIndex = currentHistoryIndex + 1;
        const paramsToRestore = history[newIndex];
        _applyStateFromHistory(paramsToRestore);
        set({ currentHistoryIndex: newIndex });
        _executeApiProcessing(paramsToRestore, 'applyAll', false);
      }
    },
    setError: (message) => set({ error: message }),
    processImageWithCurrentAdjustments: async (shouldAddToHistory = true) => {
      const params = _getCurrentUserParamsSnapshot();
      await _executeApiProcessing(params, 'applyAll', shouldAddToHistory);
    },
  };
});