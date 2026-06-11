/**
 * Agent Factory
 *
 * Factory functions for creating enhanced agents with all features
 *
 * @module agent/factory
 */

import type { LLMProvider } from '../llm/provider';
import { EnhancedAgentLoop, EnhancedAgentLoopOpts } from './execution/enhanced-loop';
import { StructuredProvider, createStructuredProvider } from '../llm/structured';
import { HierarchicalMemory } from '../memory/hierarchical';
import { createTaskPlanner } from './planning';
import type { BrowserSession } from '../browser';
import { ToolBus } from './tools';
import { getConfig } from '../core/config';
import { createLogger } from '../core/logging';
import type { BaseMemoryStrategy } from '../memory/strategy';

const logger = createLogger('agent-factory');

export interface EnhancedAgentFactoryOpts {
  llmProvider: LLMProvider;
  apiKey?: string;
  browserSession?: BrowserSession;
  useSmartPerception?: boolean;
  useStructuredOutput?: boolean;
  useHierarchicalMemory?: boolean;
  useTaskPlanning?: boolean;
  maxIterations?: number;
  workingDirectory?: string;
}

/**
 * Create fully enhanced agent with all features
 */
export function createEnhancedAgent(opts: EnhancedAgentFactoryOpts): {
  agent: EnhancedAgentLoop;
  memory?: BaseMemoryStrategy;
  planner?: ReturnType<typeof createTaskPlanner>;
} {
  const config = getConfig();

  const {
    llmProvider,
    apiKey,
    browserSession,
    useSmartPerception = false,
    useStructuredOutput = true,
    useHierarchicalMemory = false,
    useTaskPlanning = false,
    maxIterations,
    workingDirectory
  } = opts;

  // Create structured LLM provider if enabled
  let structuredLLMProvider: StructuredProvider | undefined;
  if (useStructuredOutput && llmProvider) {
    structuredLLMProvider = createStructuredProvider(llmProvider);
    logger.info('[AgentFactory] Structured LLM provider created');
  }

  // Create hierarchical memory if enabled
  let memory: BaseMemoryStrategy | undefined;
  if (useHierarchicalMemory) {
    memory = new HierarchicalMemory() as unknown as BaseMemoryStrategy;
    logger.info('[AgentFactory] Hierarchical memory enabled');
  }

  // Create task planner if enabled
  let planner;
  if (useTaskPlanning && llmProvider) {
    planner = createTaskPlanner(llmProvider);
    logger.info('[AgentFactory] Task planner enabled');
  }

  // Create agent loop
  const agentOpts: EnhancedAgentLoopOpts = {
    llmProvider,
    structuredLLMProvider,
    browserSession,
    memory,
    useSmartPerception,
    maxIterations,
    workingDirectory
  };

  const agent = new EnhancedAgentLoop(agentOpts);

  logger.info({
    useSmartPerception,
    useStructuredOutput,
    useHierarchicalMemory,
    useTaskPlanning
  }, '[AgentFactory] Enhanced agent created');

  return {
    agent,
    memory,
    planner
  };
}


