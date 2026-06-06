/**
 * ActionBasedTool - Generic multi-action tool base class
 *
 * Provides a flat, declarative way to define tools with multiple actions.
 * Eliminates the nested switch statement pattern by using an action registry.
 *
 * Benefits:
 * - No more type casting (args as XxxSchema)
 * - No more double switch statements
 * - Single source of truth for schemas
 * - Easier to add new actions
 */

import { z } from 'zod';
import type { BuiltinTool, ExecutableToolResult, ToolExecution } from './types';
import { literalRulePattern, matchesGlobRuleSubject } from './types';
import { ToolAccesses } from './tool-access';
import { ToolResultBuilder } from './result-builder';
import { zodToJsonSchema, createOneOfSchema } from './schema-utils';

/**
 * Context passed to action handlers
 */
export interface ActionContext {
  readonly signal: AbortSignal;
  readonly turnId: string;
  readonly toolCallId: string;
}

/**
 * Definition of a single action within a tool
 */
export interface ActionDef<TInput = unknown> {
  /** Unique action name */
  readonly name: string;
  /** Human-readable description */
  readonly description: string;
  /** Zod schema for this action's input */
  readonly schema: z.ZodSchema<TInput>;
  /** Returns resource accesses for this action */
  readonly getAccesses: (input: TInput) => ToolAccesses;
  /** Executes the action */
  readonly execute: (input: TInput, ctx: ActionContext, builder: ToolResultBuilder) => Promise<ExecutableToolResult>;
  /** Optional display metadata transformer */
  readonly toDisplay?: (input: TInput) => Record<string, unknown>;
}

/**
 * Options for creating an ActionBasedTool
 */
export interface ActionBasedToolOptions {
  /** Tool description (combined from action descriptions if not provided) */
  readonly description?: string;
}

/**
 * Generic tool that handles multiple actions through a registry
 *
 * @example
 * ```ts
 * const fileTool = new ActionBasedTool('File', [
 *   {
 *     name: 'read',
 *     description: 'Read a file',
 *     schema: z.object({ path: z.string() }),
 *     getAccesses: (input) => ToolAccesses.readFile(input.path),
 *     execute: async (input, ctx, builder) => {
 *       const content = await readFile(input.path, 'utf-8');
 *       builder.write(content);
 *       return builder.ok('File read successfully');
 *     }
 *   },
 *   // ... more actions
 * ]);
 * ```
 */
export class ActionBasedTool<TInput = unknown> implements BuiltinTool<TInput> {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;

  private readonly actionMap: Map<string, ActionDef>;
  private readonly unionSchema: z.ZodSchema<any>;

  constructor(
    name: string,
    actions: readonly ActionDef[],
    options: ActionBasedToolOptions = {}
  ) {
    this.name = name;

    // Build action map for quick lookup
    this.actionMap = new Map();
    for (const action of actions) {
      this.actionMap.set(action.name, action);
    }

    // Create union schema from all action schemas
    const schemas = actions.map((a) => a.schema);
    this.unionSchema = z.union(schemas as any);

    // Build description from actions
    this.description = options.description ?? this.buildDescription(actions);

    // Build JSON schema using the schema-utils
    this.parameters = this.buildJsonSchema(actions);
  }

  private buildDescription(actions: readonly ActionDef[]): string {
    return actions.map(a => `**${a.name}**: ${a.description}`).join('\n');
  }

  private buildJsonSchema(actions: readonly ActionDef[]): Record<string, unknown> {
    const variants = actions.map(action => {
      const jsonSchema = zodToJsonSchema(action.schema);

      return {
        description: action.description,
        properties: (jsonSchema as any).properties ?? {},
        required: (jsonSchema as any).required ?? [],
      };
    });

    return createOneOfSchema(variants);
  }

  /**
   * Resolve execution for the given input
   */
  resolveExecution(input: TInput): ToolExecution {
    const parsed = this.unionSchema.safeParse(input);
    if (!parsed.success) {
      return {
        isError: true,
        output: `Validation error: ${parsed.error.message}`,
      };
    }

    const data = parsed.data;
    const actionName = (data as any).action;

    if (!actionName || typeof actionName !== 'string') {
      return {
        isError: true,
        output: 'Invalid input: missing or invalid action field',
      };
    }

    const action = this.actionMap.get(actionName);
    if (!action) {
      return {
        isError: true,
        output: `Unknown action: ${actionName}`,
      };
    }

    const accesses = action.getAccesses(data);
    const preview = this.buildPreview(data);

    return {
      accesses,
      description: `${this.name} operation: ${actionName}${preview ? ` - ${preview}` : ''}`,
      display: action.toDisplay?.(data) ?? {
        kind: this.name.toLowerCase(),
        action: actionName,
        ...data,
      },
      approvalRule: literalRulePattern(this.name, actionName),
      matchesRule: (ruleArgs) => matchesGlobRuleSubject(ruleArgs, actionName),
      execute: (ctx) => this.executeAction(action, data, ctx),
    };
  }

  private buildPreview(data: any): string {
    for (const key of ['path', 'source', 'command', 'search_term', 'identifier']) {
      const value = data[key];
      if (typeof value === 'string') {
        return value.length > 40 ? value.slice(0, 40) + '...' : value;
      }
    }
    return '';
  }

  private async executeAction(
    action: ActionDef,
    input: unknown,
    ctx: { signal: AbortSignal; turnId: string; toolCallId: string }
  ): Promise<ExecutableToolResult> {
    if (ctx.signal.aborted) {
      return { isError: true, output: 'Aborted before execution started' };
    }

    const builder = new ToolResultBuilder({ maxChars: 100_000 });

    try {
      return await action.execute(
        input,
        { signal: ctx.signal, turnId: ctx.turnId, toolCallId: ctx.toolCallId },
        builder
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      builder.write(`\nError: ${errorMessage}`);
      return builder.error(`${action.name} failed`);
    }
  }
}
