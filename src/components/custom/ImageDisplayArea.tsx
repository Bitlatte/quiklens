"use client";

import React, { useRef, useEffect, useState, MouseEvent as ReactMouseEvent } from 'react';
import type { CropRegion, AspectRatioOption } from '@/lib/types';

const HANDLE_SIZE = 8; // Size of resize handles in pixels
const MIN_CROP_SIZE = 20; // Minimum crop dimension in pixels

interface ImageDisplayAreaProps {
  originalImagePreview: string | null;
  processedImageUrl: string | null;
  isLoading: boolean;
  hasSelectedFile: boolean;
  isCropping: boolean;
  uiCropRegion: Partial<CropRegion> | null;
  onUiCropRegionChange: (newRegion: Partial<CropRegion>) => void;
  currentAspectRatio: AspectRatioOption;
  originalImageDimensions: { width: number; height: number } | null;
}

const getAspectRatioValue = (aspectRatio: AspectRatioOption): number | null => {
  if (aspectRatio === "1:1") return 1;
  if (aspectRatio === "16:9") return 16 / 9;
  if (aspectRatio === "9:16") return 9 / 16;
  if (aspectRatio === "4:3") return 4 / 3;
  if (aspectRatio === "3:4") return 3 / 4;
  return null;
};


export function ImageDisplayArea({
  originalImagePreview,
  processedImageUrl,
  isLoading,
  hasSelectedFile,
  isCropping,
  uiCropRegion,
  onUiCropRegionChange,
  currentAspectRatio,
  originalImageDimensions,
}: ImageDisplayAreaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [displayConfig, setDisplayConfig] = useState<{
    imageX: number; imageY: number;
    imageRenderWidth: number; imageRenderHeight: number;
    scaleFactor: number;
  } | null>(null);

  const [activeDragHandle, setActiveDragHandle] = useState<string | null>(null);
  const [dragStartCoords, setDragStartCoords] = useState<{ x: number; y: number } | null>(null);
  const [initialCropOnDragStart, setInitialCropOnDragStart] = useState<Partial<CropRegion> | null>(null);

  const displayUrl = processedImageUrl || originalImagePreview;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!displayUrl) {
      if (canvas.width > 0 && canvas.height > 0) {
        ctx.clearRect(0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
      }
      setDisplayConfig(null);
      imageRef.current = null;
      return;
    }

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      if (containerWidth === 0 || containerHeight === 0) return;

      const imageAspectRatioVal = img.naturalWidth / img.naturalHeight;
      const containerAspectRatioVal = containerWidth / containerHeight;
      let renderWidth, renderHeight;
      if (imageAspectRatioVal > containerAspectRatioVal) {
        renderWidth = containerWidth;
        renderHeight = containerWidth / imageAspectRatioVal;
      } else {
        renderHeight = containerHeight;
        renderWidth = containerHeight * imageAspectRatioVal;
      }
      const canvasActualWidth = containerWidth;
      const canvasActualHeight = containerHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvasActualWidth * dpr;
      canvas.height = canvasActualHeight * dpr;
      canvas.style.width = `${canvasActualWidth}px`;
      canvas.style.height = `${canvasActualHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const imageX = (canvasActualWidth - renderWidth) / 2;
      const imageY = (canvasActualHeight - renderHeight) / 2;
      const scaleFactor = img.naturalWidth / renderWidth;

      setDisplayConfig({ imageX, imageY, imageRenderWidth: renderWidth, imageRenderHeight: renderHeight, scaleFactor });
      ctx.clearRect(0, 0, canvasActualWidth, canvasActualHeight);
      ctx.drawImage(img, imageX, imageY, renderWidth, renderHeight);
    };
    img.onerror = () => { 
        console.error("[ImageDisplayArea] Failed to load image for canvas:", displayUrl); 
        imageRef.current = null; 
        if(ctx && canvas.width > 0 && canvas.height > 0) {
            ctx.clearRect(0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
        }
    };
    img.src = displayUrl;

    return () => { img.onload = null; img.onerror = null; };
  }, [displayUrl]);


  // Effect to draw crop overlay when isCropping or uiCropRegion changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !displayConfig || !imageRef.current) return; 

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    // Redraw base image first
    // Clear the entire canvas area scaled by DPR
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    ctx.drawImage(imageRef.current, displayConfig.imageX, displayConfig.imageY, displayConfig.imageRenderWidth, displayConfig.imageRenderHeight);

    if (isCropping && uiCropRegion && uiCropRegion.width && uiCropRegion.height && originalImageDimensions) { // Added originalImageDimensions check for safety
      const { imageX, imageY, scaleFactor } = displayConfig;
      
      // uiCropRegion is in original image coordinates. Convert to canvas display coordinates.
      const canvasCropX = imageX + (uiCropRegion.left ?? 0) / scaleFactor;
      const canvasCropY = imageY + (uiCropRegion.top ?? 0) / scaleFactor;
      const canvasCropWidth = uiCropRegion.width / scaleFactor;
      const canvasCropHeight = uiCropRegion.height / scaleFactor;

      // Draw semi-transparent overlay outside crop area
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      // Top bar of overlay
      ctx.fillRect(displayConfig.imageX, displayConfig.imageY, displayConfig.imageRenderWidth, canvasCropY - displayConfig.imageY);
      // Bottom bar of overlay
      ctx.fillRect(displayConfig.imageX, canvasCropY + canvasCropHeight, displayConfig.imageRenderWidth, (displayConfig.imageY + displayConfig.imageRenderHeight) - (canvasCropY + canvasCropHeight));
      // Left bar of overlay (within crop height)
      ctx.fillRect(displayConfig.imageX, canvasCropY, canvasCropX - displayConfig.imageX, canvasCropHeight);
      // Right bar of overlay (within crop height)
      ctx.fillRect(canvasCropX + canvasCropWidth, canvasCropY, (displayConfig.imageX + displayConfig.imageRenderWidth) - (canvasCropX + canvasCropWidth), canvasCropHeight);
      
      // Draw crop rectangle border
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 1 / dpr; 
      ctx.strokeRect(canvasCropX, canvasCropY, canvasCropWidth, canvasCropHeight);

      // --- Draw 3x3 Grid ---
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)"; // Slightly less prominent than border
      ctx.lineWidth = 1 / dpr;

      // Horizontal lines
      const oneThirdHeight = canvasCropHeight / 3;
      ctx.beginPath();
      ctx.moveTo(canvasCropX, canvasCropY + oneThirdHeight);
      ctx.lineTo(canvasCropX + canvasCropWidth, canvasCropY + oneThirdHeight);
      ctx.moveTo(canvasCropX, canvasCropY + 2 * oneThirdHeight);
      ctx.lineTo(canvasCropX + canvasCropWidth, canvasCropY + 2 * oneThirdHeight);
      ctx.stroke();

      // Vertical lines
      const oneThirdWidth = canvasCropWidth / 3;
      ctx.beginPath();
      ctx.moveTo(canvasCropX + oneThirdWidth, canvasCropY);
      ctx.lineTo(canvasCropX + oneThirdWidth, canvasCropY + canvasCropHeight);
      ctx.moveTo(canvasCropX + 2 * oneThirdWidth, canvasCropY);
      ctx.lineTo(canvasCropX + 2 * oneThirdWidth, canvasCropY + canvasCropHeight);
      ctx.stroke();
      // --- End 3x3 Grid ---

      // Draw resize handles
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      const handleScreenSize = HANDLE_SIZE / dpr; // Scale handle size for consistent appearance
      const handles = [
        { id: 'topLeft', x: canvasCropX - handleScreenSize / 2, y: canvasCropY - handleScreenSize / 2 },
        { id: 'topRight', x: canvasCropX + canvasCropWidth - handleScreenSize / 2, y: canvasCropY - handleScreenSize / 2 },
        { id: 'bottomLeft', x: canvasCropX - handleScreenSize / 2, y: canvasCropY + canvasCropHeight - handleScreenSize / 2 },
        { id: 'bottomRight', x: canvasCropX + canvasCropWidth - handleScreenSize / 2, y: canvasCropY + canvasCropHeight - handleScreenSize / 2 },
        { id: 'top', x: canvasCropX + canvasCropWidth/2 - handleScreenSize/2, y: canvasCropY - handleScreenSize/2 },
        { id: 'bottom', x: canvasCropX + canvasCropWidth/2 - handleScreenSize/2, y: canvasCropY + canvasCropHeight - handleScreenSize/2 },
        { id: 'left', x: canvasCropX - handleScreenSize/2, y: canvasCropY + canvasCropHeight/2 - handleScreenSize/2 },
        { id: 'right', x: canvasCropX + canvasCropWidth - handleScreenSize/2, y: canvasCropY + canvasCropHeight/2 - handleScreenSize/2 },
      ];
      handles.forEach(handle => ctx.fillRect(handle.x, handle.y, handleScreenSize, handleScreenSize));
    }
  }, [isCropping, uiCropRegion, displayConfig, originalImageDimensions]); // Added originalImageDimensions as a dependency because it can affect uiCropRegion validity


  const getMousePosOnCanvas = (event: ReactMouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // Mouse coordinates should be relative to the canvas's scaled display size, not its internal resolution
    return {
      x: (event.clientX - rect.left),
      y: (event.clientY - rect.top),
    };
  };

  const getHandleAtPosition = (mouseX: number, mouseY: number): string | null => {
    if (!uiCropRegion || !displayConfig || !uiCropRegion.width || !uiCropRegion.height) return null;

    const { imageX, imageY, scaleFactor } = displayConfig;
    const canvasCropX = imageX + (uiCropRegion.left ?? 0) / scaleFactor;
    const canvasCropY = imageY + (uiCropRegion.top ?? 0) / scaleFactor;
    const canvasCropWidth = uiCropRegion.width / scaleFactor;
    const canvasCropHeight = uiCropRegion.height / scaleFactor;
    
    const handleScreenSize = HANDLE_SIZE / (window.devicePixelRatio || 1);
    const handleTouchRadius = handleScreenSize * 1.5; // Larger touch area for handles

    const cornerHandles = {
        topLeft: { x: canvasCropX, y: canvasCropY },
        topRight: { x: canvasCropX + canvasCropWidth, y: canvasCropY },
        bottomLeft: { x: canvasCropX, y: canvasCropY + canvasCropHeight },
        bottomRight: { x: canvasCropX + canvasCropWidth, y: canvasCropY + canvasCropHeight },
    };
    for (const [id, pos] of Object.entries(cornerHandles)) {
        if (Math.hypot(mouseX - pos.x, mouseY - pos.y) < handleTouchRadius) {
            return id;
        }
    }

    const edgeHandles = {
        top: { x1: canvasCropX, y1: canvasCropY, x2: canvasCropX + canvasCropWidth, y2: canvasCropY },
        bottom: { x1: canvasCropX, y1: canvasCropY + canvasCropHeight, x2: canvasCropX + canvasCropWidth, y2: canvasCropY + canvasCropHeight },
        left: { x1: canvasCropX, y1: canvasCropY, x2: canvasCropX, y2: canvasCropY + canvasCropHeight },
        right: { x1: canvasCropX + canvasCropWidth, y1: canvasCropY, x2: canvasCropX + canvasCropWidth, y2: canvasCropY + canvasCropHeight },
    };
     for (const [id, line] of Object.entries(edgeHandles)) {
        if (id === 'top' || id === 'bottom') {
            if (Math.abs(mouseY - line.y1) < handleTouchRadius && mouseX >= line.x1 - handleTouchRadius && mouseX <= line.x2 + handleTouchRadius) {
                return id;
            }
        } else { 
             if (Math.abs(mouseX - line.x1) < handleTouchRadius && mouseY >= line.y1 - handleTouchRadius && mouseY <= line.y2 + handleTouchRadius) {
                return id;
            }
        }
    }
    
    if (mouseX > canvasCropX && mouseX < canvasCropX + canvasCropWidth &&
        mouseY > canvasCropY && mouseY < canvasCropY + canvasCropHeight) {
        return 'move';
    }
    return null;
  };
  
  const handleMouseDown = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!isCropping || !displayConfig || !originalImageDimensions) return; 
    
    const mousePos = getMousePosOnCanvas(event);
    // Initialize uiCropRegion if it's null when cropping starts (should be handled by EditorLayout's toggleCropMode)
    const currentUiCrop = uiCropRegion || {
        left: 0, top: 0, 
        width: originalImageDimensions.width, height: originalImageDimensions.height
    };
    const handle = getHandleAtPosition(mousePos.x, mousePos.y);

    if (handle) {
        setActiveDragHandle(handle);
        setDragStartCoords(mousePos); 
        setInitialCropOnDragStart({
            left: currentUiCrop.left ?? 0,
            top: currentUiCrop.top ?? 0,
            width: currentUiCrop.width ?? originalImageDimensions.width,
            height: currentUiCrop.height ?? originalImageDimensions.height,
        });
        event.preventDefault();
    }
  };

  const handleMouseMove = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!isCropping || !activeDragHandle || !dragStartCoords || !initialCropOnDragStart || !displayConfig || !originalImageDimensions) return;

    const { x: mouseX, y: mouseY } = getMousePosOnCanvas(event);
    let dxCanvas = mouseX - dragStartCoords.x; // Delta in canvas display pixels
    let dyCanvas = mouseY - dragStartCoords.y;

    const { scaleFactor, imageX, imageY, imageRenderWidth, imageRenderHeight } = displayConfig;

    // Convert initial crop from original image coords to canvas display coords for manipulation
    const initialCanvasCrop = {
        left: imageX + (initialCropOnDragStart.left ?? 0) / scaleFactor,
        top: imageY + (initialCropOnDragStart.top ?? 0) / scaleFactor,
        width: (initialCropOnDragStart.width ?? 0) / scaleFactor,
        height: (initialCropOnDragStart.height ?? 0) / scaleFactor,
    };
    
    let newCanvasLeft = initialCanvasCrop.left;
    let newCanvasTop = initialCanvasCrop.top;
    let newCanvasWidth = initialCanvasCrop.width;
    let newCanvasHeight = initialCanvasCrop.height;

    const aspectRatioVal = getAspectRatioValue(currentAspectRatio);

    // Apply dragging/resizing based on activeDragHandle
    switch (activeDragHandle) {
        case 'move':
            newCanvasLeft += dxCanvas;
            newCanvasTop += dyCanvas;
            break;
        case 'topLeft':
            newCanvasLeft += dxCanvas; newCanvasTop += dyCanvas;
            newCanvasWidth -= dxCanvas; newCanvasHeight -= dyCanvas;
            break;
        case 'topRight':
            newCanvasTop += dyCanvas; newCanvasWidth += dxCanvas; newCanvasHeight -= dyCanvas;
            break;
        case 'bottomLeft':
            newCanvasLeft += dxCanvas; newCanvasWidth -= dxCanvas; newCanvasHeight += dyCanvas;
            break;
        case 'bottomRight':
            newCanvasWidth += dxCanvas; newCanvasHeight += dyCanvas;
            break;
        case 'top': newCanvasTop += dyCanvas; newCanvasHeight -= dyCanvas; break;
        case 'bottom': newCanvasHeight += dyCanvas; break;
        case 'left': newCanvasLeft += dxCanvas; newCanvasWidth -= dxCanvas; break;
        case 'right': newCanvasWidth += dxCanvas; break;
    }

    // Enforce aspect ratio if fixed
    if (aspectRatioVal && activeDragHandle !== 'move') {
        if (activeDragHandle.includes('Left') || activeDragHandle.includes('Right') || activeDragHandle === 'bottomRight' || activeDragHandle === 'topLeft') {
            newCanvasHeight = newCanvasWidth / aspectRatioVal;
        } else if (activeDragHandle.includes('Top') || activeDragHandle.includes('Bottom')) {
            newCanvasWidth = newCanvasHeight * aspectRatioVal;
        }
        // Re-anchor based on handle to keep opposite side fixed (this is complex)
        // Simplified: if top/left handle, adjust position to account for size change
        if (activeDragHandle === 'topLeft') {
            newCanvasLeft = initialCanvasCrop.left + initialCanvasCrop.width - newCanvasWidth;
            newCanvasTop = initialCanvasCrop.top + initialCanvasCrop.height - newCanvasHeight;
        } else if (activeDragHandle === 'topRight') {
            newCanvasTop = initialCanvasCrop.top + initialCanvasCrop.height - newCanvasHeight;
        } else if (activeDragHandle === 'bottomLeft') {
            newCanvasLeft = initialCanvasCrop.left + initialCanvasCrop.width - newCanvasWidth;
        }
        // For edge handles, adjust position to keep center or opposite edge fixed
        if (activeDragHandle === 'top') newCanvasLeft = initialCanvasCrop.left + (initialCanvasCrop.width - newCanvasWidth) / 2;
        if (activeDragHandle === 'bottom') newCanvasLeft = initialCanvasCrop.left + (initialCanvasCrop.width - newCanvasWidth) / 2;
        if (activeDragHandle === 'left') newCanvasTop = initialCanvasCrop.top + (initialCanvasCrop.height - newCanvasHeight) / 2;
        if (activeDragHandle === 'right') newCanvasTop = initialCanvasCrop.top + (initialCanvasCrop.height - newCanvasHeight) / 2;

    }
    
    // Min Size Constraint (on canvas pixels)
    if (newCanvasWidth < MIN_CROP_SIZE) {
        if (activeDragHandle.includes('Left')) newCanvasLeft = newCanvasLeft + newCanvasWidth - MIN_CROP_SIZE;
        newCanvasWidth = MIN_CROP_SIZE;
        if (aspectRatioVal) newCanvasHeight = newCanvasWidth / aspectRatioVal;
    }
    if (newCanvasHeight < MIN_CROP_SIZE) {
        if (activeDragHandle.includes('Top')) newCanvasTop = newCanvasTop + newCanvasHeight - MIN_CROP_SIZE;
        newCanvasHeight = MIN_CROP_SIZE;
        if (aspectRatioVal) newCanvasWidth = newCanvasHeight * aspectRatioVal;
    }
    
    // Boundary Constraints (relative to displayed image on canvas)
    newCanvasLeft = Math.max(imageX, newCanvasLeft);
    newCanvasTop = Math.max(imageY, newCanvasTop);

    if (newCanvasLeft + newCanvasWidth > imageX + imageRenderWidth) {
      newCanvasWidth = imageX + imageRenderWidth - newCanvasLeft;
      if (aspectRatioVal && (activeDragHandle.includes('Right') || activeDragHandle.includes('Left'))) newCanvasHeight = newCanvasWidth / aspectRatioVal;
    }
    if (newCanvasTop + newCanvasHeight > imageY + imageRenderHeight) {
      newCanvasHeight = imageY + imageRenderHeight - newCanvasTop;
      if (aspectRatioVal && (activeDragHandle.includes('Top') || activeDragHandle.includes('Bottom'))) newCanvasWidth = newCanvasHeight * aspectRatioVal;
    }
    // Final pass for min size and aspect ratio after boundary clamp
    if (newCanvasWidth < MIN_CROP_SIZE) newCanvasWidth = MIN_CROP_SIZE;
    if (newCanvasHeight < MIN_CROP_SIZE) newCanvasHeight = MIN_CROP_SIZE;
    if (aspectRatioVal) { // Re-apply aspect ratio if one dimension was clamped at boundary
        // This logic needs to be robust to avoid oscillation
        if (activeDragHandle.includes('Right') || activeDragHandle.includes('Left')) newCanvasHeight = newCanvasWidth / aspectRatioVal;
        else newCanvasWidth = newCanvasHeight * aspectRatioVal;
    }


    // Convert back to original image coordinates before updating parent
    const finalUiCrop: Partial<CropRegion> = {
        left: Math.round((newCanvasLeft - imageX) * scaleFactor),
        top: Math.round((newCanvasTop - imageY) * scaleFactor),
        width: Math.round(newCanvasWidth * scaleFactor),
        height: Math.round(newCanvasHeight * scaleFactor),
    };

    onUiCropRegionChange(finalUiCrop);
  };

  const handleMouseUp = () => {
    if (!isCropping || !activeDragHandle ) return;
    setActiveDragHandle(null);
    setDragStartCoords(null);
    setInitialCropOnDragStart(null);
  };

  const handleMouseLeave = () => {
    if (activeDragHandle) {
        handleMouseUp();
    }
  };


  return (
    <div ref={containerRef} className="flex-1 flex items-center justify-center p-6 bg-muted/30 relative overflow-hidden">
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
          <h2 className="text-2xl font-semibold mb-3">Welcome to QuickTune</h2>
          <p>Click "Open Image" from the File menu to begin editing.</p>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={`shadow-xl ${(!displayUrl || !hasSelectedFile || isLoading && !displayUrl) ? 'hidden' : ''} ${isCropping ? (activeDragHandle ? 'cursor-grabbing' : (getHandleAtPosition(dragStartCoords?.x ?? 0, dragStartCoords?.y ?? 0) ? 'cursor-grab' : 'cursor-crosshair')) : ''}`}
        onMouseDown={isCropping ? handleMouseDown : undefined}
        onMouseMove={isCropping && activeDragHandle ? handleMouseMove : undefined}
        onMouseUp={isCropping && activeDragHandle ? handleMouseUp : undefined}
        onMouseLeave={isCropping && activeDragHandle ? handleMouseLeave : undefined}
      />
    </div>
  );
}