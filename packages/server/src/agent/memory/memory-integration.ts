/**
 * Memory Integration Module
 * Handles memory strategy integration and agent memory management
 */

import type { BaseMemoryStrategy } from '../../../memory/strategy';

export interface MemoryIntegrationOpts {
  memory?: BaseMemoryStrategy;
}

export interface AgentMemoryContext {
  currentMemory: string;
  conversationHistory: any[];
}

/**
 * Initialize memory for a new task
 */
export async function initializeMemory(
  memory: BaseMemoryStrategy | null
): Promise<void> {
  if (!memory) return;
  await memory.onTurnStart();
}

/**
 * Update agent memory from parsed response
 */
export function updateAgentMemory(
  parsedMemory: string,
  currentMemory: string
): string {
  return parsedMemory || currentMemory;
}

/**
 * Finalize memory after task completion
 */
export async function finalizeMemory(
  memory: BaseMemoryStrategy | null
): Promise<void> {
  if (!memory) return;
  await memory.onSessionEnd();
}

/**
 * Build memory context for tool calls
 */
export function buildMemoryContext(
  agentMemory: string,
  conversation: any[]
): AgentMemoryContext {
  return {
    currentMemory: agentMemory,
    conversationHistory: conversation
  };
}

/**
 * Check if memory is available
 */
export function hasMemory(opts: MemoryIntegrationOpts): boolean {
  return !!opts.memory;
}

/**
 * Get current memory state
 */
export function getMemoryState(agentMemory: string): string {
  return agentMemory || '';
}
