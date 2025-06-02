// components/layouts/EditorLayout.tsx
"use client";

import React, { useRef, useCallback, ChangeEvent } from 'react'; // useEffect removed
import { useHotkeys } from 'react-hotkeys-hook'; // Import useHotkeys
import { useEditorStore } from '@/lib/store';
import { TopBar } from '@/components/custom/TopBar';
import { ImageDisplayArea } from '@/components/custom/ImageDisplayArea';
import { AdjustmentSidebar } from '@/components/custom/AdjustmentSidebar';
import { Button } from '@/components/ui/button';

export default function EditorLayout() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const error = useEditorStore(state => state.error);
  const selectedFile = useEditorStore(state => state.selectedFile);
  const currentBaseImagePreviewUrl = useEditorStore(state => state.currentBaseImagePreviewUrl);
  const imageDisplayKeySuffix = useEditorStore(state => state.imageDisplayKeySuffix);
  // appliedCropRegionToOriginal is no longer needed to be selected here for export logic,
  // as isPristineState selector will handle it.

  const storeSetSelectedFile = useEditorStore(state => state.setSelectedFile);
  const storeSetError = useEditorStore(state => state.setError);
  const storeToggleCropMode = useEditorStore(state => state.toggleCropMode);
  const storeApplyCrop = useEditorStore(state => state.applyCrop);
  const storeUndo = useEditorStore(state => state.undo);
  const storeRedo = useEditorStore(state => state.redo);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    storeSetSelectedFile(file || null);
  };

  const handleOpenFileClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleExportClick = useCallback(() => {
    const storeState = useEditorStore.getState(); // Get current state once
    if (!storeState.canExport() || !storeState.currentBaseImagePreviewUrl) {
      alert('No image to export or image is still processing.');
      return;
    }

    let fileNameSuffix = "_edited";
    // Use the new selector from the store
    if (storeState.isPristineState()) {
      fileNameSuffix = "_original";
    }

    const link = document.createElement('a');
    link.href = storeState.currentBaseImagePreviewUrl;
    const baseName = storeState.selectedFile?.name.substring(0, storeState.selectedFile.name.lastIndexOf('.')) || 'image';
    const downloadExtension = storeState.selectedFile?.type === 'image/jpeg' ? 'jpg' : 'png';
    link.download = `QuikLens${fileNameSuffix}_${baseName}.${downloadExtension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  useHotkeys('mod+o', (event) => { event.preventDefault(); handleOpenFileClick(); }, { enableOnFormTags: false }, [handleOpenFileClick]);
  useHotkeys('mod+shift+e', (event) => {
    event.preventDefault(); handleExportClick();
  }, { enableOnFormTags: false, enabled: useEditorStore(s => s.canExport()) }, [handleExportClick]);
  useHotkeys('mod+z', (event) => { event.preventDefault(); storeUndo(); }, { enableOnFormTags: true, enabled: useEditorStore(s => s.canUndo()) }, [storeUndo]);
  useHotkeys('mod+shift+z', (event) => { event.preventDefault(); storeRedo(); }, { enableOnFormTags: true, enabled: useEditorStore(s => s.canRedo()) }, [storeRedo]);
  useHotkeys('enter', (event) => { event.preventDefault(); storeApplyCrop(); }, { enabled: useEditorStore(s => s.isCropping), enableOnFormTags: true }, [storeApplyCrop]);
  useHotkeys('escape', (event) => { event.preventDefault(); storeToggleCropMode(); }, { enabled: useEditorStore(s => s.isCropping), enableOnFormTags: true }, [storeToggleCropMode]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-muted/20">
      <TopBar
        onOpenFileClick={handleOpenFileClick}
        onExportClick={handleExportClick}
        // Undo/redo and their states are now handled directly in TopBar from the store
      />
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*,.cr2,.nef,.arw,.dng"
        className="hidden"
      />
      <div className="flex flex-1 overflow-hidden">
        <ImageDisplayArea
            key={`image-display-${currentBaseImagePreviewUrl}-${imageDisplayKeySuffix}`}
            originalImagePreviewFromStore={currentBaseImagePreviewUrl}
            imageDisplayKeySuffixFromStore={imageDisplayKeySuffix}
        />
        {selectedFile && (
          <AdjustmentSidebar />
        )}
      </div>
      {error && (
        <div className="fixed bottom-4 right-4 bg-destructive text-destructive-foreground p-3 rounded-md shadow-lg z-50 max-w-md">
          <div className="flex justify-between items-center">
            <h4 className="font-semibold">Error</h4>
            <Button variant="ghost" size="sm" onClick={() => storeSetError(null)} className="h-auto p-1 -mr-1">X</Button>
          </div>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}
    </div>
  );
}