// lib/hooks/useDebouncedProcessSliderAdjustments.ts
import { useCallback } from 'react';
import { useEditorStore, DEBOUNCE_DELAY } from '../store'; // Import DEBOUNCE_DELAY from store
import { debounce } from '../utils'; // Import debounce from utils

export const useDebouncedProcessSliderAdjustments = () => {
    const { processImageWithCurrentAdjustments, isCropping, selectedFile } = useEditorStore(
        state => ({
            processImageWithCurrentAdjustments: state.processImageWithCurrentAdjustments,
            isCropping: state.isCropping,
            selectedFile: state.selectedFile,
        }),
    );

    return useCallback(
        debounce(() => {
            if (isCropping || !selectedFile) return;
            console.log("[Hook] Debounced processing for sliders via external hook.");
            processImageWithCurrentAdjustments(true);
        }, DEBOUNCE_DELAY), // Use DEBOUNCE_DELAY from store
        [processImageWithCurrentAdjustments, isCropping, selectedFile]
    );
};