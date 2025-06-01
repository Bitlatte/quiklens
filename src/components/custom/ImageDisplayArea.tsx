"use client";

import React, { useRef, useEffect, useState, MouseEvent as ReactMouseEvent, WheelEvent as ReactWheelEvent, useCallback } from 'react';
import type { CropRegion, AspectRatioOption } from '@/lib/types';

const HANDLE_SIZE = 8; 
const MIN_CROP_SIZE_ON_CANVAS = 10; 
const MIN_ZOOM = 0.1; 
const MAX_ZOOM = 10;  
const ZOOM_SENSITIVITY = 0.001;

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

  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [lastPanPoint, setLastPanPoint] = useState<{ x: number; y: number } | null>(null);
  const [isSpacebarDown, setIsSpacebarDown] = useState<boolean>(false);
  
  const [containerDims, setContainerDims] = useState<{ width: number; height: number } | null>(null);

  const [activeDragHandle, setActiveDragHandle] = useState<string | null>(null);
  const [dragStartCoords, setDragStartCoords] = useState<{ x: number; y: number } | null>(null);
  const [initialCropOnDragStart, setInitialCropOnDragStart] = useState<Partial<CropRegion> | null>(null);

  const displayUrl = processedImageUrl || originalImagePreview;

  // Observe container size changes
  useEffect(() => {
    const containerElement = containerRef.current;
    if (!containerElement) return;

    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerDims({ width, height });
        console.log(`[ImageDisplayArea] Resized. Container Dims: ${width}x${height}`);
      }
    });
    observer.observe(containerElement);
    // Initial set
    setContainerDims({width: containerElement.clientWidth, height: containerElement.clientHeight});
    return () => observer.disconnect();
  }, []);


  const calculateAndSetInitialView = useCallback(() => {
    if (!imageRef.current || !containerDims || containerDims.width === 0 || containerDims.height === 0) {
        console.log("[ImageDisplayArea] calculateInitialView: Missing image, container, or container dimensions.");
        return;
    }
    const img = imageRef.current;
    const { width: containerWidth, height: containerHeight } = containerDims;

    if (img.naturalWidth === 0 || img.naturalHeight === 0) {
        console.log("[ImageDisplayArea] calculateInitialView: Image natural dimensions are zero.");
        return;
    }

    const imageAspectRatio = img.naturalWidth / img.naturalHeight;
    const containerAspectRatio = containerWidth / containerHeight;
    let initialZoom;

    if (imageAspectRatio > containerAspectRatio) {
      initialZoom = containerWidth / img.naturalWidth;
    } else {
      initialZoom = containerHeight / img.naturalHeight;
    }
    
    const renderWidth = img.naturalWidth * initialZoom;
    const renderHeight = img.naturalHeight * initialZoom;
    const imageX = (containerWidth - renderWidth) / 2;
    const imageY = (containerHeight - renderHeight) / 2;

    setZoomLevel(initialZoom);
    setPanOffset({ x: imageX, y: imageY });
    console.log(`[ImageDisplayArea] Calculated initial view. Zoom: ${initialZoom}, Pan: {x: ${imageX}, y: ${imageY}}`);
  }, [containerDims]);


  // Load image and then calculate initial fit
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    if (!displayUrl) {
      const ctx = canvas.getContext('2d');
      if (ctx && canvas.width > 0 && canvas.height > 0) {
        ctx.clearRect(0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
      }
      imageRef.current = null;
      setZoomLevel(1); // Reset zoom/pan
      setPanOffset({ x: 0, y: 0 });
      return;
    }

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      console.log(`[ImageDisplayArea] Image loaded: ${img.src}. Natural Dims: ${img.naturalWidth}x${img.naturalHeight}`);
      calculateAndSetInitialView(); 
    };
    img.onerror = () => { console.error("[ImageDisplayArea] Failed to load image for canvas:", displayUrl); imageRef.current = null; };
    img.src = displayUrl;

    return () => { img.onload = null; img.onerror = null; };
  }, [displayUrl, calculateAndSetInitialView]);


  // Main drawing effect (Image, Crop UI)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageRef.current || !originalImageDimensions || !containerDims) return; 
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { width: containerWidth, height: containerHeight } = containerDims;

    if (containerWidth === 0 || containerHeight === 0) return; 

    if (canvas.width !== Math.round(containerWidth * dpr) || canvas.height !== Math.round(containerHeight * dpr)) {
        canvas.width = Math.round(containerWidth * dpr);
        canvas.height = Math.round(containerHeight * dpr);
    }
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${containerHeight}px`;
    
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); 
    ctx.clearRect(0, 0, containerWidth, containerHeight);

    ctx.save();
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(zoomLevel, zoomLevel);
    ctx.drawImage(imageRef.current, 0, 0, imageRef.current.naturalWidth, imageRef.current.naturalHeight);
    ctx.restore();

    if (isCropping && uiCropRegion && uiCropRegion.width && uiCropRegion.height) {
      ctx.save();
      ctx.translate(panOffset.x, panOffset.y);
      ctx.scale(zoomLevel, zoomLevel);

      const cropX = uiCropRegion.left ?? 0;
      const cropY = uiCropRegion.top ?? 0;
      const cropWidth = uiCropRegion.width;
      const cropHeight = uiCropRegion.height;

      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      const imgNatW = imageRef.current.naturalWidth;
      const imgNatH = imageRef.current.naturalHeight;
      ctx.fillRect(0, 0, imgNatW, cropY);
      ctx.fillRect(0, cropY + cropHeight, imgNatW, imgNatH - (cropY + cropHeight));
      ctx.fillRect(0, cropY, cropX, cropHeight);
      ctx.fillRect(cropX + cropWidth, cropY, imgNatW - (cropX + cropWidth), cropHeight);
      
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 1 / zoomLevel / dpr;
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
      const handleScreenSizeTarget = HANDLE_SIZE / dpr;
      const handleImageCoordSize = handleScreenSizeTarget / zoomLevel;

      const handlesData = [
        { id: 'topLeft',     x: cropX,                         y: cropY },
        { id: 'topRight',    x: cropX + cropWidth,             y: cropY },
        { id: 'bottomLeft',  x: cropX,                         y: cropY + cropHeight },
        { id: 'bottomRight', x: cropX + cropWidth,             y: cropY + cropHeight },
        { id: 'top',         x: cropX + cropWidth / 2,         y: cropY },
        { id: 'bottom',      x: cropX + cropWidth / 2,         y: cropY + cropHeight },
        { id: 'left',        x: cropX,                         y: cropY + cropHeight / 2 },
        { id: 'right',       x: cropX + cropWidth,             y: cropY + cropHeight / 2 },
      ];
      handlesData.forEach(h => ctx.fillRect(h.x - handleImageCoordSize/2, h.y - handleImageCoordSize/2, handleImageCoordSize, handleImageCoordSize));
      ctx.restore();
    }

  }, [displayUrl, panOffset, zoomLevel, isCropping, uiCropRegion, originalImageDimensions, containerDims]);

  const getMousePosOnCanvas = (event: ReactMouseEvent<HTMLCanvasElement> | MouseEvent): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const canvasToImageCoords = (canvasX: number, canvasY: number): { x: number; y: number } => {
    return {
      x: (canvasX - panOffset.x) / zoomLevel,
      y: (canvasY - panOffset.y) / zoomLevel,
    };
  };
  
  const imageToCanvasCoords = (imageX: number, imageY: number): { x: number; y: number } => {
      return {
          x: (imageX * zoomLevel) + panOffset.x,
          y: (imageY * zoomLevel) + panOffset.y,
      };
  };

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    if (!imageRef.current || !containerDims || containerDims.width === 0 || containerDims.height === 0) return;
    event.preventDefault();
    
    const mousePos = getMousePosOnCanvas(event);
    const imageMousePosBeforeZoom = canvasToImageCoords(mousePos.x, mousePos.y);

    let newZoomLevel = zoomLevel * (1 - event.deltaY * ZOOM_SENSITIVITY);
    newZoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoomLevel));

    const newPanOffsetX = mousePos.x - (imageMousePosBeforeZoom.x * newZoomLevel);
    const newPanOffsetY = mousePos.y - (imageMousePosBeforeZoom.y * newZoomLevel);

    setZoomLevel(newZoomLevel);
    setPanOffset({ x: newPanOffsetX, y: newPanOffsetY });
  };
  
  useEffect(() => { 
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === ' ') setIsSpacebarDown(true); };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.key === ' ') { setIsSpacebarDown(false); setIsPanning(false); }};
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const getHandleAtPosition = (mouseX_canvas: number, mouseY_canvas: number): string | null => {
    if (!uiCropRegion || !originalImageDimensions || !uiCropRegion.width || !uiCropRegion.height || !imageRef.current) return null;

    const { x: imgMouseX, y: imgMouseY } = canvasToImageCoords(mouseX_canvas, mouseY_canvas);

    const cropX = uiCropRegion.left ?? 0;
    const cropY = uiCropRegion.top ?? 0;
    const cropWidth = uiCropRegion.width;
    const cropHeight = uiCropRegion.height;
    
    const handleImageCoordSize = (HANDLE_SIZE / (window.devicePixelRatio || 1)) / zoomLevel;
    const handleTouchRadiusImageCoords = handleImageCoordSize * 1.5;

    const corners: Record<string, {x: number, y: number}> = { // Explicit type for corners
        topLeft: { x: cropX, y: cropY }, 
        topRight: { x: cropX + cropWidth, y: cropY },
        bottomLeft: { x: cropX, y: cropY + cropHeight }, 
        bottomRight: { x: cropX + cropWidth, y: cropY + cropHeight },
    };
    for (const [id, pos] of Object.entries(corners)) {
        if (Math.hypot(imgMouseX - pos.x, imgMouseY - pos.y) < handleTouchRadiusImageCoords) return id;
    }

    const edges: Record<string, {x1: number, y1: number, x2: number, y2: number}> = { // Explicit type for edges
        top: { x1: cropX, y1: cropY, x2: cropX + cropWidth, y2: cropY },
        bottom: { x1: cropX, y1: cropY + cropHeight, x2: cropX + cropWidth, y2: cropY + cropHeight },
        left: { x1: cropX, y1: cropY, x2: cropX, y2: cropY + cropHeight },
        right: { x1: cropX + cropWidth, y1: cropY, x2: cropX + cropWidth, y2: cropY + cropHeight },
    };
     for (const [id, line] of Object.entries(edges)) {
        if (id === 'top' || id === 'bottom') { 
            if (Math.abs(imgMouseY - line.y1) < handleTouchRadiusImageCoords && imgMouseX >= line.x1 - handleTouchRadiusImageCoords && imgMouseX <= line.x2 + handleTouchRadiusImageCoords) return id;
        } else { 
             if (Math.abs(imgMouseX - line.x1) < handleTouchRadiusImageCoords && imgMouseY >= line.y1 - handleTouchRadiusImageCoords && imgMouseY <= line.y2 + handleTouchRadiusImageCoords) return id;
        }
    }
    
    if (imgMouseX > cropX && imgMouseX < cropX + cropWidth && imgMouseY > cropY && imgMouseY < cropY + cropHeight) return 'move';
    return null;
  };
  
  const handleMouseDownCanvas = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const mousePosCanvas = getMousePosOnCanvas(event);
    if (isSpacebarDown) {
        setIsPanning(true); setLastPanPoint(mousePosCanvas); event.preventDefault(); return;
    }
    if (!isCropping || !originalImageDimensions || !uiCropRegion) return; 
    const handle = getHandleAtPosition(mousePosCanvas.x, mousePosCanvas.y);
    if (handle) {
        setActiveDragHandle(handle); setDragStartCoords(mousePosCanvas); 
        const currentUiCrop = uiCropRegion || {};
        setInitialCropOnDragStart({
            left: currentUiCrop.left ?? 0, top: currentUiCrop.top ?? 0,
            width: currentUiCrop.width ?? originalImageDimensions.width,
            height: currentUiCrop.height ?? originalImageDimensions.height,
        });
        event.preventDefault();
    }
  };

  const handleMouseMoveCanvas = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const mousePosCanvas = getMousePosOnCanvas(event);
    if (isPanning && lastPanPoint) {
        const dx = mousePosCanvas.x - lastPanPoint.x;
        const dy = mousePosCanvas.y - lastPanPoint.y;
        setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        setLastPanPoint(mousePosCanvas);
        event.preventDefault(); return;
    }
    if (!isCropping || !activeDragHandle || !dragStartCoords || !initialCropOnDragStart || !originalImageDimensions || !uiCropRegion) return;

    const startImgCoords = canvasToImageCoords(dragStartCoords.x, dragStartCoords.y);
    const currentImgCoords = canvasToImageCoords(mousePosCanvas.x, mousePosCanvas.y);
    const deltaImgX = currentImgCoords.x - startImgCoords.x;
    const deltaImgY = currentImgCoords.y - startImgCoords.y;

    let newLeft = initialCropOnDragStart.left ?? 0;
    let newTop = initialCropOnDragStart.top ?? 0;
    let newWidth = initialCropOnDragStart.width ?? 0;
    let newHeight = initialCropOnDragStart.height ?? 0;

    const aspectRatioVal = getAspectRatioValue(currentAspectRatio);
    const minCropSizeOriginal = MIN_CROP_SIZE_ON_CANVAS / zoomLevel;

    switch (activeDragHandle) {
        case 'move': newLeft += deltaImgX; newTop += deltaImgY; break;
        case 'topLeft': newLeft += deltaImgX; newTop += deltaImgY; newWidth -= deltaImgX; newHeight -= deltaImgY; break;
        case 'topRight': newTop += deltaImgY; newWidth += deltaImgX; newHeight -= deltaImgY; break;
        case 'bottomLeft': newLeft += deltaImgX; newWidth -= deltaImgX; newHeight += deltaImgY; break;
        case 'bottomRight': newWidth += deltaImgX; newHeight += deltaImgY; break;
        case 'top': newTop += deltaImgY; newHeight -= deltaImgY; break;
        case 'bottom': newHeight += deltaImgY; break;
        case 'left': newLeft += deltaImgX; newWidth -= deltaImgX; break;
        case 'right': newWidth += deltaImgX; break;
    }

    if (newWidth < 0) { newLeft += newWidth; newWidth = Math.abs(newWidth); }
    if (newHeight < 0) { newTop += newHeight; newHeight = Math.abs(newHeight); }

    if (aspectRatioVal && activeDragHandle !== 'move') {
      if (activeDragHandle.includes('Left') || activeDragHandle.includes('Right') || activeDragHandle === 'bottomRight' || activeDragHandle === 'topLeft') {
          newHeight = newWidth / aspectRatioVal;
      } else if (activeDragHandle.includes('Top') || activeDragHandle.includes('Bottom')) {
          newWidth = newHeight * aspectRatioVal;
      }
      // Re-anchor logic for corner handles when aspect ratio is fixed
      if (activeDragHandle === 'topLeft') {
          newLeft = (initialCropOnDragStart.left ?? 0) + (initialCropOnDragStart.width ?? 0) - newWidth;
          newTop = (initialCropOnDragStart.top ?? 0) + (initialCropOnDragStart.height ?? 0) - newHeight;
      } else if (activeDragHandle === 'topRight') {
          newTop = (initialCropOnDragStart.top ?? 0) + (initialCropOnDragStart.height ?? 0) - newHeight;
      } else if (activeDragHandle === 'bottomLeft') {
          newLeft = (initialCropOnDragStart.left ?? 0) + (initialCropOnDragStart.width ?? 0) - newWidth;
      }
      // For edge handles, adjust position to keep center or opposite edge fixed
      if (activeDragHandle === 'top') newLeft = (initialCropOnDragStart.left ?? 0) + ((initialCropOnDragStart.width ?? 0) - newWidth) / 2;
      if (activeDragHandle === 'bottom') newLeft = (initialCropOnDragStart.left ?? 0) + ((initialCropOnDragStart.width ?? 0) - newWidth) / 2;
      if (activeDragHandle === 'left') newTop = (initialCropOnDragStart.top ?? 0) + ((initialCropOnDragStart.height ?? 0) - newHeight) / 2;
      if (activeDragHandle === 'right') newTop = (initialCropOnDragStart.top ?? 0) + ((initialCropOnDragStart.height ?? 0) - newHeight) / 2;
    }
    
    newWidth = Math.max(minCropSizeOriginal, newWidth);
    newHeight = Math.max(minCropSizeOriginal, newHeight);

    newLeft = Math.max(0, Math.min(newLeft, originalImageDimensions.width - newWidth));
    newTop = Math.max(0, Math.min(newTop, originalImageDimensions.height - newHeight));
    newWidth = Math.min(newWidth, originalImageDimensions.width - newLeft);
    newHeight = Math.min(newHeight, originalImageDimensions.height - newTop);

    if (aspectRatioVal) {
        if (Math.abs(newWidth / newHeight - aspectRatioVal) > 0.001) { 
            let h = newWidth / aspectRatioVal;
            if (h + newTop <= originalImageDimensions.height && h >= minCropSizeOriginal) {
                newHeight = h;
            } else { 
                let w = newHeight * aspectRatioVal;
                if (w + newLeft <= originalImageDimensions.width && w >= minCropSizeOriginal) {
                    newWidth = w;
                }
            }
        }
    }

    onUiCropRegionChange({
        left: Math.round(newLeft), top: Math.round(newTop),
        width: Math.round(newWidth), height: Math.round(newHeight),
    });
  };

  const handleMouseUpCanvas = () => {
    if (isPanning) setIsPanning(false);
    if (activeDragHandle) setActiveDragHandle(null);
    setLastPanPoint(null); setDragStartCoords(null); setInitialCropOnDragStart(null);
  };
  const handleMouseLeaveCanvas = () => {
    if (isPanning) setIsPanning(false);
    if (activeDragHandle) handleMouseUpCanvas();
  };

  return (
    <div 
        ref={containerRef} 
        className="flex-1 flex items-center justify-center p-6 bg-muted/30 relative overflow-hidden"
        style={{ cursor: isSpacebarDown ? (isPanning ? 'grabbing' : 'grab') : (isCropping && activeDragHandle ? 'grabbing' : (isCropping ? 'crosshair' : 'default')) }}
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
          <h2 className="text-2xl font-semibold mb-3">Welcome to QuickTune</h2>
          <p>Click "Open Image" from the File menu to begin editing.</p>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={`shadow-xl ${(!displayUrl || !hasSelectedFile || (isLoading && !displayUrl)) ? 'hidden' : ''}`}
        onWheel={hasSelectedFile ? handleWheel : undefined} // Only enable wheel if image is loaded
        onMouseDown={hasSelectedFile ? handleMouseDownCanvas : undefined} // Only enable if image is loaded
        onMouseMove={hasSelectedFile && (isPanning || activeDragHandle) ? handleMouseMoveCanvas : undefined}
        onMouseUp={hasSelectedFile && (isPanning || activeDragHandle) ? handleMouseUpCanvas : undefined}
        onMouseLeave={hasSelectedFile && (isPanning || activeDragHandle) ? handleMouseLeaveCanvas : undefined}
      />
    </div>
  );
}