/**
 * Agent Loop Types
 * Type definitions for agent execution loop
 */

import type { LLMProvider } from "../../llm/provider";
import type { BaseMemoryStrategy } from "../../memory/strategy";
import type { SkillEngine } from "../../skills/engine";
import type { ToolBus } from "../tools/bus";

/**
 * Message format for agent conversations
 */
export type AgentMessage = {
  role: string;
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
};

/**
 * Task classification categories
 */
export type TaskCategory = "simple" | "complex" | "browser" | "research" | "creative";

/**
 * Task planning structure
 */
export type TaskPlan = {
  steps: Array<{
    description: string;
    strategy: string;
  }>;
};

/**
 * Configuration options for AgentLoop
 */
export interface AgentLoopOpts {
  llmProvider: LLMProvider;
  browserSession?: any;
  memory?: BaseMemoryStrategy;
  skillEngine?: SkillEngine;
  toolBus?: ToolBus;
  headless?: boolean;
  terminalAllowed?: boolean;
}

/**
 * Loop execution state
 */
export interface LoopState {
  conversation: AgentMessage[];
  currentUrl: string;
  currentTitle: string;
  actionHistory: Map<string, number>;
  currentTask: string;
  steps: any[];
}

/**
 * Execution metrics
 */
export interface ExecutionMetrics {
  totalTokens: number;
  totalIterations: number;
  totalTimeMs: number;
  successfulActions: number;
  failedActions: number;
  loopDetections: number;
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  success: boolean;
  output: any;
  error?: string;
  duration?: number;
}
