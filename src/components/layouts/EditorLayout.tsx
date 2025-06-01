// app/(layout-components)/EditorLayout.tsx
"use client";

import React, { useState, ChangeEvent, useRef, useCallback, useEffect } from 'react';
import { TopBar } from '@/components/custom/TopBar';
import { ImageDisplayArea } from '@/components/custom/ImageDisplayArea';
import { AdjustmentSidebar } from '@/components/custom/AdjustmentSidebar';
import type { 
  ImageProcessingParams, 
  ProcessImagePayload, 
  ImageEffectType,
  CropRegion,
  AspectRatioOption
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import { globalShortcutConfig } from '@/lib/shortcuts'; // Assuming this path is correct

const MAX_HISTORY_LENGTH = 20;
const DEBOUNCE_DELAY = 500;
const MIN_CROP_SIZE = 20;

function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<F>): Promise<ReturnType<F>> => {
    return new Promise((resolve) => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        timeoutId = null;
        resolve(func(...args));
      }, waitFor);
    });
  };
}

const getAspectRatioValue = (aspectRatio: AspectRatioOption): number | null => {
    if (aspectRatio === "1:1") return 1;
    if (aspectRatio === "16:9") return 16 / 9;
    if (aspectRatio === "9:16") return 9 / 16;
    if (aspectRatio === "4:3") return 4 / 3;
    if (aspectRatio === "3:4") return 3 / 4;
    return null; 
};

export default function EditorLayout() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [currentBaseImagePreviewUrl, setCurrentBaseImagePreviewUrl] = useState<string | null>(null); 
  const [currentBaseImageDimensions, setCurrentBaseImageDimensions] = useState<{width: number, height: number} | null>(null);
  const [trueOriginalImageDimensions, setTrueOriginalImageDimensions] = useState<{width: number, height: number} | null>(null);
  const [processedNonCropImageUrl, setProcessedNonCropImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [brightness, setBrightness] = useState<number>(1);
  const [exposure, setExposure] = useState<number>(0);
  const [temperature, setTemperature] = useState<number>(0);
  const [contrast, setContrast] = useState<number>(0);
  const [saturation, setSaturation] = useState<number>(1);
  const [tint, setTint] = useState<number>(0);
  const [sharpness, setSharpness] = useState<number>(0);

  const [isCropping, setIsCropping] = useState<boolean>(false);
  const [currentAspectRatio, setCurrentAspectRatio] = useState<AspectRatioOption>("freeform");
  const [appliedCropRegionToOriginal, setAppliedCropRegionToOriginal] = useState<CropRegion | null>(null);
  const [uiCropRegion, setUiCropRegion] = useState<Partial<CropRegion> | null>(null);

  const [history, setHistory] = useState<ImageProcessingParams[]>([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState<number>(-1);
  const [imageDisplayKeySuffix, setImageDisplayKeySuffix] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const getCurrentAdjustmentsSnapshot = useCallback((): Omit<ImageProcessingParams, 'crop' | '_sourceImageDimensionsForNextStep' | '_appliedCropForThisState'> => {
    return { brightness, exposure, temperature, contrast, saturation, tint, sharpness };
  }, [brightness, exposure, temperature, contrast, saturation, tint, sharpness]);

  const applyParamsFromHistorySnapshot = useCallback((params: ImageProcessingParams) => {
    console.log("[EditorLayout] applyParamsFromHistorySnapshot with:", params);
    setBrightness(params.brightness ?? 1);
    setExposure(params.exposure ?? 0);
    setTemperature(params.temperature ?? 0);
    setContrast(params.contrast ?? 0);
    setSaturation(params.saturation ?? 1);
    setTint(params.tint ?? 0);
    setSharpness(params.sharpness ?? 0);
    
    setAppliedCropRegionToOriginal(params.crop || null); 
    
    if (params.crop) {
        setCurrentBaseImageDimensions({width: params.crop.width, height: params.crop.height});
    } else if (trueOriginalImageDimensions) {
        setCurrentBaseImageDimensions(trueOriginalImageDimensions);
    }

    if (isCropping && currentBaseImageDimensions) {
        setUiCropRegion(
            params.crop 
            ? { left: 0, top: 0, width: params.crop.width, height: params.crop.height }
            : { left:0, top: 0, width: currentBaseImageDimensions.width, height: currentBaseImageDimensions.height }
        );
    }
  }, [isCropping, currentBaseImageDimensions, trueOriginalImageDimensions]);

  const resetApplicationState = useCallback((newFile?: File) => {
    const defaultParams: ImageProcessingParams = {
      brightness: 1, exposure: 0, temperature: 0, contrast: 0,
      saturation: 1, tint: 0, sharpness: 0, crop: undefined,
      // _sourceImageDimensionsForNextStep and _appliedCropForThisState will be set based on newFile
    };
    
    setIsCropping(false);
    setCurrentAspectRatio("freeform");
    setUiCropRegion(null);
    setError(null);
    setProcessedNonCropImageUrl(null);

    if (newFile) {
        const objectURL = URL.createObjectURL(newFile);
        setCurrentBaseImagePreviewUrl(objectURL);
        const img = new Image();
        img.onload = () => {
            const dims = {width: img.naturalWidth, height: img.naturalHeight};
            setTrueOriginalImageDimensions(dims);
            setCurrentBaseImageDimensions(dims);
            const initialHistoryEntry: ImageProcessingParams = {
                ...defaultParams,
                _sourceImageDimensionsForNextStep: dims,
                _appliedCropForThisState: null,
            };
            applyParamsFromHistorySnapshot(initialHistoryEntry); // Apply defaults considering new dims
            setHistory([initialHistoryEntry]);
            setCurrentHistoryIndex(0);
        };
        img.src = objectURL;
    } else {
        setCurrentBaseImagePreviewUrl(null);
        setTrueOriginalImageDimensions(null);
        setCurrentBaseImageDimensions(null);
        applyParamsFromHistorySnapshot(defaultParams);
        setHistory([defaultParams]);
        setCurrentHistoryIndex(0);
    }
    setImageDisplayKeySuffix(prev => prev + 1);
  }, [applyParamsFromHistorySnapshot]);


  useEffect(() => {
    return () => {
      if (currentBaseImagePreviewUrl) URL.revokeObjectURL(currentBaseImagePreviewUrl);
      if (processedNonCropImageUrl) URL.revokeObjectURL(processedNonCropImageUrl);
    };
  }, [currentBaseImagePreviewUrl, processedNonCropImageUrl]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (currentBaseImagePreviewUrl) URL.revokeObjectURL(currentBaseImagePreviewUrl);
      if (processedNonCropImageUrl) URL.revokeObjectURL(processedNonCropImageUrl);
      resetApplicationState(file);
    }
  };

  const handleOpenFileClick = useCallback(() => { fileInputRef.current?.click(); }, []);
  
  const handleExportClick = useCallback(() => {
    const urlToDownload = processedNonCropImageUrl || currentBaseImagePreviewUrl;
    const isTrulyOriginal = currentBaseImagePreviewUrl && trueOriginalImageDimensions && 
                           currentBaseImageDimensions?.width === trueOriginalImageDimensions.width &&
                           currentBaseImageDimensions?.height === trueOriginalImageDimensions.height &&
                           !appliedCropRegionToOriginal && !processedNonCropImageUrl;
    let fileNameSuffix = "";
    if (processedNonCropImageUrl || appliedCropRegionToOriginal) {
        fileNameSuffix = '_edited';
    } else if (currentBaseImagePreviewUrl && !isTrulyOriginal) {
        fileNameSuffix = '_base';
    } else if (isTrulyOriginal) {
        fileNameSuffix = '_original';
    }

    if (urlToDownload) {
      const link = document.createElement('a');
      link.href = urlToDownload;
      const baseName = selectedFile?.name.substring(0, selectedFile.name.lastIndexOf('.')) || 'image';
      const downloadExtension = 'png'; 
      link.download = `quicktune${fileNameSuffix}_${baseName}.${downloadExtension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      alert('Please open an image to export.');
    }
  }, [processedNonCropImageUrl, currentBaseImagePreviewUrl, selectedFile, trueOriginalImageDimensions, currentBaseImageDimensions, appliedCropRegionToOriginal]);

  const addHistoryEntry = useCallback((paramsForHistory: ImageProcessingParams) => {
    setHistory(prevHistory => {
      const newHistoryBase = prevHistory.slice(0, currentHistoryIndex + 1);
      // Augment with current base dimensions and applied crop for this state
      const enrichedHistoryEntry: ImageProcessingParams = {
        ...paramsForHistory,
        _sourceImageDimensionsForNextStep: currentBaseImageDimensions, // The dimensions this state was based on
        _appliedCropForThisState: appliedCropRegionToOriginal, // The crop that defines this state's base
      };
      const updatedHistory = [...newHistoryBase, enrichedHistoryEntry];
      let finalHistory = updatedHistory;
      if (updatedHistory.length > MAX_HISTORY_LENGTH) {
        finalHistory = updatedHistory.slice(updatedHistory.length - MAX_HISTORY_LENGTH);
      }
      console.log("[EditorLayout] Adding to history. New length:", finalHistory.length, "New index:", finalHistory.length - 1, "Entry:", enrichedHistoryEntry);
      setCurrentHistoryIndex(finalHistory.length - 1);
      return finalHistory;
    });
  }, [currentHistoryIndex, currentBaseImageDimensions, appliedCropRegionToOriginal]);

  const processImageAndSetDisplay = useCallback(async (
    paramsForAPI: ImageProcessingParams,
    effectToApply: ImageEffectType,
    shouldAddToHistory: boolean
  ) => {
    if (!selectedFile) { console.warn("processImageAndSetDisplay: No file"); return; }
    
    console.log(`[EditorLayout] processImageAndSetDisplay: Effect: ${effectToApply}, API Params:`, paramsForAPI);
    setIsLoading(true); setError(null);

    const formData = new FormData();
    formData.append('imageFile', selectedFile);
    formData.append('effect', effectToApply);
    // Remove internal history metadata before sending to API
    const { _sourceImageDimensionsForNextStep, _appliedCropForThisState, ...apiParams } = paramsForAPI;
    formData.append('params', JSON.stringify(apiParams));

    try {
        const response = await fetch('/api/image/process', { method: 'POST', body: formData });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({ error: `Processing failed: ${response.statusText}` }));
            throw new Error(errData.error || 'Image processing failed.');
        }
        const imageBlob = await response.blob();
        const newBlobUrl = URL.createObjectURL(imageBlob);
        console.log('[EditorLayout] processImageAndSetDisplay: API returned. New Blob URL:', newBlobUrl);

        // Revoke previous URLs carefully
        if (processedNonCropImageUrl) URL.revokeObjectURL(processedNonCropImageUrl);
        if (currentBaseImagePreviewUrl && currentBaseImagePreviewUrl !== URL.createObjectURL(selectedFile) && currentBaseImagePreviewUrl !== newBlobUrl) {
            URL.revokeObjectURL(currentBaseImagePreviewUrl);
        }
        
        let historyEntryParams = { ...paramsForAPI }; // Start with params sent to API

        if (effectToApply === 'crop' && apiParams.crop) {
            console.log('[EditorLayout] processImageAndSetDisplay: CROP effect applied.');
            setCurrentBaseImagePreviewUrl(newBlobUrl);
            const newBaseDims = { width: apiParams.crop.width, height: apiParams.crop.height };
            setCurrentBaseImageDimensions(newBaseDims);
            setAppliedCropRegionToOriginal(apiParams.crop); 
            setProcessedNonCropImageUrl(null); 
            historyEntryParams.crop = apiParams.crop; // Ensure history reflects the applied crop
        } else {
            // For non-crop adjustments, the result is stored in processedNonCropImageUrl
            // currentBaseImagePreviewUrl should point to the base this was applied on (original or last crop)
            if (!appliedCropRegionToOriginal && trueOriginalImageDimensions) { // Sliders applied on true original
                setCurrentBaseImagePreviewUrl(URL.createObjectURL(selectedFile));
                setCurrentBaseImageDimensions(trueOriginalImageDimensions);
            } // If appliedCropRegionToOriginal exists, currentBase... states are already set to that cropped version
            setProcessedNonCropImageUrl(newBlobUrl);
            historyEntryParams.crop = appliedCropRegionToOriginal || undefined; // Preserve existing crop in history
        }
        
        setImageDisplayKeySuffix(prev => prev + 1);

        if (shouldAddToHistory) {
            addHistoryEntry(historyEntryParams);
        }

    } catch (err: any) {
        console.error('[EditorLayout] processImageAndSetDisplay: Error:', err);
        setError(err.message || 'An unknown error occurred during processing.');
    } finally {
        setIsLoading(false);
    }
  }, [selectedFile, addHistoryEntry, currentBaseImagePreviewUrl, processedNonCropImageUrl, appliedCropRegionToOriginal, trueOriginalImageDimensions]);


  const debouncedProcessNonCropAdjustments = useCallback(
    debounce(() => {
      if (isCropping || !selectedFile) return;
      console.log("[EditorLayout] Debounced non-crop adjustment processing triggered.");
      const sliderParams = getCurrentAdjustmentsSnapshot();
      const paramsForAPI: ImageProcessingParams = {
          ...sliderParams,
          crop: appliedCropRegionToOriginal || undefined 
      };
      processImageAndSetDisplay(paramsForAPI, 'applyAll', true);
    }, DEBOUNCE_DELAY),
    [getCurrentAdjustmentsSnapshot, appliedCropRegionToOriginal, processImageAndSetDisplay, isCropping, selectedFile]
  );

  useEffect(() => { 
    if (!selectedFile || currentHistoryIndex < 0 || isCropping) return;
    debouncedProcessNonCropAdjustments();
  }, [brightness, exposure, temperature, contrast, saturation, tint, sharpness]); // Only slider states


  const handleUndo = useCallback(() => { 
    if (currentHistoryIndex > 0) {
      const newIndex = currentHistoryIndex - 1;
      const paramsToRestore = history[newIndex];
      console.log("[EditorLayout] UNDO: Restoring to history index", newIndex, "Params:", paramsToRestore);
      
      applyParamsFromHistorySnapshot(paramsToRestore); 
      setCurrentHistoryIndex(newIndex);
      
      processImageAndSetDisplay(paramsToRestore, 'applyAll', false);
    }
  }, [currentHistoryIndex, history, applyParamsFromHistorySnapshot, processImageAndSetDisplay]);

  const handleRedo = useCallback(() => { 
    if (currentHistoryIndex < history.length - 1) {
      const newIndex = currentHistoryIndex + 1;
      const paramsToRestore = history[newIndex];
      console.log("[EditorLayout] REDO: Restoring to history index", newIndex, "Params:", paramsToRestore);

      applyParamsFromHistorySnapshot(paramsToRestore);
      setCurrentHistoryIndex(newIndex);
      
      processImageAndSetDisplay(paramsToRestore, 'applyAll', false);
    }
  }, [currentHistoryIndex, history, applyParamsFromHistorySnapshot, processImageAndSetDisplay]);
  
  const handleApplyGrayscale = useCallback(() => {
    const currentAdjustments = getCurrentAdjustmentsSnapshot();
    const paramsForAPI: ImageProcessingParams = {
        ...currentAdjustments,
        crop: appliedCropRegionToOriginal || undefined,
    };
    console.log("[EditorLayout] Applying Grayscale with params for API:", paramsForAPI);
    processImageAndSetDisplay(paramsForAPI, 'grayscale', true);
  }, [getCurrentAdjustmentsSnapshot, appliedCropRegionToOriginal, processImageAndSetDisplay]);

  const toggleCropMode = () => {
    setIsCropping(prevIsCropping => {
      const newIsCropping = !prevIsCropping;
      if (newIsCropping && currentBaseImageDimensions) {
        console.log("[EditorLayout] Activating crop mode. Initializing uiCropRegion.");
        setUiCropRegion(
          appliedCropRegionToOriginal // If a crop is already applied to original, uiCrop should be relative to that
          ? { left: 0, top: 0, width: currentBaseImageDimensions.width, height: currentBaseImageDimensions.height }
          : { left: 0, top: 0, width: currentBaseImageDimensions.width, height: currentBaseImageDimensions.height }
        );
        setCurrentAspectRatio("freeform");
      }
      return newIsCropping;
    });
  };
  
  const handleAspectRatioChange = (newAspectRatio: AspectRatioOption) => {
    console.log("[EditorLayout] Aspect ratio selected:", newAspectRatio);
    setCurrentAspectRatio(newAspectRatio);
    if (isCropping && uiCropRegion && currentBaseImageDimensions) {
        let currentLeft = uiCropRegion.left ?? 0;
        let currentTop = uiCropRegion.top ?? 0;
        let currentWidth = uiCropRegion.width ?? currentBaseImageDimensions.width;
        let currentHeight = uiCropRegion.height ?? currentBaseImageDimensions.height;
        const arValue = getAspectRatioValue(newAspectRatio);

        if (arValue) {
            // Prioritize maintaining width, adjust height, then clamp if needed
            currentHeight = currentWidth / arValue;
            if (currentHeight > currentBaseImageDimensions.height - currentTop) {
                currentHeight = currentBaseImageDimensions.height - currentTop;
                currentWidth = currentHeight * arValue;
            }
            if (currentWidth > currentBaseImageDimensions.width - currentLeft) {
                currentWidth = currentBaseImageDimensions.width - currentLeft;
                currentHeight = currentWidth / arValue;
            }

        } else if (newAspectRatio === "original" && currentBaseImageDimensions) {
            // For "original", uiCrop should be full current base
            currentWidth = currentBaseImageDimensions.width;
            currentHeight = currentBaseImageDimensions.height;
            currentLeft = 0; 
            currentTop = 0;
        } else if (newAspectRatio === "freeform") {
            return; 
        }
        
        currentWidth = Math.max(MIN_CROP_SIZE, Math.min(currentWidth, currentBaseImageDimensions.width - currentLeft));
        currentHeight = Math.max(MIN_CROP_SIZE, Math.min(currentHeight, currentBaseImageDimensions.height - currentTop));
        
        // Final check and adjustment for aspect ratio after clamping
        if (arValue) {
            if (Math.abs(currentWidth / currentHeight - arValue) > 0.001) {
                if (currentWidth / arValue <= currentBaseImageDimensions.height - currentTop) {
                    currentHeight = currentWidth / arValue;
                } else {
                    currentWidth = currentHeight * arValue;
                }
            }
        }
        setUiCropRegion({ left: currentLeft, top: currentTop, width: Math.round(currentWidth), height: Math.round(currentHeight) });
    }
};

  const handleApplyCropAction = () => {
    if (!uiCropRegion || !currentBaseImageDimensions || !selectedFile || !trueOriginalImageDimensions) {
        setError("Cannot apply crop: required image data is missing.");
        return;
    }

    const currentUiCrop: CropRegion = {
        left: Math.max(0, Math.round(uiCropRegion.left ?? 0)),
        top: Math.max(0, Math.round(uiCropRegion.top ?? 0)),
        width: Math.max(MIN_CROP_SIZE, Math.round(uiCropRegion.width ?? currentBaseImageDimensions.width)),
        height: Math.max(MIN_CROP_SIZE, Math.round(uiCropRegion.height ?? currentBaseImageDimensions.height)),
    };
    currentUiCrop.width = Math.min(currentUiCrop.width, currentBaseImageDimensions.width - currentUiCrop.left);
    currentUiCrop.height = Math.min(currentUiCrop.height, currentBaseImageDimensions.height - currentUiCrop.top);

    let finalCropForApi: CropRegion;
    if (appliedCropRegionToOriginal) { 
        finalCropForApi = {
            left: appliedCropRegionToOriginal.left + currentUiCrop.left,
            top: appliedCropRegionToOriginal.top + currentUiCrop.top,
            width: currentUiCrop.width,
            height: currentUiCrop.height,
        };
    } else { 
        finalCropForApi = { ...currentUiCrop };
    }

    finalCropForApi.left = Math.max(0, Math.round(finalCropForApi.left));
    finalCropForApi.top = Math.max(0, Math.round(finalCropForApi.top));
    finalCropForApi.width = Math.max(MIN_CROP_SIZE, Math.min(Math.round(finalCropForApi.width), trueOriginalImageDimensions.width - finalCropForApi.left));
    finalCropForApi.height = Math.max(MIN_CROP_SIZE, Math.min(Math.round(finalCropForApi.height), trueOriginalImageDimensions.height - finalCropForApi.top));

    if (finalCropForApi.width < MIN_CROP_SIZE || finalCropForApi.height < MIN_CROP_SIZE) {
        setError("Invalid crop dimensions after final validation.");
        return;
    }
    
    console.log("[EditorLayout] Applying crop action. UI Crop (rel to current base):", uiCropRegion, "Final API Crop (rel to true original):", finalCropForApi);
    
    const paramsForProcessing: ImageProcessingParams = {
        brightness, exposure, temperature, contrast, saturation, tint, sharpness,
        crop: finalCropForApi,       
    };
    
    processImageAndSetDisplay(paramsForProcessing, 'crop', true);
    setIsCropping(false); 
  };

  useEffect(() => { 
    const actionMap: Record<string, () => void> = {
      undo: handleUndo, redo: handleRedo, redoAlternative: handleRedo,
      openFile: handleOpenFileClick, exportFile: handleExportClick,
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const targetElement = event.target as HTMLElement;
      const isTextInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(targetElement.tagName) || targetElement.isContentEditable;

      if (isCropping) {
        if (event.key === 'Enter') { handleApplyCropAction(); event.preventDefault(); return; }
        if (event.key === 'Escape') { toggleCropMode(); event.preventDefault(); return; }
      }
      if (isTextInput && !isCropping) return;
      
      const pressedKey = event.key.toUpperCase();
      const isMetaOrCtrl = event.metaKey || event.ctrlKey;
      const isShift = event.shiftKey; const isAlt = event.altKey;

      for (const shortcut of globalShortcutConfig) {
        if ( pressedKey === shortcut.key.toUpperCase() && isMetaOrCtrl === !!shortcut.metaOrCtrl && isShift === !!shortcut.shift && isAlt === !!shortcut.alt ) {
          const action = actionMap[shortcut.id];
          if (action) {
            if (shortcut.preventDefault !== false) event.preventDefault();
            if (shortcut.id === 'undo' && !canUndo) continue;
            if ((shortcut.id === 'redo' || shortcut.id === 'redoAlternative') && !canRedo) continue;
            if (shortcut.id === 'exportFile' && !canExport) continue;
            action(); break;
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, handleOpenFileClick, handleExportClick, isCropping, toggleCropMode, handleApplyCropAction]);

  const canUndo = currentHistoryIndex > 0;
  const canRedo = currentHistoryIndex < history.length - 1;
  const canExport = !!(processedNonCropImageUrl || currentBaseImagePreviewUrl);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-muted/20">
      <TopBar
        onOpenFileClick={handleOpenFileClick} onExportClick={handleExportClick}
        onUndo={handleUndo} onRedo={handleRedo}
        canUndo={canUndo} canRedo={canRedo} canExport={canExport}
      />
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,.cr2,.nef,.arw,.dng" className="hidden" />
      <div className="flex flex-1 overflow-hidden">
        <ImageDisplayArea
          key={`image-display-${currentBaseImagePreviewUrl}-${imageDisplayKeySuffix}`} 
          originalImagePreview={currentBaseImagePreviewUrl}
          processedImageUrl={processedNonCropImageUrl}
          isLoading={isLoading}
          hasSelectedFile={!!selectedFile}
          isCropping={isCropping}
          uiCropRegion={uiCropRegion}
          onUiCropRegionChange={setUiCropRegion}
          currentAspectRatio={currentAspectRatio}
          originalImageDimensions={currentBaseImageDimensions} 
        />
        {selectedFile && (
          <AdjustmentSidebar
            brightness={brightness} onBrightnessChange={setBrightness}
            exposure={exposure} onExposureChange={setExposure}
            temperature={temperature} onTemperatureChange={setTemperature}
            contrast={contrast} onContrastChange={setContrast}
            saturation={saturation} onSaturationChange={setSaturation}
            tint={tint} onTintChange={setTint}
            sharpness={sharpness} onSharpnessChange={setSharpness}
            isCropping={isCropping}
            toggleCropMode={toggleCropMode}
            currentAspectRatio={currentAspectRatio}
            onAspectRatioChange={handleAspectRatioChange}
            onApplyCrop={handleApplyCropAction}
            onApplyGrayscale={handleApplyGrayscale}
            isLoading={isLoading}
            selectedFile={selectedFile}
          />
        )}
      </div>
      {error && (
        <div className="fixed bottom-4 right-4 bg-destructive text-destructive-foreground p-3 rounded-md shadow-lg z-50 max-w-md">
          <div className="flex justify-between items-center">
            <h4 className="font-semibold">Error</h4>
            <Button variant="ghost" size="sm" onClick={() => setError(null)} className="h-auto p-1 -mr-1">X</Button>
          </div>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}
    </div>
  );
}