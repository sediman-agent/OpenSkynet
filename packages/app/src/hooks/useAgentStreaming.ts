import { useState, useCallback } from 'react';
import type { ExecutionStep } from '@/components/agent/ExecutionDisplay';

export type StreamingPhase = 'thinking' | 'planning' | 'executing' | 'reflecting' | 'retrying' | 'responding';

export interface RetryProgress {
  attempt: number;
  max: number;
  countdown: number;
}

export interface UseAgentStreamingOptions {
  onChunk?: (delta: string, phase?: StreamingPhase) => void;
  onProgress?: (progress: { phase: StreamingPhase; action?: string; detail?: string }) => void;
  onRetry?: (attempt: number, max: number) => void;
  onIntervention?: (message: string) => void;
  onBrowserOpenRequired?: (reason: string, task: string) => void;
}

interface UseAgentStreamingReturn {
  // State
  isStreaming: boolean;
  streamingPhase: StreamingPhase;
  currentAction: string | undefined;
  currentDetail: string | undefined;
  retryProgress: RetryProgress | null;
  executionSteps: ExecutionStep[];

  // Actions
  startStreaming: () => void;
  stopStreaming: () => void;
  setStreamingPhase: (phase: StreamingPhase) => void;
  setCurrentAction: (action: string | undefined) => void;
  setCurrentDetail: (detail: string | undefined) => void;
  setRetryProgress: (progress: RetryProgress | null) => void;
  addExecutionStep: (step: ExecutionStep) => void;
  setExecutionSteps: (steps: ExecutionStep[]) => void;
  clearExecutionSteps: () => void;

  // Handlers
  handleChunk: (delta: string, phase?: StreamingPhase) => void;
  handleProgress: (progress: { phase: StreamingPhase; action?: string; detail?: string }) => void;
  handleRetry: (attempt: number, max: number) => void;
  handleIntervention: (message: string) => void;
  handleBrowserOpenRequired: (reason: string, task: string) => void;
}

export function useAgentStreaming(options: UseAgentStreamingOptions = {}): UseAgentStreamingReturn {
  const { onChunk, onProgress, onRetry, onIntervention, onBrowserOpenRequired } = options;

  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingPhase, setStreamingPhase] = useState<StreamingPhase>('thinking');
  const [currentAction, setCurrentAction] = useState<string | undefined>();
  const [currentDetail, setCurrentDetail] = useState<string | undefined>();
  const [retryProgress, setRetryProgress] = useState<RetryProgress | null>(null);
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([]);

  const startStreaming = useCallback(() => {
    setIsStreaming(true);
    setStreamingPhase('thinking');
    setRetryProgress(null);
    setExecutionSteps([]);
  }, []);

  const stopStreaming = useCallback(() => {
    setIsStreaming(false);
    setRetryProgress(null);
    setExecutionSteps([]);
  }, []);

  const clearExecutionSteps = useCallback(() => {
    setExecutionSteps([]);
  }, []);

  const handleChunk = useCallback((delta: string, phase: StreamingPhase = 'responding') => {
    if (phase === 'planning') setStreamingPhase('planning');
    else if (phase === 'executing') setStreamingPhase('executing');
    else if (phase === 'thinking') setStreamingPhase('thinking');
    else if (phase === 'reflecting') setStreamingPhase('reflecting');

    if (onChunk) {
      onChunk(delta, phase);
    }
  }, [onChunk]);

  const handleProgress = useCallback((progress: { phase: StreamingPhase; action?: string; detail?: string }) => {
    const { phase, action, detail } = progress;

    setStreamingPhase(phase);
    if (action) setCurrentAction(action);
    if (detail) setCurrentDetail(detail);

    // Update execution steps
    if (action || detail) {
      setExecutionSteps(prev => {
        const lastStep = prev[prev.length - 1];

        // Update existing step if same action
        if (lastStep?.type === phase && lastStep.status === 'running') {
          return prev.map((step, idx) =>
            idx === prev.length - 1
              ? { ...step, detail: detail || step.detail }
              : step
          );
        }

        // Add new step
        return [...prev, {
          id: crypto.randomUUID(),
          type: phase,
          timestamp: Date.now(),
          action: action || phase,
          detail: detail || '',
          status: 'running' as const,
        }];
      });
    }

    if (onProgress) {
      onProgress(progress);
    }
  }, [onProgress]);

  const handleRetry = useCallback((attempt: number, max: number) => {
    setStreamingPhase('retrying');
    setRetryProgress({ attempt, max, countdown: 0 });

    if (onRetry) {
      onRetry(attempt, max);
    }
  }, [onRetry]);

  const handleIntervention = useCallback((message: string) => {
    if (onIntervention) {
      onIntervention(message);
    }
  }, [onIntervention]);

  const handleBrowserOpenRequired = useCallback((reason: string, task: string) => {
    if (onBrowserOpenRequired) {
      onBrowserOpenRequired(reason, task);
    }
  }, [onBrowserOpenRequired]);

  const addExecutionStep = useCallback((step: ExecutionStep) => {
    setExecutionSteps(prev => [...prev, step]);
  }, []);

  return {
    // State
    isStreaming,
    streamingPhase,
    currentAction,
    currentDetail,
    retryProgress,
    executionSteps,

    // Actions
    startStreaming,
    stopStreaming,
    setStreamingPhase,
    setCurrentAction,
    setCurrentDetail,
    setRetryProgress,
    addExecutionStep,
    setExecutionSteps,
    clearExecutionSteps,

    // Handlers
    handleChunk,
    handleProgress,
    handleRetry,
    handleIntervention,
    handleBrowserOpenRequired,
  };
}
