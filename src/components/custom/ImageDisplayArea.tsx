// components/custom/ImageDisplayArea.tsx
"use client";

import React, { useRef, useEffect, useState, MouseEvent as ReactMouseEvent } from 'react';
import { useImageZoomPan } from '@/lib/hooks/useImageZoomPan';
import { useImageCropHandler } from '@/lib/hooks/useImageCropHandler';
import { useEditorStore } from '@/lib/store'; // Import the Zustand store

const HANDLE_SIZE = 8;

// Props interface will be empty as all data comes from the store or is internal
interface ImageDisplayAreaProps {
  // key prop is handled by React, no need to define here
  originalImagePreviewFromStore: string | null; // Renaming to avoid conflict with internal variable if any
  imageDisplayKeySuffixFromStore: number; // To re-trigger effects if needed, though key on component is better
}


export function ImageDisplayArea({ originalImagePreviewFromStore, imageDisplayKeySuffixFromStore }: ImageDisplayAreaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Select state directly from the Zustand store
  const isLoading = useEditorStore(state => state.isLoading);
  const selectedFile = useEditorStore(state => state.selectedFile);
  const isCropping = useEditorStore(state => state.isCropping);
  const uiCropRegion = useEditorStore(state => state.uiCropRegion);
  const currentAspectRatio = useEditorStore(state => state.currentAspectRatio);
  const currentBaseImageDimensions = useEditorStore(state => state.currentBaseImageDimensions); // This is what was 'originalImageDimensions' prop

  // Get actions from the store
  const setUiCropRegion = useEditorStore(state => state.setUiCropRegion);

  const hasSelectedFile = !!selectedFile;
  const displayUrl = originalImagePreviewFromStore; // Use the prop passed for the image URL

  const [containerDims, setContainerDims] = useState<{ width: number; height: number } | null>(null);
  const [hoveredMouseCanvasPos, setHoveredMouseCanvasPos] = useState<{x: number, y: number} | null>(null);

  const {
    zoomLevel, panOffset, isPanning, isSpacebarDown,
    handleWheel, startPan, pan: performPan, endPan,
    getMousePosOnCanvas, canvasToImageCoords,
    resetZoomPan, setZoomLevel: setHookZoomLevel, setPanOffset: setHookPanOffset,
  } = useImageZoomPan({
    canvasRef,
    imageRef,
    containerDims,
    isCropping, // from store
  });

  const {
    activeDragHandle, getHandleAtPosition,
    cropMouseDownHandler, cropMouseMoveHandler, cropMouseUpHandler,
  } = useImageCropHandler({
    isCropping, // from store
    uiCropRegion, // from store
    onUiCropRegionChange: setUiCropRegion, // from store
    currentViewDimensions: currentBaseImageDimensions, // from store
    currentAspectRatio, // from store
    zoomLevel, // from useImageZoomPan
    canvasToImageCoords, // from useImageZoomPan
    getMousePosOnCanvas, // from useImageZoomPan
    imageRef,
  });

  useEffect(() => {
    const containerElement = containerRef.current;
    if (!containerElement) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerDims({ width, height });
      }
    });
    observer.observe(containerElement);
    setContainerDims({width: containerElement.clientWidth, height: containerElement.clientHeight});
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!displayUrl) { // displayUrl is originalImagePreviewFromStore
      const ctx = canvas.getContext('2d');
      if (ctx && canvas.width > 0 && canvas.height > 0) {
        const dpr = window.devicePixelRatio || 1;
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      }
      imageRef.current = null;
      setHookZoomLevel(1); setHookPanOffset({ x: 0, y: 0 });
      return;
    }
    const img = new Image();
    img.onload = () => { imageRef.current = img; resetZoomPan(); };
    img.onerror = () => { console.error("Failed to load image:", displayUrl); imageRef.current = null; };
    img.src = displayUrl;
    return () => { img.onload = null; img.onerror = null; };
  }, [displayUrl, resetZoomPan, setHookZoomLevel, setHookPanOffset, imageDisplayKeySuffixFromStore]); // Added imageDisplayKeySuffixFromStore

  useEffect(() => {
    const handleGlobalMouseMove = (event: MouseEvent) => {
      if (isPanning) performPan(event as unknown as ReactMouseEvent<HTMLDivElement>);
      if (activeDragHandle) cropMouseMoveHandler(event as unknown as ReactMouseEvent<HTMLDivElement>);
    };
    const handleGlobalMouseUp = () => {
      if (isPanning) endPan();
      if (activeDragHandle) cropMouseUpHandler();
    };

    if (isPanning || activeDragHandle) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isPanning, performPan, endPan, activeDragHandle, cropMouseMoveHandler, cropMouseUpHandler]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageRef.current || !currentBaseImageDimensions || !containerDims) return; // Use currentBaseImageDimensions from store
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const { width: containerWidth, height: containerHeight } = containerDims;
    if (containerWidth === 0 || containerHeight === 0) return;
    if (canvas.width !== Math.round(containerWidth * dpr) || canvas.height !== Math.round(containerHeight * dpr)) {
        canvas.width = Math.round(containerWidth * dpr);
        canvas.height = Math.round(containerHeight * dpr);
    }
    canvas.style.width = `${containerWidth}px`; canvas.style.height = `${containerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, containerWidth, containerHeight);
    ctx.save();
    ctx.translate(panOffset.x, panOffset.y); ctx.scale(zoomLevel, zoomLevel);
    if (imageRef.current) {
        ctx.drawImage(imageRef.current, 0, 0, imageRef.current.naturalWidth, imageRef.current.naturalHeight);
    }
    ctx.restore();
    if (isCropping && uiCropRegion && uiCropRegion.width && uiCropRegion.height && imageRef.current) {
      ctx.save();
      ctx.translate(panOffset.x, panOffset.y); ctx.scale(zoomLevel, zoomLevel);
      const cropX = uiCropRegion.left ?? 0; const cropY = uiCropRegion.top ?? 0;
      const cropWidth = uiCropRegion.width; const cropHeight = uiCropRegion.height;
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      const imgNatW = imageRef.current.naturalWidth; const imgNatH = imageRef.current.naturalHeight;
      ctx.fillRect(0, 0, imgNatW, cropY);
      ctx.fillRect(0, cropY + cropHeight, imgNatW, imgNatH - (cropY + cropHeight));
      ctx.fillRect(0, cropY, cropX, cropHeight);
      ctx.fillRect(cropX + cropWidth, cropY, imgNatW - (cropX + cropWidth), cropHeight);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)"; ctx.lineWidth = 1 / zoomLevel;
      ctx.strokeRect(cropX, cropY, cropWidth, cropHeight);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      const oneThirdHeight = cropHeight / 3;
      ctx.beginPath();
      ctx.moveTo(cropX, cropY + oneThirdHeight); ctx.lineTo(cropX + cropWidth, cropY + oneThirdHeight);
      ctx.moveTo(cropX, cropY + 2 * oneThirdHeight); ctx.lineTo(cropX + cropWidth, cropY + 2 * oneThirdHeight);
      ctx.stroke();
      const oneThirdWidth = cropWidth / 3;
      ctx.beginPath();
      ctx.moveTo(cropX + oneThirdWidth, cropY); ctx.lineTo(cropX + oneThirdWidth, cropY + cropHeight);
      ctx.moveTo(cropX + 2 * oneThirdWidth, cropY); ctx.lineTo(cropX + 2 * oneThirdWidth, cropY + cropHeight);
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      const handleScreenSizeTarget = HANDLE_SIZE;
      const handleImageCoordSize = handleScreenSizeTarget / zoomLevel;
      const handlesData = [
        { id: 'topLeft', x: cropX, y: cropY }, { id: 'topRight', x: cropX + cropWidth, y: cropY },
        { id: 'bottomLeft', x: cropX, y: cropY + cropHeight }, { id: 'bottomRight', x: cropX + cropWidth, y: cropY + cropHeight },
        { id: 'top', x: cropX + cropWidth / 2, y: cropY }, { id: 'bottom', x: cropX + cropWidth / 2, y: cropY + cropHeight },
        { id: 'left', x: cropX, y: cropY + cropHeight / 2 }, { id: 'right', x: cropX + cropWidth, y: cropY + cropHeight / 2 },
      ];
      handlesData.forEach(h => ctx.fillRect(h.x - handleImageCoordSize/2, h.y - handleImageCoordSize/2, handleImageCoordSize, handleImageCoordSize));
      ctx.restore();
    }
  }, [displayUrl, panOffset, zoomLevel, isCropping, uiCropRegion, currentBaseImageDimensions, containerDims, imageDisplayKeySuffixFromStore]); // Added imageDisplayKeySuffixFromStore

  const handleCanvasMouseDown = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (isSpacebarDown) return;
    cropMouseDownHandler(event);
  };

  const handleCanvasMouseMove = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const mousePosCanvas = getMousePosOnCanvas(event);
    setHoveredMouseCanvasPos(mousePosCanvas);
  };

  const handleCanvasMouseUp = () => { /* Global listener handles active drags */ };
  const handleCanvasMouseLeave = () => {
    if (!activeDragHandle && !isPanning) {
        setHoveredMouseCanvasPos(null);
    }
  };

  const cursorStyle = (() => {
    if (isSpacebarDown) return isPanning ? 'grabbing' : 'grab';
    if (isCropping) {
      if (activeDragHandle) return 'grabbing';
      if (hoveredMouseCanvasPos && canvasRef.current) {
        const handle = getHandleAtPosition(hoveredMouseCanvasPos.x, hoveredMouseCanvasPos.y);
        if (handle) {
            if (handle.includes('Left') || handle.includes('Right')) return 'ew-resize';
            if (handle.includes('Top') || handle.includes('Bottom')) return 'ns-resize';
            if (handle === 'topLeft' || handle === 'bottomRight') return 'nwse-resize';
            if (handle === 'topRight' || handle === 'bottomLeft') return 'nesw-resize';
            if (handle === 'move') return 'move';
        }
      }
      return 'crosshair';
    }
    return 'default';
  })();

  return (
    <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center p-6 bg-muted/30 relative overflow-hidden"
        style={{ cursor: cursorStyle }}
        onMouseDown={startPan}
        onMouseMove={ (e) => {
            const pos = getMousePosOnCanvas(e as unknown as ReactMouseEvent<HTMLDivElement>);
            setHoveredMouseCanvasPos(pos);
        }}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/75 backdrop-blur-sm z-20">
          <div className="flex flex-col items-center">
            <svg className="animate-spin h-8 w-8 text-primary mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <div className="text-lg font-semibold text-primary">Processing...</div>
          </div>
        </div>
      )}
      {!isLoading && !hasSelectedFile && (
        <div className="text-center text-muted-foreground">
          <h2 className="text-2xl font-semibold mb-3">Welcome to QuikLens</h2>
          <p>{'Click "Open Image" from the File menu to begin editing.'}</p>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={`${(!displayUrl || !hasSelectedFile || (isLoading && !displayUrl)) ? 'hidden' : ''}`}
        onWheel={hasSelectedFile ? handleWheel : undefined}
        onMouseDown={hasSelectedFile ? handleCanvasMouseDown : undefined}
        onMouseMove={hasSelectedFile ? handleCanvasMouseMove : undefined}
        onMouseUp={hasSelectedFile ? handleCanvasMouseUp : undefined} // Global listeners handle active drag
        onMouseLeave={hasSelectedFile ? handleCanvasMouseLeave : undefined} // Global listeners handle active drag
      />
    </div>
  );
}