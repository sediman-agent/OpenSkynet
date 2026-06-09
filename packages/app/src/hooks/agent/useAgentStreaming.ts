/**
 * useAgentStreaming Hook
 * Manages agent streaming state, phases, and execution steps
 */

import { useState, useCallback } from 'react';
import type { ExecutionStep } from '@/components/agent/ExecutionDisplay';

export type StreamingPhase = 'thinking' | 'planning' | 'executing' | 'reflecting' | 'retrying' | 'responding';

export interface RetryProgress {
  attempt: number;
  max: number;
  countdown: number;
}

export function useAgentStreaming() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingPhase, setStreamingPhase] = useState<StreamingPhase>('thinking');
  const [currentAction, setCurrentAction] = useState<string | undefined>();
  const [currentDetail, setCurrentDetail] = useState<string | undefined>();
  const [retryProgress, setRetryProgress] = useState<RetryProgress | null>(null);
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([]);

  // Start streaming
  const startStreaming = useCallback(() => {
    setIsStreaming(true);
    setStreamingPhase('thinking');
    setExecutionSteps([]);
    setCurrentAction(undefined);
    setCurrentDetail(undefined);
    setRetryProgress(null);
  }, []);

  // Stop streaming
  const stopStreaming = useCallback(() => {
    setIsStreaming(false);
    setStreamingPhase('thinking');
    setCurrentAction(undefined);
    setCurrentDetail(undefined);
    setRetryProgress(null);
  }, []);

  // Update streaming phase
  const updatePhase = useCallback((phase: StreamingPhase) => {
    setStreamingPhase(phase);
  }, []);

  // Update current action
  const updateAction = useCallback((action: string, detail?: string) => {
    setCurrentAction(action);
    setCurrentDetail(detail);
  }, []);

  // Update retry progress
  const updateRetryProgress = useCallback((progress: RetryProgress | null) => {
    setRetryProgress(progress);
  }, []);

  // Add execution step
  const addExecutionStep = useCallback((step: ExecutionStep) => {
    setExecutionSteps(prev => [...prev, step]);
  }, []);

  // Clear execution steps
  const clearExecutionSteps = useCallback(() => {
    setExecutionSteps([]);
  }, []);

  // Update the last execution step
  const updateLastExecutionStep = useCallback((updates: any) => {
    setExecutionSteps(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const updated = { ...last, ...updates };
      return [...prev.slice(0, -1), updated];
    });
  }, []);

  return {
    isStreaming,
    streamingPhase,
    currentAction,
    currentDetail,
    retryProgress,
    executionSteps,
    startStreaming,
    stopStreaming,
    updatePhase,
    updateAction,
    updateRetryProgress,
    addExecutionStep,
    clearExecutionSteps,
    updateLastExecutionStep
  };
}
