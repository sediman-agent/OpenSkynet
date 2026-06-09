/**
 * Schema Builders
 * Factory functions for creating valid schema objects
 */

import type { AgentResponse } from '../agent-schemas.js';
import { AgentResponseSchema } from '../definitions/index.js';

/**
 * Schema Builders provides factory functions for creating schema objects
 * This is extracted from agent/schemas/agent-schemas.ts
 */
export class SchemaBuilders {
  /**
   * Create a valid agent response from partial data
   */
  static createAgentResponse(partial: Partial<AgentResponse> = {}): AgentResponse {
    return AgentResponseSchema.parse({
      thought: {
        thinking: partial.thought?.thinking || 'No reasoning provided',
        evaluation: partial.thought?.evaluation || 'uncertain',
        memory: partial.thought?.memory || 'No memory tracking',
        nextGoal: partial.thought?.nextGoal || 'Continue task'
      },
      actions: partial.actions || [],
      done: partial.done ?? false,
      summary: partial.summary,
      confidence: partial.confidence ?? 0.8,
      estimatedRemainingSteps: partial.estimatedRemainingSteps
    });
  }

  /**
   * Create a minimal valid agent response
   */
  static createMinimalResponse(
    thinking: string,
    memory: string,
    nextGoal: string,
    done: boolean = false
  ): AgentResponse {
    return this.createAgentResponse({
      thought: {
        thinking,
        evaluation: 'uncertain',
        memory,
        nextGoal
      },
      done
    });
  }

  /**
   * Create a success completion response
   */
  static createSuccessResponse(
    summary: string,
    memory: string
  ): AgentResponse {
    return this.createAgentResponse({
      thought: {
        thinking: 'Task completed successfully',
        evaluation: 'success',
        memory,
        nextGoal: 'Task complete'
      },
      done: true,
      summary,
      confidence: 1.0,
      estimatedRemainingSteps: 0
    });
  }

  /**
   * Create a failure completion response
   */
  static createFailureResponse(
    reason: string,
    memory: string
  ): AgentResponse {
    return this.createAgentResponse({
      thought: {
        thinking: `Task failed: ${reason}`,
        evaluation: 'failure',
        memory,
        nextGoal: 'Cannot continue'
      },
      done: true,
      summary: `Failed to complete task: ${reason}`,
      confidence: 0.5,
      estimatedRemainingSteps: 0
    });
  }

  /**
   * Create a response with tool calls
   */
  static createToolResponse(
    thinking: string,
    evaluation: string,
    memory: string,
    nextGoal: string,
    actions: any[]
  ): AgentResponse {
    return this.createAgentResponse({
      thought: {
        thinking,
        evaluation,
        memory,
        nextGoal
      },
      actions,
      done: false,
      confidence: 0.8
    });
  }

  /**
   * Create an in-progress response
   */
  static createInProgressResponse(
    thinking: string,
    memory: string,
    nextGoal: string,
    estimatedRemaining: number
  ): AgentResponse {
    return this.createAgentResponse({
      thought: {
        thinking,
        evaluation: 'uncertain',
        memory,
        nextGoal
      },
      done: false,
      confidence: 0.7,
      estimatedRemainingSteps: estimatedRemaining
    });
  }

  /**
   * Create a retry response
   */
  static createRetryResponse(
    lastError: string,
    memory: string,
    nextGoal: string
  ): AgentResponse {
    return this.createAgentResponse({
      thought: {
        thinking: `Previous attempt failed: ${lastError}. Retrying with adjusted approach.`,
        evaluation: 'failure',
        memory,
        nextGoal
      },
      done: false,
      confidence: 0.6
    });
  }

  /**
   * Create a reflection response
   */
  static createReflectionResponse(
    observations: string,
    memory: string,
    adjustedGoal: string
  ): AgentResponse {
    return this.createAgentResponse({
      thought: {
        thinking: `Reflection: ${observations}`,
        evaluation: 'uncertain',
        memory,
        nextGoal: adjustedGoal
      },
      done: false,
      confidence: 0.75
    });
  }

  /**
   * Clone response with updates
   */
  static cloneWithUpdates(
    base: AgentResponse,
    updates: Partial<AgentResponse>
  ): AgentResponse {
    return this.createAgentResponse({
      ...base,
      ...updates,
      thought: {
        ...base.thought,
        ...(updates.thought || {})
      }
    });
  }

  /**
   * Add action to existing response
   */
  static withAction(
    base: AgentResponse,
    action: any
  ): AgentResponse {
    return this.cloneWithUpdates(base, {
      actions: [...(base.actions || []), action]
    });
  }
}
