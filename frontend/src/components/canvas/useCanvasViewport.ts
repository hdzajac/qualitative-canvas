import { useState, useRef, useCallback, useEffect } from 'react';
import type { NodeView } from './CanvasTypes';

interface UseCanvasViewportProps {
  canvasSize: { w: number; h: number };
  nodes: NodeView[];
  projectId: string | null;
}

interface ViewportTransform {
  zoom: number;
  offset: { x: number; y: number };
}

export interface CanvasViewport extends ViewportTransform {
  setZoom: (zoom: number | ((prev: number) => number)) => void;
  setOffset: (offset: { x: number; y: number } | ((prev: { x: number; y: number }) => { x: number; y: number })) => void;
  isPanning: boolean;
  setIsPanning: (isPanning: boolean) => void;
  isSpacePanning: boolean;
  setIsSpacePanning: (isSpacePanning: boolean) => void;
  worldToScreen: (wx: number, wy: number) => { x: number; y: number };
  screenToWorld: (sx: number, sy: number) => { x: number; y: number };
  fitToContent: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

/**
 * Hook to manage canvas viewport state: zoom, offset, panning
 */
export function useCanvasViewport({ canvasSize, nodes, projectId }: UseCanvasViewportProps): CanvasViewport {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const firstFitDone = useRef(false);

  // Coordinate transformations
  const worldToScreen = useCallback((wx: number, wy: number) => {
    return {
      x: wx * zoom + offset.x,
      y: wy * zoom + offset.y,
    };
  }, [zoom, offset]);

  const screenToWorld = useCallback((sx: number, sy: number) => {
    return {
      x: (sx - offset.x) / zoom,
      y: (sy - offset.y) / zoom,
    };
  }, [zoom, offset]);

  // Fit all nodes into view
  const fitToContent = useCallback(() => {
    if (nodes.length === 0 || canvasSize.w === 0 || canvasSize.h === 0) return;

    // Calculate bounding box of all nodes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach((n) => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    });

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const padding = 40;

    // Calculate zoom to fit
    const zoomX = (canvasSize.w - 2 * padding) / Math.max(1, contentW);
    const zoomY = (canvasSize.h - 2 * padding) / Math.max(1, contentH);
    const newZoom = Math.min(1.5, Math.max(0.1, Math.min(zoomX, zoomY)));

    // Center the content
    const contentCenterX = (minX + maxX) / 2;
    const contentCenterY = (minY + maxY) / 2;
    const newOffset = {
      x: canvasSize.w / 2 - contentCenterX * newZoom,
      y: canvasSize.h / 2 - contentCenterY * newZoom,
    };

    setZoom(newZoom);
    setOffset(newOffset);
  }, [nodes, canvasSize]);

  // Zoom controls
  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(3, z * 1.2));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(0.1, z / 1.2));
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Auto-fit on project change, then fit once when ready
  useEffect(() => {
    firstFitDone.current = false;
  }, [projectId]);

  useEffect(() => {
    if (!firstFitDone.current && nodes.length > 0 && canvasSize.w > 0 && canvasSize.h > 0) {
      fitToContent();
      firstFitDone.current = true;
    }
  }, [nodes.length, canvasSize.w, canvasSize.h, fitToContent]);

  return {
    zoom,
    offset,
    setZoom,
    setOffset,
    isPanning: isSpacePanning,
    setIsPanning: setIsSpacePanning,
    isSpacePanning,
    setIsSpacePanning,
    worldToScreen,
    screenToWorld,
    fitToContent,
    zoomIn,
    zoomOut,
    resetZoom,
  };
}
