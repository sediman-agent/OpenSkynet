import { useState, useCallback, useEffect, useRef } from 'react';

export interface UsePanelResizeOptions {
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

export interface UsePanelResizeReturn {
  panelWidth: number;
  setPanelWidth: (width: number) => void;
  isResizing: boolean;
  startResize: (e: React.MouseEvent) => void;
  stopResize: () => void;
  onResize: (movementX: number) => void;
  panelRef: React.RefObject<HTMLDivElement | null>;
}

export function usePanelResize(options: UsePanelResizeOptions = {}): UsePanelResizeReturn {
  const {
    defaultWidth = 600,
    minWidth = 400,
    maxWidth = 1200
  } = options;

  const [panelWidth, setPanelWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResize = useCallback(() => {
    setIsResizing(false);
  }, []);

  const onResize = useCallback((movementX: number) => {
    setPanelWidth(prev => {
      const newWidth = prev + movementX;
      return Math.max(minWidth, Math.min(maxWidth, newWidth));
    });
  }, [minWidth, maxWidth]);

  // Handle resize with mouse move
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      onResize(e.movementX);
    };

    const handleMouseUp = () => {
      stopResize();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, onResize, stopResize]);

  return {
    panelWidth,
    setPanelWidth,
    isResizing,
    startResize,
    stopResize,
    onResize,
    panelRef,
  };
}
