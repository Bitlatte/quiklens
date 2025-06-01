// lib/hooks/useImageZoomPan.ts
import { useState, useEffect, useCallback, RefObject, WheelEvent as ReactWheelEvent, MouseEvent as ReactMouseEvent } from 'react';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;
const ZOOM_SENSITIVITY = 0.001;

interface ZoomPanConfig {
  canvasRef: RefObject<HTMLCanvasElement | null>; // Allow canvasRef.current to be null
  imageRef: RefObject<HTMLImageElement | null>;
  containerDims: { width: number; height: number } | null;
  isCropping: boolean;
}

interface CanvasCoords {
  x: number;
  y: number;
}

export function useImageZoomPan({ canvasRef, imageRef, containerDims, isCropping }: ZoomPanConfig) {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<CanvasCoords>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [lastPanPoint, setLastPanPoint] = useState<CanvasCoords | null>(null);
  const [isSpacebarDown, setIsSpacebarDown] = useState<boolean>(false);

  const getMousePosOnCanvas = useCallback((event: MouseEvent | ReactMouseEvent<HTMLCanvasElement | HTMLDivElement>): CanvasCoords => {
    const canvas = canvasRef.current; // canvasRef.current can be null
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, [canvasRef]);

  const canvasToImageCoords = useCallback((canvasX: number, canvasY: number): CanvasCoords => {
    return {
      x: (canvasX - panOffset.x) / zoomLevel,
      y: (canvasY - panOffset.y) / zoomLevel,
    };
  }, [panOffset, zoomLevel]);

  const calculateAndSetInitialView = useCallback(() => {
    if (!imageRef.current || !containerDims || containerDims.width === 0 || containerDims.height === 0 || !canvasRef.current) {
      return { initialZoom: 1, initialPanOffset: { x: 0, y: 0 } };
    }
    const img = imageRef.current;
    const { width: containerWidth, height: containerHeight } = containerDims;

    if (img.naturalWidth === 0 || img.naturalHeight === 0) {
      return { initialZoom: 1, initialPanOffset: { x: 0, y: 0 } };
    }

    const imageAspectRatio = img.naturalWidth / img.naturalHeight;
    const containerAspectRatio = containerWidth / containerHeight;
    let newZoom;

    if (imageAspectRatio > containerAspectRatio) {
      newZoom = containerWidth / img.naturalWidth;
    } else {
      newZoom = containerHeight / img.naturalHeight;
    }

    const renderWidth = img.naturalWidth * newZoom;
    const renderHeight = img.naturalHeight * newZoom;
    const imageX = (containerWidth - renderWidth) / 2;
    const imageY = (containerHeight - renderHeight) / 2;

    setZoomLevel(newZoom);
    setPanOffset({ x: imageX, y: imageY });
    console.log(`[useImageZoomPan] Calculated initial view. Zoom: ${newZoom}, Pan: {x: ${imageX}, y: ${imageY}}`);
    return { initialZoom: newZoom, initialPanOffset: { x: imageX, y: imageY }};
  }, [imageRef, containerDims, canvasRef]); // Added canvasRef to dependencies


  const handleWheel = useCallback((event: ReactWheelEvent<HTMLCanvasElement>) => {
    if (!imageRef.current || !containerDims || containerDims.width === 0 || containerDims.height === 0 || !canvasRef.current) return;
    event.preventDefault();

    const mousePos = getMousePosOnCanvas(event);
    const imageMousePosBeforeZoom = canvasToImageCoords(mousePos.x, mousePos.y);

    let newZoomLevel = zoomLevel * (1 - event.deltaY * ZOOM_SENSITIVITY);
    newZoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoomLevel));

    const newPanOffsetX = mousePos.x - (imageMousePosBeforeZoom.x * newZoomLevel);
    const newPanOffsetY = mousePos.y - (imageMousePosBeforeZoom.y * newZoomLevel);

    setZoomLevel(newZoomLevel);
    setPanOffset({ x: newPanOffsetX, y: newPanOffsetY });
  }, [zoomLevel, imageRef, containerDims, getMousePosOnCanvas, canvasToImageCoords, canvasRef]); // Added canvasRef

  const startPan = useCallback((event: ReactMouseEvent<HTMLCanvasElement | HTMLDivElement>) => {
    if (isSpacebarDown && !isCropping && canvasRef.current) {
        setIsPanning(true);
        setLastPanPoint(getMousePosOnCanvas(event));
        event.preventDefault();
    }
  }, [isSpacebarDown, isCropping, getMousePosOnCanvas, canvasRef]); // Added canvasRef

  const pan = useCallback((event: ReactMouseEvent<HTMLCanvasElement | HTMLDivElement>) => {
    if (isPanning && lastPanPoint && canvasRef.current) {
        const currentMousePos = getMousePosOnCanvas(event);
        const dx = currentMousePos.x - lastPanPoint.x;
        const dy = currentMousePos.y - lastPanPoint.y;
        setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        setLastPanPoint(currentMousePos);
        event.preventDefault();
    }
  }, [isPanning, lastPanPoint, getMousePosOnCanvas, canvasRef]); // Added canvasRef

  const endPan = useCallback(() => {
    if (isPanning) {
        setIsPanning(false);
        setLastPanPoint(null);
    }
  }, [isPanning]);

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => { // Use globalThis.KeyboardEvent for clarity
      if (e.key === ' ' && !isCropping) {
        setIsSpacebarDown(true);
        e.preventDefault();
      }
    };
    const handleKeyUp = (e: globalThis.KeyboardEvent) => { // Use globalThis.KeyboardEvent
      if (e.key === ' ') {
        setIsSpacebarDown(false);
        if (isPanning) {
            endPan();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isCropping, isPanning, endPan]);

  const resetZoomPan = useCallback(() => {
    return calculateAndSetInitialView();
  }, [calculateAndSetInitialView]);

  return {
    zoomLevel,
    panOffset,
    isPanning,
    isSpacebarDown,
    handleWheel,
    startPan,
    pan,
    endPan,
    getMousePosOnCanvas,
    canvasToImageCoords,
    resetZoomPan,
    setZoomLevel,
    setPanOffset,
  };
}