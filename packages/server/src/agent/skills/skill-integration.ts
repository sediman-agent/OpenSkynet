/**
 * Skill Integration Module
 * Handles skill engine integration and skill search functionality
 */

import type { SkillEngine } from '../../skills/engine';
import type { SkillSearchEngine } from '../../skills/search';
import type { ToolBus } from '../tools/bus';

export interface SkillIntegrationOpts {
  skillEngine?: SkillEngine;
  skillSearch?: SkillSearchEngine;
  toolBus?: ToolBus;
  cwd?: string;
  enableBrowserTools?: boolean;
  enableShellTools?: boolean;
  enableFileTools?: boolean;
  enableCodingTools?: boolean;
  enableWebTools?: boolean;
  enableSkillsTools?: boolean;
}

export interface SkillDeps {
  skillEngine?: SkillEngine;
  skillSearch?: SkillSearchEngine;
  runSkill: (name: string) => Promise<any>;
}

/**
 * Initialize skill tools on the tool bus
 */
export function initializeSkillTools(
  toolBus: ToolBus,
  opts: SkillIntegrationOpts
): void {
  if (!opts.skillEngine) return;

  const skillDeps: SkillDeps = {
    skillEngine: opts.skillEngine,
    skillSearch: opts.skillSearch,
    runSkill: async (name: string) => {
      if (!opts.skillEngine) return null;
      const skill = opts.skillEngine.getSkill(name);
      return skill;
    },
  };

  // Register skill tools on tool bus
  toolBus.registerSkillTools(skillDeps);
}

/**
 * Check if skill execution is available
 */
export function canExecuteSkills(opts: SkillIntegrationOpts): boolean {
  return !!opts.skillEngine;
}

/**
 * Get skill by name
 */
export function getSkill(
  name: string,
  opts: SkillIntegrationOpts
): any {
  if (!opts.skillEngine) return null;
  return opts.skillEngine.getSkill(name);
}

/**
 * Search for skills matching query
 */
export async function searchSkills(
  query: string,
  opts: SkillIntegrationOpts
): Promise<any[]> {
  if (!opts.skillSearch) return [];
  return opts.skillSearch.search(query);
}

/**
 * List available skills
 */
export function listSkills(opts: SkillIntegrationOpts): string[] {
  if (!opts.skillEngine) return [];
  return opts.skillEngine.listSkills();
}
