/**
 * VS Code-Style Streaming Renderer
 * Implements progressive rendering with word-rate limiting and smooth transitions
 *
 * Based on VS Code's ChatListRenderer pipeline:
 * - Microtask batching for chunk accumulation
 * - 50ms timer-based progressive rendering
 * - Word-rate limiting (40-2000 words/s)
 * - Smooth CSS transitions
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// ============================================================================
// VS Code Streaming Constants
// ============================================================================
const VS_CODE_STREAMING = {
  RENDER_INTERVAL_MS: 50,        // 50ms timer like VS Code
  MIN_WORD_RATE: 40,            // Minimum words per second
  MAX_WORD_RATE: 2000,          // Maximum words per second
  MIN_AFTER_COMPLETE: 80,       // Minimum rate after completion
  BATCH_DELAY_MS: 0,            // Microtask scheduling (0 = next microtask)
} as const;

// ============================================================================
// Types
// ============================================================================
interface StreamingContent {
  full: string;                  // Full accumulated content
  visible: string;               // Currently visible content
  isStreaming: boolean;
  isComplete: boolean;
  wordRate: number;
  lastUpdateTime: number;
}

interface VSCodeStreamingOptions {
  wordRate?: number;             // Target words/second (auto-detected if not provided)
  onProgress?: (visible: string, full: string) => void;
  onComplete?: (final: string) => void;
}

// ============================================================================
// Utilities
// ============================================================================
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function calculateWordRate(content: string, elapsedMs: number): number {
  const words = countWords(content);
  if (elapsedMs <= 0) return VS_CODE_STREAMING.MIN_WORD_RATE;
  const wordsPerSecond = (words / elapsedMs) * 1000;
  return Math.max(
    VS_CODE_STREAMING.MIN_WORD_RATE,
    Math.min(VS_CODE_STREAMING.MAX_WORD_RATE, wordsPerSecond)
  );
}

// ============================================================================
// Main Hook
// ============================================================================
export function useVSCodeStreaming(options: VSCodeStreamingOptions = {}) {
  const [content, setContent] = useState<StreamingContent>({
    full: '',
    visible: '',
    isStreaming: false,
    isComplete: false,
    wordRate: VS_CODE_STREAMING.MIN_WORD_RATE,
    lastUpdateTime: Date.now(),
  });

  const chunkQueueRef = useRef<string[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const totalChunksRef = useRef<number>(0);

  /**
   * Flush queued chunks via microtask (VS Code Layer 1 batching)
   */
  const flushChunks = useCallback(() => {
    if (chunkQueueRef.current.length === 0) return;

    const chunks = chunkQueueRef.current.splice(0);
    const combined = chunks.join('');

    setContent(prev => {
      const newFull = prev.full + combined;
      const elapsed = Date.now() - startTimeRef.current;
      const detectedRate = calculateWordRate(newFull, elapsed);

      return {
        ...prev,
        full: newFull,
        wordRate: options.wordRate || detectedRate,
      };
    });

    totalChunksRef.current += chunks.length;
  }, [options.wordRate]);

  /**
   * Add a chunk to the stream (queues for microtask flush)
   */
  const addChunk = useCallback((chunk: string) => {
    if (!chunk) return;

    chunkQueueRef.current.push(chunk);

    // Schedule microtask flush on first chunk (VS Code batching)
    if (chunkQueueRef.current.length === 1) {
      queueMicrotask(flushChunks);
    }
  }, [flushChunks]);

  /**
   * Progressive rendering step (VS Code Layer 4: 50ms timer)
   */
  const progressiveRender = useCallback(() => {
    setContent(prev => {
      // If everything is visible and complete, stop timer
      if (prev.visible === prev.full && prev.isComplete) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        return prev;
      }

      const now = Date.now();
      const timeSinceUpdate = now - prev.lastUpdateTime;
      const targetRate = prev.isComplete
        ? Math.max(prev.wordRate, VS_CODE_STREAMING.MIN_AFTER_COMPLETE)
        : prev.wordRate;

      // Calculate how many words to reveal this tick
      const wordsToReveal = Math.floor((targetRate * timeSinceUpdate) / 1000);
      const currentVisibleWords = countWords(prev.visible);
      const totalWords = countWords(prev.full);

      let newVisible = prev.visible;

      if (currentVisibleWords < totalWords && wordsToReveal > 0) {
        // Reveal more content based on word count
        const targetWordCount = Math.min(currentVisibleWords + wordsToReveal, totalWords);
        const words = prev.full.split(/\s+/);
        newVisible = words.slice(0, targetWordCount).join(' ');

        // Trigger progress callback
        options.onProgress?.(newVisible, prev.full);
      } else if (prev.isComplete && prev.visible !== prev.full) {
        // Final pass: ensure all content is visible
        newVisible = prev.full;
      }

      // Check if fully revealed
      const isFullyRevealed = newVisible === prev.full;

      if (isFullyRevealed && prev.isComplete) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        options.onComplete?.(prev.full);
      }

      return {
        ...prev,
        visible: newVisible,
        lastUpdateTime: now,
      };
    });
  }, [options]);

  /**
   * Start streaming
   */
  const startStreaming = useCallback(() => {
    startTimeRef.current = Date.now();
    totalChunksRef.current = 0;

    setContent(prev => ({
      full: '',
      visible: '',
      isStreaming: true,
      isComplete: false,
      wordRate: VS_CODE_STREAMING.MIN_WORD_RATE,
      lastUpdateTime: Date.now(),
    }));

    // Start 50ms progressive render timer (VS Code style)
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    timerRef.current = setInterval(() => {
      progressiveRender();
    }, VS_CODE_STREAMING.RENDER_INTERVAL_MS);
  }, [progressiveRender]);

  /**
   * Stop streaming
   */
  const stopStreaming = useCallback(() => {
    // Flush any remaining chunks
    flushChunks();

    setContent(prev => ({
      ...prev,
      isStreaming: false,
      isComplete: true,
    }));

    // Clear timer on next tick (allows final render pass)
    setTimeout(() => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }, VS_CODE_STREAMING.RENDER_INTERVAL_MS + 10);
  }, [flushChunks]);

  /**
   * Reset streaming state
   */
  const reset = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    chunkQueueRef.current = [];
    startTimeRef.current = 0;
    totalChunksRef.current = 0;

    setContent({
      full: '',
      visible: '',
      isStreaming: false,
      isComplete: false,
      wordRate: VS_CODE_STREAMING.MIN_WORD_RATE,
      lastUpdateTime: Date.now(),
    });
  }, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  return {
    // Content state
    fullContent: content.full,
    visibleContent: content.visible,
    isStreaming: content.isStreaming,
    isComplete: content.isComplete,

    // Streaming controls
    startStreaming,
    stopStreaming,
    reset,
    addChunk,

    // Stats
    wordRate: content.wordRate,
    progress: content.full.length > 0 ? content.visible.length / content.full.length : 0,
  };
}
