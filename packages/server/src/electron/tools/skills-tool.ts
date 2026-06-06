/**
 * SkillsTool - Skill management operations
 *
 * Refactored to use ActionBasedTool pattern for:
 * - Flat action handlers (no nested switches)
 * - Type-safe action routing
 * - Single source of truth for schemas
 * - Easier maintenance
 */

import { z } from 'zod';
import { ActionBasedTool, type ActionDef, type ActionContext } from '../tooling/action-tool';
import { ToolAccesses } from '../tooling/tool-access';
import type { SkillEngine } from '../../skills/engine';
import type { SkillSearchEngine } from '../../skills/search';
import type { ToolResultBuilder } from '../tooling/result-builder';

interface SkillsToolDeps {
  skillEngine?: SkillEngine;
  skillSearch?: SkillSearchEngine;
  runSkill?: (name: string) => Promise<unknown>;
}

// Action schemas
const SkillsListSchema = z.object({
  action: z.literal('list'),
});

const SkillsRunSchema = z.object({
  action: z.literal('run'),
  name: z.string().min(1, 'Skill name cannot be empty'),
  args: z.record(z.unknown()).optional(),
});

const SkillsCreateSchema = z.object({
  action: z.literal('create'),
  name: z.string().min(1, 'Skill name cannot be empty'),
  description: z.string().min(1, 'Description cannot be empty'),
  steps: z.array(z.string()).min(1, 'Steps cannot be empty'),
  category: z.string().optional(),
  variables: z.record(z.string()).optional(),
});

const SkillsDeleteSchema = z.object({
  action: z.literal('delete'),
  name: z.string().min(1, 'Skill name cannot be empty'),
});

const SkillsSearchSchema = z.object({
  action: z.literal('search'),
  query: z.string().min(1, 'Query cannot be empty'),
  limit: z.number().int().positive().default(10),
  scope: z.enum(['internal', 'hub', 'all']).default('all'),
});

// Factory function to create SkillsTool with dependencies
export function createSkillsTool(deps: SkillsToolDeps = {}) {
  // Action handlers (closures over deps)
  const handleList: ActionDef['execute'] = async (input, ctx, builder) => {
    builder.write('Listing available skills...\n');

    if (!deps.skillEngine) {
      return builder.error('Skill engine not available');
    }

    const skills = deps.skillEngine.listSkills();

    if (skills.length === 0) {
      builder.write('No skills available');
    } else {
      for (const skill of skills) {
        const name = skill.name as string;
        const desc = (skill.description as string)?.slice(0, 80) ?? 'No description';
        const source = (skill.source as string) ?? 'internal';
        builder.write(`\n[${source}] ${name}\n   ${desc}\n`);
      }
    }

    return builder.ok(`Listed ${skills.length} skills`);
  };

  const handleRun: ActionDef['execute'] = async (input, ctx, builder) => {
    const args = input as z.infer<typeof SkillsRunSchema>;

    builder.write(`Running skill: ${args.name}\n`);

    if (!deps.runSkill) {
      return builder.error('Skill execution not available');
    }

    // Check if skill exists
    if (deps.skillEngine) {
      const skill = deps.skillEngine.getSkill(args.name);
      if (!skill) {
        return builder.error(`Skill "${args.name}" not found`);
      }
    }

    const result = await deps.runSkill(args.name);

    // Format the result
    const agentResult = result as Record<string, unknown>;
    builder.write(`\n--- Skill Result ---\n`);
    builder.write(`Task: ${agentResult.task ?? args.name}\n`);
    builder.write(`Success: ${agentResult.success ? 'Yes' : 'No'}\n`);
    builder.write(`Elapsed: ${agentResult.elapsed_secs ?? 0}s\n`);

    if (agentResult.result) {
      builder.write(`\nResult:\n${String(agentResult.result).slice(0, 50000)}\n`);
    }

    if (agentResult.success) {
      return builder.ok('Skill executed successfully');
    } else {
      return builder.error('Skill execution failed');
    }
  };

  const handleCreate: ActionDef['execute'] = async (input, ctx, builder) => {
    const args = input as z.infer<typeof SkillsCreateSchema>;

    builder.write(`Creating skill: ${args.name}\n`);
    builder.write(`Description: ${args.description}\n`);
    builder.write(`Steps: ${args.steps.length}\n`);

    if (!deps.skillEngine) {
      return builder.error('Skill engine not available');
    }

    const extra: Record<string, unknown> = {};
    if (args.category) extra.category = args.category;
    if (args.variables) extra.variables = args.variables;

    const skill = deps.skillEngine.create(
      args.name,
      args.description,
      args.steps,
      extra
    );

    builder.write(`\nCreated skill: ${skill.name as string}\n`);
    builder.write(`Version: ${skill.version as number}\n`);

    return builder.ok('Skill created successfully');
  };

  const handleDelete: ActionDef['execute'] = async (input, ctx, builder) => {
    const args = input as z.infer<typeof SkillsDeleteSchema>;

    builder.write(`Deleting skill: ${args.name}\n`);

    if (!deps.skillEngine) {
      return builder.error('Skill engine not available');
    }

    // Check if skill exists
    const skill = deps.skillEngine.getSkill(args.name);
    if (!skill) {
      return builder.error(`Skill "${args.name}" not found`);
    }

    const deleted = deps.skillEngine.delete(args.name);

    if (deleted) {
      builder.write(`Deleted skill: ${args.name}`);
      return builder.ok('Skill deleted successfully');
    } else {
      return builder.error('Failed to delete skill');
    }
  };

  const handleSearch: ActionDef['execute'] = async (input, ctx, builder) => {
    const args = input as z.infer<typeof SkillsSearchSchema>;

    builder.write(`Searching for skills: ${args.query}\n`);
    builder.write(`Scope: ${args.scope}, Limit: ${args.limit}\n`);

    if (!deps.skillSearch) {
      return builder.error('Skill search not available');
    }

    const results = await deps.skillSearch.search(args.query, args.scope, args.limit);

    if (results.length === 0) {
      builder.write('\nNo results found');
    } else {
      builder.write(`\n--- Found ${results.length} results ---\n`);
      for (const result of results) {
        const name = result.name as string;
        const desc = (result.description as string)?.slice(0, 80) ?? 'No description';
        const source = (result.source as string) ?? 'internal';
        builder.write(`\n[${source}] ${name}\n   ${desc}\n`);
      }
    }

    return builder.ok(`Found ${results.length} skills`);
  };

  // Define all actions
  const skillsActions: readonly ActionDef[] = [
    {
      name: 'list',
      description: 'List all available skills',
      schema: SkillsListSchema,
      getAccesses: () => ToolAccesses.all(),
      execute: handleList,
      toDisplay: () => ({ kind: 'skills', action: 'list', target: 'all' }),
    },
    {
      name: 'run',
      description: 'Execute a skill by name',
      schema: SkillsRunSchema,
      getAccesses: () => ToolAccesses.all(),
      execute: handleRun,
      toDisplay: (input) => ({
        kind: 'skills',
        action: 'run',
        target: (input as z.infer<typeof SkillsRunSchema>).name,
      }),
    },
    {
      name: 'create',
      description: 'Create a new skill with description and steps',
      schema: SkillsCreateSchema,
      getAccesses: () => ToolAccesses.all(),
      execute: handleCreate,
      toDisplay: (input) => ({
        kind: 'skills',
        action: 'create',
        target: (input as z.infer<typeof SkillsCreateSchema>).name,
      }),
    },
    {
      name: 'delete',
      description: 'Delete a skill by name',
      schema: SkillsDeleteSchema,
      getAccesses: () => ToolAccesses.all(),
      execute: handleDelete,
      toDisplay: (input) => ({
        kind: 'skills',
        action: 'delete',
        target: (input as z.infer<typeof SkillsDeleteSchema>).name,
      }),
    },
    {
      name: 'search',
      description: 'Search for skills by query',
      schema: SkillsSearchSchema,
      getAccesses: () => ToolAccesses.all(),
      execute: handleSearch,
      toDisplay: (input) => ({
        kind: 'skills',
        action: 'search',
        target: (input as z.infer<typeof SkillsSearchSchema>).query,
      }),
    },
  ];

  // Create and return the tool
  return new ActionBasedTool(
    'Skills',
    skillsActions,
    {
      description: `Skill management operations for creating, running, and managing skills.

This tool provides skill capabilities:
- list: List all available skills
- run: Execute a skill by name
- create: Create a new skill with description and steps
- delete: Delete a skill by name
- search: Search for skills by query

Skills are reusable task templates that can be executed to automate common workflows.`,
    }
  );
}

// Default instance (no deps)
export const SkillsTool = createSkillsTool();

// Export for backward compatibility
export { SkillsTool as default };
