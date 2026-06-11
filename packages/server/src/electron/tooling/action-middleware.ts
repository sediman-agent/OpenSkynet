/**
 * Action Middleware Module
 * Provides middleware for pre/post action processing
 */

import type { ReadonlyActionContext } from './action-tool';
import type { ExecutableToolResult } from './types';
import type { Result } from './memoization';
import { tryResult, failure, success, unwrapOr } from './memoization';
import { createLogger } from '../../core/logging';

const logger = createLogger('action-middleware');

/**
 * Middleware for action execution
 */
export interface ActionMiddleware<TInput = unknown> {
  before?: (input: TInput, ctx: ReadonlyActionContext) => Result<TInput> | Promise<Result<TInput>>;
  after?: (result: ExecutableToolResult, input: TInput, ctx: ReadonlyActionContext) => ExecutableToolResult | Promise<ExecutableToolResult>;
}

/**
 * Validation middleware
 */
export function validationMiddleware<TInput>(
  schema: { safeParse: (data: unknown) => { success: true; data: TInput } | { success: false; error: any } }
): ActionMiddleware<TInput> {
  return {
    before: async (input, ctx) => {
      const result = schema.safeParse(input);

      if (result.success) {
        return { success: true, value: result.data };
      } else {
        const errorResult = result as { success: false; error: any };
        return { success: false, error: errorResult.error };
      }
    }
  };
}

/**
 * Logging middleware
 */
export function loggingMiddleware<TInput>(): ActionMiddleware<TInput> {
  return {
    before: (input, _ctx) => {
      logger.debug(`[ActionMiddleware] Before: ${JSON.stringify(input)}`);
      return { success: true, value: input };
    },
    after: (result, input, _ctx) => {
      logger.debug(`[ActionMiddleware] After: ${JSON.stringify(input)} -> ${result.isError ? 'failed' : 'success'}`);
      return result;
    }
  };
}

/**
 * Timing middleware
 */
export function timingMiddleware<TInput>(): ActionMiddleware<TInput> {
  return {
    before: async (input, _ctx) => {
      return { success: true, value: input };
    },
    after: (result, input, _ctx) => {
      logger.info(`[ActionMiddleware] Timing: ${JSON.stringify(input)} = ${result.isError ? 'failed' : 'success'}`);
      return result;
    }
  };
}

/**
 * Retry middleware
 */
export function retryMiddleware<TInput>(
  maxRetries: number = 3,
  retryCondition?: (result: ExecutableToolResult) => boolean
): ActionMiddleware<TInput> {
  let retries = 0;

  return {
    after: async (result, input, ctx) => {
      if (result.isError && retries < maxRetries && retryCondition?.(result) !== false) {
        retries++;
        logger.info(`[ActionMiddleware] Retrying: ${JSON.stringify(input)} (${retries}/${maxRetries})`);
        // Would trigger re-execution here if supported
      }
      return result;
    }
  };
}

/**
 * Chain multiple middleware
 */
export function chainMiddleware<TInput>(
  ...middlewares: ActionMiddleware<TInput>[]
): ActionMiddleware<TInput> {
  return {
    before: async (input, ctx) => {
      let currentInput = input;

      for (const middleware of middlewares) {
        if (!middleware.before) continue;
        const result = await middleware.before(currentInput, ctx);
        if (!result.success) {
          return result; // Validation or other check failed
        }
        currentInput = result.value;
      }

      return { success: true, value: currentInput };
    },
    after: async (result, input, ctx) => {
      let currentResult = result;

      // Process in reverse order (last middleware first)
      for (let i = middlewares.length - 1; i >= 0; i--) {
        const middleware = middlewares[i];
        if (!middleware.after) continue;
        const newResult = await middleware.after(currentResult, input, ctx);
        currentResult = newResult;
      }

      return currentResult;
    }
  };
}

/**
 * Create middleware chain from array of middleware creators
 */
export function createMiddlewareChain<TInput>(
  middlewareCreators: Array<() => ActionMiddleware<TInput>>
): ActionMiddleware<TInput> {
  const middlewares = middlewareCreators.map(creator => creator());
  return chainMiddleware(...middlewares);
}

/**
 * Validation with custom error message
 */
export function validationWithCustomMiddleware<TInput>(
  schema: { safeParse: (data: unknown) => { success: true; data: TInput } | { success: false; error: any } },
  errorMessage: string
): ActionMiddleware<TInput> {
  return {
    before: async (input, ctx) => {
      const result = schema.safeParse(input);

      if (result.success) {
        return { success: true, value: result.data };
      } else {
        const errorResult = result as { success: false; error: any };
        logger.warn('[ActionMiddleware] Validation failed:', errorResult.error);
        return {
          success: false,
          error: new Error(`${errorMessage}: ${JSON.stringify(errorResult.error)}`)
        };
      }
    }
  };
}

/**
 * Create pre-execution middleware
 */
export function preExecutionMiddleware<TInput>(
  handler: (input: TInput, ctx: ReadonlyActionContext) => Promise<void>
): ActionMiddleware<TInput> {
  return {
    before: async (input, ctx) => {
      try {
        await handler(input, ctx);
        return { success: true, value: input };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
      }
    }
  };
}

/**
 * Create post-execution middleware
 */
export function postExecutionMiddleware<TInput>(
  handler: (result: ExecutableToolResult, input: TInput, ctx: ReadonlyActionContext) => ExecutableToolResult | Promise<ExecutableToolResult>
): ActionMiddleware<TInput> {
  return {
    after: async (result, input, ctx) => {
      try {
        const newResult = await handler(result, input, ctx);
        return newResult;
      } catch (error) {
        logger.error('[ActionMiddleware] Post-execution failed:', error);
        return result; // Return original result on failure
      }
    }
  };
}

/**
 * Combine multiple pre-execution handlers
 */
export function combinePreHandlers<TInput>(
  ...handlers: Array<(input: TInput, ctx: ReadonlyActionContext) => Promise<void>>
): ActionMiddleware<TInput> {
  return preExecutionMiddleware(async (input, ctx) => {
    for (const handler of handlers) {
      await handler(input, ctx);
    }
  });
}

/**
 * Combine multiple post-execution handlers
 */
export function combinePostHandlers<TInput>(
  ...handlers: Array<(result: ExecutableToolResult, input: TInput, ctx: ReadonlyActionContext) => Promise<ExecutableToolResult>>
): ActionMiddleware<TInput> {
  return postExecutionMiddleware(async (result, input, ctx) => {
    let currentResult = result;

    for (const handler of handlers) {
      currentResult = await handler(currentResult, input, ctx);
    }

    return currentResult;
  });
}
