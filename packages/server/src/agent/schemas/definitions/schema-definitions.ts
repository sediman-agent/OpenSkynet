/**
 * Schema Definitions
 * All Zod schema definitions for agent responses
 */

import { z } from 'zod';

// ============================================================================
// Core Agent Thought Schema
// ============================================================================

/**
 * The structured thought process that guides agent decisions
 */
export const AgentThoughtSchema = z.object({
  thinking: z.string()
    .min(1, 'Thinking cannot be empty')
    .describe('Reasoning about current state and chosen actions'),

  evaluation: z.string()
    .min(1, 'Evaluation cannot be empty')
    .regex(/(success|failure|uncertain)/i, 'Evaluation must indicate success/failure/uncertain')
    .describe('Success/failure evaluation of previous action'),

  memory: z.string()
    .min(1, 'Memory cannot be empty')
    .describe('Progress tracking to persist across steps'),

  nextGoal: z.string()
    .min(1, 'Next goal cannot be empty')
    .max(200, 'Next goal should be concise')
    .describe('One clear sentence stating what to accomplish next'),
});

export type AgentThought = z.infer<typeof AgentThoughtSchema>;

// ============================================================================
// Tool Call Schema
// ============================================================================

/**
 * Individual tool/action call specification
 */
export const ToolCallSchema = z.object({
  name: z.string()
    .min(1)
    .regex(/^[a-z_][a-z0-9_]*$/, 'Tool name must be snake_case')
    .describe('Tool name to call'),

  arguments: z.record(z.any())
    .describe('Tool arguments (structure depends on tool)'),

  reasoning: z.string()
    .optional()
    .describe('Why this tool is being called'),
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

// ============================================================================
// Agent Response Schema
// ============================================================================

/**
 * Complete agent response with all required fields
 */
export const AgentResponseSchema = z.object({
  thought: AgentThoughtSchema,

  actions: z.array(ToolCallSchema)
    .max(10, 'Cannot execute more than 10 actions at once')
    .optional()
    .describe('Tool calls to execute (optional for text-only responses)'),

  done: z.boolean()
    .describe('True if task is complete'),

  summary: z.string()
    .optional()
    .describe('Final summary when done=true (must include all relevant findings)'),

  confidence: z.number()
    .min(0)
    .max(1)
    .optional()
    .describe('Confidence in this response (0-1)'),

  estimatedRemainingSteps: z.number()
    .min(0)
    .optional()
    .describe('Estimated number of remaining steps'),
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

// ============================================================================
// Task Decomposition Schema
// ============================================================================

/**
 * Schema for decomposing complex tasks into subtasks
 */
export const TaskDecompositionSchema = z.object({
  subtasks: z.array(z.object({
    description: z.string()
      .min(1)
      .describe('What this subtask accomplishes'),

    dependencies: z.array(z.string())
      .default([])
      .describe('IDs of subtasks this depends on'),

    canParallelize: z.boolean()
      .default(false)
      .describe('Can this run in parallel with independent subtasks?'),

    difficulty: z.number()
      .min(1)
      .max(5)
      .default(3)
      .describe('Estimated difficulty (1=easy, 5=hard)'),
  }))
    .min(1)
    .max(20, 'Cannot decompose into more than 20 subtasks')
    .describe('Decomposed subtasks'),

  estimatedIterations: z.number()
    .min(1)
    .describe('Estimated total iterations needed'),

  reasoning: z.string()
    .describe('Why the task was decomposed this way'),
});

export type TaskDecomposition = z.infer<typeof TaskDecompositionSchema>;

// ============================================================================
// Memory Entry Schema
// ============================================================================

/**
 * Schema for memory entries
 */
export const MemoryEntrySchema = z.object({
  content: z.string()
    .min(1)
    .describe('Memory content'),

  type: z.enum(['step', 'task', 'session', 'global'])
    .describe('Memory scope level'),

  metadata: z.object({
    task: z.string().optional(),
    category: z.string().optional(),
    success: z.boolean().optional(),
    relatedNodes: z.array(z.string()).optional(),
    timestamp: z.number().optional(),
  }).optional()
    .describe('Associated metadata'),

  importance: z.number()
    .min(0)
    .max(1)
    .default(0.5)
    .describe('Importance score (0-1)'),
});

export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

// ============================================================================
// Schema Registry
// ============================================================================

export const schemas = {
  AgentThought: AgentThoughtSchema,
  ToolCall: ToolCallSchema,
  AgentResponse: AgentResponseSchema,
  TaskDecomposition: TaskDecompositionSchema,
  MemoryEntry: MemoryEntrySchema,
};
