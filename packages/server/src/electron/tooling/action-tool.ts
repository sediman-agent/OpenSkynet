/**
 * ActionBasedTool - Generic multi-action tool base class
 *
 * Performance optimizations:
 * - Cached schema conversion
 * - Pre-built descriptions
 * - Optimized action lookup
 * - Reusable preview builder
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

// Cache for JSON schema conversions to avoid repeated computation
const schemaCache = new WeakMap<z.ZodSchema, Record<string, unknown>>();

/**
 * Optimized tool that handles multiple actions through a registry
 */
export class ActionBasedTool<TInput = unknown> implements BuiltinTool<TInput> {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;

  private readonly actionMap: Map<string, ActionDef>;
  private readonly unionSchema: z.ZodSchema<any>;
  private readonly previewKeys: readonly string[];

  constructor(
    name: string,
    actions: readonly ActionDef[],
    options: ActionBasedToolOptions = {}
  ) {
    this.name = name;

    // Build action map for O(1) lookup
    this.actionMap = new Map();
    for (const action of actions) {
      this.actionMap.set(action.name, action);
    }

    // Create union schema from all action schemas
    const schemas = actions.map((a) => a.schema);
    this.unionSchema = z.union(schemas as any);

    // Build description once (avoid repeated string operations)
    this.description = options.description ?? this.buildDescription(actions);

    // Build JSON schema with caching
    this.parameters = this.buildJsonSchema(actions);

    // Cache preview keys for faster iteration
    this.previewKeys = ['path', 'source', 'command', 'search_term', 'identifier', 'query', 'url'];
  }

  private buildDescription(actions: readonly ActionDef[]): string {
    // Pre-allocate array size for better performance
    const parts = new Array(actions.length);
    for (let i = 0; i < actions.length; i++) {
      parts[i] = `**${actions[i].name}**: ${actions[i].description}`;
    }
    return parts.join('\n');
  }

  private buildJsonSchema(actions: readonly ActionDef[]): Record<string, unknown> {
    const variants = new Array(actions.length);

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];

      // Check cache first
      let jsonSchema = schemaCache.get(action.schema);
      if (!jsonSchema) {
        jsonSchema = zodToJsonSchema(action.schema);
        schemaCache.set(action.schema, jsonSchema);
      }

      variants[i] = {
        description: action.description,
        properties: (jsonSchema as any).properties ?? {},
        required: (jsonSchema as any).required ?? [],
      };
    }

    return createOneOfSchema(variants);
  }

  /**
   * Resolve execution for the given input (optimized)
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
      description: preview
        ? `${this.name} operation: ${actionName} - ${preview}`
        : `${this.name} operation: ${actionName}`,
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

  /**
   * Build preview with optimized key iteration
   */
  private buildPreview(data: any): string {
    const keys = this.previewKeys;
    for (let i = 0; i < keys.length; i++) {
      const value = data[keys[i]];
      if (typeof value === 'string') {
        // Fast path for short strings
        if (value.length <= 41) {
          return value;
        }
        return value.slice(0, 40) + '...';
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
