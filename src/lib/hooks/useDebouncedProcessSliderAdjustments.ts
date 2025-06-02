// lib/hooks/useDebouncedProcessSliderAdjustments.ts
import { useCallback, useMemo } from 'react';
import { useEditorStore, DEBOUNCE_DELAY } from '../store';
import { debounce } from '../utils';

export const useDebouncedProcessSliderAdjustments = () => {
    const { processImageWithCurrentAdjustments, isCropping, selectedFile } = useEditorStore(
        state => ({
            processImageWithCurrentAdjustments: state.processImageWithCurrentAdjustments,
            isCropping: state.isCropping,
            selectedFile: state.selectedFile,
        }),
    );

    const debouncedFunction = useMemo(() => 
        debounce(() => {
            if (isCropping || !selectedFile) return;
            // console.log("[Hook] Debounced processing for sliders via external hook."); // Console log can be noisy, optional
            processImageWithCurrentAdjustments(true); 
        }, DEBOUNCE_DELAY),
        // DEBOUNCE_DELAY is a constant imported from module scope, so it doesn't need to be a dependency.
        // The linter is correct here.
        [processImageWithCurrentAdjustments, isCropping, selectedFile] 
    );

    return useCallback(() => {
        debouncedFunction();
    }, [debouncedFunction]);
};