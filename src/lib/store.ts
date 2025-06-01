// lib/store.ts
import { create } from 'zustand';
import type {
  ImageProcessingParams,
  CropRegion,
  AspectRatioOption,
  ImageEffectType
} from './types';
import { debounce } from '@/lib/utils';

export const MAX_HISTORY_LENGTH = 20;
export const MIN_CROP_SIZE = 20;
export const DEBOUNCE_DELAY = 500;

// --- Helper: Get Aspect Ratio Value ---
const getAspectRatioValue = (aspectRatio: AspectRatioOption): number | null => {
    if (aspectRatio === "1:1") return 1;
    if (aspectRatio === "16:9") return 16 / 9;
    if (aspectRatio === "9:16") return 9 / 16;
    if (aspectRatio === "4:3") return 4 / 3;
    if (aspectRatio === "3:4") return 3 / 4;
    return null;
};

// --- State Interface ---
export interface EditorState {
  // Image and File State
  selectedFile: File | null;
  currentBaseImagePreviewUrl: string | null; // URL of the image currently displayed (original or after a crop)
  currentBaseImageDimensions: { width: number; height: number } | null; // Dimensions of currentBaseImagePreviewUrl
  trueOriginalImageDimensions: { width: number; height: number } | null; // Dimensions of the initially uploaded file

  // UI State
  isLoading: boolean;
  error: string | null;
  imageDisplayKeySuffix: number; // To force re-mount of ImageDisplayArea

  // Adjustment States (conceptually applied to the true original, then cropped if a crop exists)
  brightness: number;
  exposure: number;
  temperature: number;
  contrast: number;
  saturation: number;
  tint: number;
  sharpness: number;

  // Crop States
  isCropping: boolean;
  currentAspectRatio: AspectRatioOption;
  appliedCropRegionToOriginal: CropRegion | null; // The active crop region, relative to trueOriginalImageDimensions
  uiCropRegion: Partial<CropRegion> | null; // For interactive tool, relative to currentBaseImageDimensions

  // History States
  history: ImageProcessingParams[]; // Stores snapshots of all adjustable params (sliders + appliedCropRegionToOriginal)
  currentHistoryIndex: number;

  // Derived States (Getters)
  canUndo: () => boolean;
  canRedo: () => boolean;
  canExport: () => boolean;
  isPristineState: () => boolean;

  // Actions
  setSelectedFile: (file: File | null) => void;
  resetApplicationState: (newFile?: File) => void; // Resets everything for a new image or clear

  // Slider Setters - these will trigger debounced processing
  setBrightness: (value: number) => void;
  setExposure: (value: number) => void;
  setTemperature: (value: number) => void;
  setContrast: (value: number) => void;
  setSaturation: (value: number) => void;
  setTint: (value: number) => void;
  setSharpness: (value: number) => void;

  // Crop UI Actions
  toggleCropMode: () => void;
  setCurrentAspectRatio: (aspectRatio: AspectRatioOption) => void;
  setUiCropRegion: (region: Partial<CropRegion> | null) => void;

  // Explicit Action to Apply the Current UI Crop
  applyCrop: () => Promise<void>;
  // Action to apply a specific effect
  applyNamedEffect: (effect: ImageEffectType, params?: Partial<Omit<ImageProcessingParams, 'crop'>>) => Promise<void>;

  // History Actions
  undo: () => void;
  redo: () => void;

  // Utility
  setError: (message: string | null) => void;

  // Method to trigger processing with current state, e.g., for debounced hook
  processImageWithCurrentAdjustments: (shouldAddToHistory: boolean) => Promise<void>;
}

// --- Store Implementation ---
export const useEditorStore = create<EditorState>((set, get) => {

  // Helper to get a snapshot of all current user-adjustable parameters
  // This includes slider values and the currently active crop (appliedCropRegionToOriginal)
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

  // Helper to add a processed state to history
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
      console.log("[Store: _addProcessedStateToHistory] New index:", finalHistory.length - 1, "Entry:", historyEntry);
      return {
          history: finalHistory,
          currentHistoryIndex: finalHistory.length - 1
      };
    });
  };

  // Core API call and state update logic
  const _executeApiProcessing = async (
    paramsForAPI: ImageProcessingParams,
    effectForAPI: ImageEffectType,
    shouldAddToHistory: boolean
  ): Promise<void> => {
    const { selectedFile, currentBaseImagePreviewUrl, trueOriginalImageDimensions: currentTrueOriginalImageDimensions } = get(); // Renamed for clarity in this scope
    if (!selectedFile) {
      console.warn("Store._executeApiProcessing: No file selected.");
      set({ isLoading: false }); return;
    }
    if (!currentTrueOriginalImageDimensions && effectForAPI !== 'applyAll' && !paramsForAPI.crop) {
        console.warn("Store._executeApiProcessing: True original dimensions not available for an operation that might depend on it.");
    }

    console.log(`[Store] _executeApiProcessing: Effect: ${effectForAPI}, API Params:`, paramsForAPI);
    set({ isLoading: true, error: null });

    const formData = new FormData();
    formData.append('imageFile', selectedFile);
    formData.append('effect', effectForAPI);
    const { _sourceImageDimensionsForNextStep, _appliedCropForThisState, ...apiParamsClean } = paramsForAPI;
    formData.append('params', JSON.stringify(apiParamsClean));

    try {
      const response = await fetch('/api/image/process', { method: 'POST', body: formData });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: `Processing failed: ${response.statusText}` }));
        throw new Error(errData.error || 'Image processing failed.');
      }
      const imageBlob = await response.blob();
      const newBlobUrl = URL.createObjectURL(imageBlob);
      console.log('[Store] _executeApiProcessing: API returned. New Blob URL:', newBlobUrl);

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
        currentBaseImageDimensions: newBaseDimensions,
        imageDisplayKeySuffix: state.imageDisplayKeySuffix + 1,
      }));

      if (shouldAddToHistory) {
        _addProcessedStateToHistory(paramsForAPI);
      }
    } catch (err: any) {
      console.error('[Store] _executeApiProcessing: Error:', err);
      set({ error: err.message || 'An unknown error occurred.' });
    } finally {
      set({ isLoading: false });
    }
  };

  const _debouncedProcessSliderChanges = debounce(() => {
    const state = get();
    if (state.isCropping || !state.selectedFile) return;
    console.log("[Store] Debounced processing for slider changes.");
    const currentParams = _getCurrentUserParamsSnapshot();
    _executeApiProcessing(currentParams, 'applyAll', true);
  }, DEBOUNCE_DELAY);

  const _applyStateFromHistory = (params: ImageProcessingParams) => {
    set({
        brightness: params.brightness ?? 1,
        exposure: params.exposure ?? 0,
        temperature: params.temperature ?? 0,
        contrast: params.contrast ?? 0,
        saturation: params.saturation ?? 1,
        tint: params.tint ?? 0,
        sharpness: params.sharpness ?? 0,
        appliedCropRegionToOriginal: params.crop || null,
        isCropping: false,
        uiCropRegion: null,
    });
  };


  return {
    selectedFile: null, currentBaseImagePreviewUrl: null, currentBaseImageDimensions: null,
    trueOriginalImageDimensions: null, isLoading: false, error: null, imageDisplayKeySuffix: 0,
    brightness: 1, exposure: 0, temperature: 0, contrast: 0, saturation: 1, tint: 0, sharpness: 0,
    isCropping: false, currentAspectRatio: "freeform", appliedCropRegionToOriginal: null, uiCropRegion: null,
    history: [], currentHistoryIndex: -1,

    canUndo: () => get().currentHistoryIndex > 0,
    canRedo: () => get().currentHistoryIndex < get().history.length - 1,
    canExport: () => !!get().currentBaseImagePreviewUrl,
    isPristineState: () => {
        const {
            currentHistoryIndex,
            appliedCropRegionToOriginal,
            brightness, exposure, temperature,
            contrast, saturation, tint, sharpness
        } = get();

        return (
            currentHistoryIndex <= 0 &&
            !appliedCropRegionToOriginal &&
            brightness === 1 &&
            exposure === 0 &&
            temperature === 0 &&
            contrast === 0 &&
            saturation === 1 &&
            tint === 0 &&
            sharpness === 0
        )
    },

    setSelectedFile: (file) => {
      const oldUrl = get().currentBaseImagePreviewUrl;
      if (oldUrl) URL.revokeObjectURL(oldUrl);
      set({ selectedFile: file, isLoading: true });
      get().resetApplicationState(file || undefined);
    },

    resetApplicationState: (newFile?: File) => {
      const defaultSliders = { brightness: 1, exposure: 0, temperature: 0, contrast: 0, saturation: 1, tint: 0, sharpness: 0 };
      set(state => ({
        ...defaultSliders,
        appliedCropRegionToOriginal: null, isCropping: false, currentAspectRatio: "freeform",
        uiCropRegion: null, error: null,
        imageDisplayKeySuffix: state.imageDisplayKeySuffix + 1,
      }));

      if (newFile) {
        const objectURL = URL.createObjectURL(newFile);
        const img = new Image();
        img.onload = () => {
          const dims = { width: img.naturalWidth, height: img.naturalHeight };
          const initialHistoryEntry: ImageProcessingParams = {
            ...defaultSliders, crop: undefined,
            _sourceImageDimensionsForNextStep: dims,
            _appliedCropForThisState: null,
          };
          set({
            trueOriginalImageDimensions: dims, currentBaseImageDimensions: dims,
            currentBaseImagePreviewUrl: objectURL,
            history: [initialHistoryEntry], currentHistoryIndex: 0,
            isLoading: false,
          });
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectURL);
            set({
                error: "Failed to load image details.",
                isLoading: false,
                selectedFile: null,
                currentBaseImagePreviewUrl: null, trueOriginalImageDimensions: null, currentBaseImageDimensions: null,
                history: [{...defaultSliders, crop: undefined, _sourceImageDimensionsForNextStep: null, _appliedCropForThisState: null }],
                currentHistoryIndex: 0,
            });
        }
        img.src = objectURL;
      } else {
        set({
          currentBaseImagePreviewUrl: null, trueOriginalImageDimensions: null, currentBaseImageDimensions: null,
          selectedFile: null,
          history: [{...defaultSliders, crop: undefined, _sourceImageDimensionsForNextStep: null, _appliedCropForThisState: null }],
          currentHistoryIndex: 0,
          isLoading: false,
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
        let newUiCropRegion: Partial<CropRegion> | null = null;

        if (newIsCropping && state.currentBaseImageDimensions) {
          newUiCropRegion = {
              left: 0, top: 0,
              width: state.currentBaseImageDimensions.width,
              height: state.currentBaseImageDimensions.height
          };
        } else {
          newUiCropRegion = null;
        }
        return {
          isCropping: newIsCropping,
          uiCropRegion: newUiCropRegion,
          currentAspectRatio: newIsCropping ? "freeform" : state.currentAspectRatio
        };
      });
    },
    setCurrentAspectRatio: (aspectRatio) => {
        set(state => {
            if (!state.isCropping || !state.uiCropRegion || !state.currentBaseImageDimensions) {
                return { currentAspectRatio: aspectRatio };
            }

            let { left = 0, top = 0, width = state.currentBaseImageDimensions.width, height = state.currentBaseImageDimensions.height } = state.uiCropRegion;
            const baseWidth = state.currentBaseImageDimensions.width;
            const baseHeight = state.currentBaseImageDimensions.height;
            const arValue = getAspectRatioValue(aspectRatio);

            if (aspectRatio === "original" && state.trueOriginalImageDimensions) {
                const trueOriginalAR = state.trueOriginalImageDimensions.width / state.trueOriginalImageDimensions.height;
                width = baseWidth;
                height = width / trueOriginalAR;
                if (height > baseHeight) {
                    height = baseHeight;
                    width = height * trueOriginalAR;
                }
                left = (baseWidth - width) / 2;
                top = (baseHeight - height) / 2;
            } else if (arValue) {
                let tempWidth = width; // Start with current width
                let tempHeight = tempWidth / arValue;

                if (left + tempWidth > baseWidth || top + tempHeight > baseHeight) {
                    // If fitting by width overflows, try fitting by height
                    tempHeight = height;
                    tempWidth = tempHeight * arValue;

                    // If still overflowing, choose the smaller scale to fit
                    if (left + tempWidth > baseWidth || top + tempHeight > baseHeight) {
                        const scaleRatioWidth = (baseWidth - left) / width;
                        const scaleRatioHeight = (baseHeight - top) / height;
                        if (width * scaleRatioHeight * arValue <= baseWidth - left) { // if fitting to new height works
                            tempWidth = width * scaleRatioHeight;
                            tempHeight = height * scaleRatioHeight;
                        } else {
                            tempWidth = width * scaleRatioWidth;
                            tempHeight = height * scaleRatioWidth;
                        }
                    }
                }
                 width = tempWidth;
                 height = tempHeight;
            } else if (aspectRatio === "freeform") {
                return { currentAspectRatio: aspectRatio };
            }

            width = Math.max(MIN_CROP_SIZE, Math.min(width, baseWidth - left));
            height = Math.max(MIN_CROP_SIZE, Math.min(height, baseHeight - top));

            if (arValue) {
                const currentAR = width / height;
                if (Math.abs(currentAR - arValue) > 0.01) {
                    if (currentAR > arValue) {
                        height = width / arValue;
                    } else {
                        width = height * arValue;
                    }
                    width = Math.max(MIN_CROP_SIZE, Math.min(width, baseWidth - left));
                    height = Math.max(MIN_CROP_SIZE, Math.min(height, baseHeight - top));
                }
            }

            return { currentAspectRatio: aspectRatio, uiCropRegion: { left: Math.round(left), top: Math.round(top), width: Math.round(width), height: Math.round(height) }};
        });
    },
    setUiCropRegion: (region) => set({ uiCropRegion: region }),

    applyCrop: async () => {
      const { uiCropRegion, currentBaseImageDimensions, trueOriginalImageDimensions, appliedCropRegionToOriginal, selectedFile } = get(); // Correctly destructure selectedFile
      if (!uiCropRegion || !currentBaseImageDimensions || !trueOriginalImageDimensions || !selectedFile) {
        set({ error: "Cannot apply crop: required image data or selection is missing." }); return;
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
          set({ error: "Crop dimensions are too small based on the current view." }); return;
      }

      let finalCropForApi: CropRegion;
      if (appliedCropRegionToOriginal) {
          finalCropForApi = {
              left: Math.round(appliedCropRegionToOriginal.left + validatedUiCrop.left),
              top: Math.round(appliedCropRegionToOriginal.top + validatedUiCrop.top),
              width: Math.round(validatedUiCrop.width),
              height: Math.round(validatedUiCrop.height),
          };
      } else {
          finalCropForApi = { ...validatedUiCrop };
      }

      finalCropForApi.left = Math.max(0, finalCropForApi.left);
      finalCropForApi.top = Math.max(0, finalCropForApi.top);
      finalCropForApi.width = Math.max(MIN_CROP_SIZE, Math.min(finalCropForApi.width, trueOriginalImageDimensions.width - finalCropForApi.left));
      finalCropForApi.height = Math.max(MIN_CROP_SIZE, Math.min(finalCropForApi.height, trueOriginalImageDimensions.height - finalCropForApi.top));

      if (finalCropForApi.width < MIN_CROP_SIZE || finalCropForApi.height < MIN_CROP_SIZE) {
          set({ error: "Invalid crop dimensions after final validation against original image." }); return;
      }

      const currentSliders = _getCurrentUserParamsSnapshot();
      const paramsForProcessing: ImageProcessingParams = { ...currentSliders, crop: finalCropForApi };

      set({ appliedCropRegionToOriginal: finalCropForApi });
      await _executeApiProcessing(paramsForProcessing, 'crop', true);
      set({ isCropping: false, uiCropRegion: null });
    },

    processImageWithCurrentAdjustments: async (shouldAddToHistory = true) => {
      const params = _getCurrentUserParamsSnapshot();
      await _executeApiProcessing(params, 'applyAll', shouldAddToHistory);
    },

    applyNamedEffect: async (effect: ImageEffectType, params?: Partial<Omit<ImageProcessingParams, 'crop'>>) => {
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
  };
});