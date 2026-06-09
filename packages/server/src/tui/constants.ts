/**
 * TUI Constants
 * Constants and configuration for the Terminal UI
 */

import type { AgentModeEntry } from './types.js';

/**
 * Default agent modes
 */
export const DEFAULT_MODES: AgentModeEntry[] = [
  {
    mode: 'browser',
    label: 'Browser',
    runner: 'browser',
    description: 'Direct execution agent with all tools',
    capabilities: ['fileops', 'terminal', 'browser', 'web', 'skills', 'coding', 'documents']
  },
  {
    mode: 'terminator',
    label: 'Term',
    runner: 'terminator',
    description: 'Autonomous multi-task orchestrator',
    capabilities: ['fileops', 'terminal', 'browser', 'web', 'skills', 'coding', 'documents', 'orchestration']
  },
];

/**
 * Spinner animation frames
 */
export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Available commands
 */
export const COMMANDS: Array<{
  name: string;
  aliases?: string[];
  description: string;
  category: string;
}> = [
  { name: '/help', aliases: ['/h'], description: 'Show help', category: 'General' },
  { name: '/quit', aliases: ['/exit', '/q'], description: 'Quit', category: 'General' },
  { name: '/clear', aliases: ['/cls'], description: 'Clear messages', category: 'General' },
  { name: '/reset', description: 'Full reset', category: 'General' },
  { name: '/status', description: 'Show status', category: 'General' },
  { name: '/mode', aliases: ['/m'], description: 'Switch agent mode (Browser/Terminator)', category: 'Agent' },
  { name: '/models', aliases: ['/model'], description: 'Switch model', category: 'Agent' },
  { name: '/provider', aliases: ['/providers'], description: 'Switch provider', category: 'Agent' },
  { name: '/soul', description: 'Edit personality', category: 'Agent' },
  { name: '/skills', aliases: ['/skill'], description: 'Browse skills', category: 'Skills' },
  { name: '/memory', aliases: ['/mem'], description: 'Manage memory', category: 'Memory' },
  { name: '/remember', description: 'Quick add to memory', category: 'Memory' },
  { name: '/sessions', description: 'Browse sessions', category: 'Sessions' },
  { name: '/schedule', aliases: ['/cron'], description: 'Manage schedule', category: 'Schedule' },
  { name: '/browser', description: 'Toggle headless/headed', category: 'Browser' },
  { name: '/screenshot', description: 'Capture screenshot', category: 'Browser' },
  { name: '/connect', description: 'Configure integrations', category: 'Integrations' },
  { name: '/checkpoint', aliases: ['/branches'], description: 'List checkpoints', category: 'Checkpoint' },
  { name: '/checkpoint-create', description: 'Create checkpoint', category: 'Checkpoint' },
  { name: '/checkpoint-revert', aliases: ['/rewind'], description: 'Revert to checkpoint', category: 'Checkpoint' },
  { name: '/branch', description: 'Named checkpoint', category: 'Checkpoint' },
  { name: '/themes', aliases: ['/theme'], description: 'Switch theme', category: 'Appearance' },
];

/**
 * Get all command names including aliases
 */
export function getAllCommandNames(): string[] {
  return COMMANDS.flatMap(c => [c.name, ...(c.aliases ?? [])]);
}

/**
 * Get command by name
 */
export function getCommand(name: string): typeof COMMANDS[0] | undefined {
  return COMMANDS.find(c => c.name === name || c.aliases?.includes(name));
}

/**
 * Get commands by category
 */
export function getCommandsByCategory(category: string): typeof COMMANDS {
  return COMMANDS.filter(c => c.category === category);
}
