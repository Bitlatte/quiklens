// lib/hooks/useImageCropHandler.ts
import { useState, useCallback, RefObject, MouseEvent as ReactMouseEvent } from 'react';
import type { CropRegion, AspectRatioOption } from '@/lib/types';

const HANDLE_SIZE = 8; // Screen pixels for handle visual size
const MIN_CROP_SIZE_ON_CANVAS = 10; // Minimum crop dimension on the canvas

interface CropHandlerConfig {
  isCropping: boolean;
  uiCropRegion: Partial<CropRegion> | null;
  onUiCropRegionChange: (newRegion: Partial<CropRegion>) => void;
  currentViewDimensions: { width: number; height: number } | null;
  currentAspectRatio: AspectRatioOption;
  zoomLevel: number;
  canvasToImageCoords: (canvasX: number, canvasY: number) => { x: number; y: number };
  // Corrected type to match what useImageZoomPan provides
  getMousePosOnCanvas: (event: MouseEvent | ReactMouseEvent<HTMLCanvasElement | HTMLDivElement>) => { x: number; y: number };
  imageRef: RefObject<HTMLImageElement | null>;
}

const getAspectRatioValue = (aspectRatio: AspectRatioOption): number | null => {
  if (aspectRatio === "1:1") return 1;
  if (aspectRatio === "16:9") return 16 / 9;
  if (aspectRatio === "9:16") return 9 / 16;
  if (aspectRatio === "4:3") return 4 / 3;
  if (aspectRatio === "3:4") return 3 / 4;
  return null;
};

export function useImageCropHandler({
  isCropping,
  uiCropRegion,
  onUiCropRegionChange,
  currentViewDimensions,
  currentAspectRatio,
  zoomLevel,
  canvasToImageCoords,
  getMousePosOnCanvas,
  imageRef,
}: CropHandlerConfig) {
  const [activeDragHandle, setActiveDragHandle] = useState<string | null>(null);
  const [dragStartCoords, setDragStartCoords] = useState<{ x: number; y: number } | null>(null);
  const [initialCropOnDragStart, setInitialCropOnDragStart] = useState<Partial<CropRegion> | null>(null);

  const getHandleAtPosition = useCallback((mouseX_canvas: number, mouseY_canvas: number): string | null => {
    if (!uiCropRegion || !imageRef.current || !uiCropRegion.width || !uiCropRegion.height || !currentViewDimensions) return null;

    const { x: imgMouseX, y: imgMouseY } = canvasToImageCoords(mouseX_canvas, mouseY_canvas);

    const cropX = uiCropRegion.left ?? 0;
    const cropY = uiCropRegion.top ?? 0;
    const cropWidth = uiCropRegion.width;
    const cropHeight = uiCropRegion.height;

    const handleTouchRadiusImageCoords = (HANDLE_SIZE * 1.5) / zoomLevel;

    const corners: Record<string, {x: number, y: number}> = {
        topLeft: { x: cropX, y: cropY },
        topRight: { x: cropX + cropWidth, y: cropY },
        bottomLeft: { x: cropX, y: cropY + cropHeight },
        bottomRight: { x: cropX + cropWidth, y: cropY + cropHeight },
    };
    for (const [id, pos] of Object.entries(corners)) {
        if (Math.hypot(imgMouseX - pos.x, imgMouseY - pos.y) < handleTouchRadiusImageCoords) return id;
    }

    const edges: Record<string, {x1: number, y1: number, x2: number, y2: number}> = {
        top: { x1: cropX, y1: cropY, x2: cropX + cropWidth, y2: cropY },
        bottom: { x1: cropX, y1: cropY + cropHeight, x2: cropX + cropWidth, y2: cropY + cropHeight },
        left: { x1: cropX, y1: cropY, x2: cropX, y2: cropY + cropHeight },
        right: { x1: cropX + cropWidth, y1: cropY, x2: cropX + cropWidth, y2: cropY + cropHeight },
    };
    for (const [id, line] of Object.entries(edges)) {
        const buffer = handleTouchRadiusImageCoords;
        if (id === 'top' || id === 'bottom') {
            if (imgMouseX >= line.x1 - buffer && imgMouseX <= line.x2 + buffer && Math.abs(imgMouseY - line.y1) < buffer) return id;
        } else {
            if (imgMouseY >= line.y1 - buffer && imgMouseY <= line.y2 + buffer && Math.abs(imgMouseX - line.x1) < buffer) return id;
        }
    }

    if (imgMouseX > cropX && imgMouseX < cropX + cropWidth && imgMouseY > cropY && imgMouseY < cropY + cropHeight) return 'move';
    return null;
  }, [uiCropRegion, imageRef, currentViewDimensions, canvasToImageCoords, zoomLevel]);

  const cropMouseDownHandler = useCallback((event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!isCropping || !currentViewDimensions || !uiCropRegion || !imageRef.current) return false;

    const mousePosCanvas = getMousePosOnCanvas(event);
    const handle = getHandleAtPosition(mousePosCanvas.x, mousePosCanvas.y);

    if (handle) {
        setActiveDragHandle(handle);
        setDragStartCoords(mousePosCanvas);
        setInitialCropOnDragStart({
            left: uiCropRegion.left ?? 0,
            top: uiCropRegion.top ?? 0,
            width: uiCropRegion.width ?? currentViewDimensions.width,
            height: uiCropRegion.height ?? currentViewDimensions.height,
        });
        event.preventDefault();
        return true;
    }
    return false;
  }, [isCropping, currentViewDimensions, uiCropRegion, imageRef, getMousePosOnCanvas, getHandleAtPosition]);

  const cropMouseMoveHandler = useCallback((event: MouseEvent | ReactMouseEvent<HTMLCanvasElement | HTMLDivElement>) => { // Matched type with getMousePosOnCanvas
    if (!isCropping || !activeDragHandle || !dragStartCoords || !initialCropOnDragStart || !currentViewDimensions || !uiCropRegion || !imageRef.current) return;

    const mousePosCanvas = getMousePosOnCanvas(event);
    const startImgCoords = canvasToImageCoords(dragStartCoords.x, dragStartCoords.y);
    const currentImgCoords = canvasToImageCoords(mousePosCanvas.x, mousePosCanvas.y);
    const deltaImgX = currentImgCoords.x - startImgCoords.x;
    const deltaImgY = currentImgCoords.y - startImgCoords.y;

    let newLeft = initialCropOnDragStart.left ?? 0;
    let newTop = initialCropOnDragStart.top ?? 0;
    let newWidth = initialCropOnDragStart.width ?? 0;
    let newHeight = initialCropOnDragStart.height ?? 0;

    const aspectRatioVal = getAspectRatioValue(currentAspectRatio);
    const minCropSizeImageCoords = MIN_CROP_SIZE_ON_CANVAS / zoomLevel;

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
      const initialRight = (initialCropOnDragStart.left ?? 0) + (initialCropOnDragStart.width ?? 0);
      const initialBottom = (initialCropOnDragStart.top ?? 0) + (initialCropOnDragStart.height ?? 0);
      if (activeDragHandle.includes('Left') || activeDragHandle.includes('Right')) {
          newHeight = newWidth / aspectRatioVal;
      } else if (activeDragHandle.includes('Top') || activeDragHandle.includes('Bottom')) {
          newWidth = newHeight * aspectRatioVal;
      } else {
          newHeight = newWidth / aspectRatioVal;
      }
      if (activeDragHandle === 'topLeft') { newLeft = initialRight - newWidth; newTop = initialBottom - newHeight; }
      else if (activeDragHandle === 'topRight') { newTop = initialBottom - newHeight; }
      else if (activeDragHandle === 'bottomLeft') { newLeft = initialRight - newWidth; }
      if (activeDragHandle === 'top') { newTop = initialBottom - newHeight; newLeft = (initialCropOnDragStart.left ?? 0) + ((initialCropOnDragStart.width ?? 0) - newWidth) / 2; }
      else if (activeDragHandle === 'bottom') { newLeft = (initialCropOnDragStart.left ?? 0) + ((initialCropOnDragStart.width ?? 0) - newWidth) / 2; }
      else if (activeDragHandle === 'left') { newLeft = initialRight - newWidth; newTop = (initialCropOnDragStart.top ?? 0) + ((initialCropOnDragStart.height ?? 0) - newHeight) / 2; }
      else if (activeDragHandle === 'right') { newTop = (initialCropOnDragStart.top ?? 0) + ((initialCropOnDragStart.height ?? 0) - newHeight) / 2;}
    }

    // Clamp to minimum size
    newWidth = Math.max(minCropSizeImageCoords, newWidth);
    newHeight = Math.max(minCropSizeImageCoords, newHeight);

    // Clamp to boundaries of currentViewDimensions (the image being cropped on canvas)
    newLeft = Math.max(0, Math.min(newLeft, currentViewDimensions.width - newWidth));
    newTop = Math.max(0, Math.min(newTop, currentViewDimensions.height - newHeight));
    newWidth = Math.min(newWidth, currentViewDimensions.width - newLeft); // Re-clamp width based on newLeft
    newHeight = Math.min(newHeight, currentViewDimensions.height - newTop); // Re-clamp height based on newTop

    // Final enforcement of aspect ratio if dimensions were clamped or are off due to complex interaction
    if (aspectRatioVal && activeDragHandle !== 'move') {
        const currentAR = newWidth / newHeight;
        if (Math.abs(currentAR - aspectRatioVal) > 0.01) { // If still not matching aspect ratio
            // This part tries to adjust one dimension to match the aspect ratio,
            // prioritizing the one that seems to have more "room" or was less directly manipulated
            // by the last boundary clamp. This can be tricky logic.
            if (currentViewDimensions.width - newLeft - (newHeight * aspectRatioVal) > currentViewDimensions.height - newTop - (newWidth / aspectRatioVal) ) {
                 newWidth = newHeight * aspectRatioVal;
            } else {
                 newHeight = newWidth / aspectRatioVal;
            }
             // Re-clamp to minimums after aspect ratio correction
            newWidth = Math.max(minCropSizeImageCoords, newWidth);
            newHeight = Math.max(minCropSizeImageCoords, newHeight);
        }
    }

    onUiCropRegionChange({
        left: Math.round(newLeft), top: Math.round(newTop),
        width: Math.round(newWidth), height: Math.round(newHeight),
    });
  }, [
      isCropping, activeDragHandle, dragStartCoords, initialCropOnDragStart, currentViewDimensions,
      uiCropRegion, imageRef, getMousePosOnCanvas, canvasToImageCoords, currentAspectRatio,
      zoomLevel, onUiCropRegionChange
  ]);

  const cropMouseUpHandler = useCallback(() => {
    if (activeDragHandle) {
        setActiveDragHandle(null);
    }
  }, [activeDragHandle]);

  const cropMouseLeaveHandler = useCallback(() => {
    if (activeDragHandle) {
        cropMouseUpHandler();
    }
  }, [activeDragHandle, cropMouseUpHandler]);

  return {
    activeDragHandle,
    getHandleAtPosition,
    cropMouseDownHandler,
    cropMouseMoveHandler,
    cropMouseUpHandler,
    cropMouseLeaveHandler,
  };
}