/**
 * CodingTool - Code-specific operations
 *
 * Refactored to use ActionBasedTool pattern for:
 * - Flat action handlers (no nested switches)
 * - Type-safe action routing
 * - Single source of truth for schemas
 * - Easier maintenance
 */

import { z } from 'zod';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ActionBasedTool, type ActionDef, type ActionContext } from '../tooling/action-tool';
import { ToolAccesses } from '../tooling/tool-access';
import type { ToolResultBuilder } from '../tooling/result-builder';

// Language detection map
const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.rb': 'ruby',
  '.php': 'php',
  '.cs': 'csharp',
  '.cpp': 'cpp',
  '.c': 'c',
  '.h': 'c',
  '.hpp': 'cpp',
  '.sh': 'bash',
  '.bash': 'bash',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.json': 'json',
  '.toml': 'toml',
  '.md': 'markdown',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sql': 'sql',
};

// Action schemas
const CodingEditSchema = z.object({
  action: z.literal('edit'),
  path: z.string().min(1, 'Path cannot be empty'),
  start_line: z.number().int().positive().describe('Starting line number (1-based)'),
  end_line: z.number().int().positive().describe('Ending line number (1-based)'),
  new_content: z.string().describe('New content to replace the lines'),
  create_backup: z.boolean().default(false).describe('Create backup before editing'),
});

const CodingSearchSchema = z.object({
  action: z.literal('search'),
  path: z.string().min(1, 'Path cannot be empty'),
  search_term: z.string().min(1, 'Search term cannot be empty'),
  case_sensitive: z.boolean().default(false),
  regex: z.boolean().default(false).describe('Use regex pattern'),
});

const CodingFindRefsSchema = z.object({
  action: z.literal('find_refs'),
  path: z.string().min(1, 'Path cannot be empty'),
  identifier: z.string().min(1, 'Identifier cannot be empty'),
  file_pattern: z.string().default('*.{ts,js,tsx,jsx,py,rs,go,java}').describe('File pattern to search'),
});

const CodingVerifySchema = z.object({
  action: z.literal('verify'),
  path: z.string().min(1, 'Path cannot be empty'),
  language: z.string().optional().describe('Language for syntax verification (auto-detected if not provided)'),
  check_style: z.boolean().default(false).describe('Check code style/linting'),
});

// Action handlers
const handleCodingEdit: ActionDef['execute'] = async (input, ctx, builder) => {
  const args = input as z.infer<typeof CodingEditSchema>;

  builder.write(`Editing file: ${args.path}\n`);
  builder.write(`Lines ${args.start_line}-${args.end_line}\n`);

  const content = await readFile(args.path, 'utf-8');
  const lines = content.split('\n');

  if (args.start_line < 1 || args.start_line > lines.length) {
    return builder.error(`Invalid start_line: ${args.start_line} (file has ${lines.length} lines)`);
  }
  if (args.end_line < args.start_line || args.end_line > lines.length) {
    return builder.error(`Invalid end_line: ${args.end_line} (file has ${lines.length} lines)`);
  }

  if (args.create_backup) {
    const backupPath = `${args.path}.backup`;
    await writeFile(backupPath, content, 'utf-8');
    builder.write(`Backup created: ${backupPath}\n`);
  }

  builder.write('\n--- Original Lines ---\n');
  for (let i = args.start_line - 1; i < args.end_line; i++) {
    builder.write(`${i + 1}: ${lines[i]}\n`);
  }

  const newLines = args.new_content.split('\n');
  lines.splice(args.start_line - 1, args.end_line - args.start_line + 1, ...newLines);

  await mkdir(dirname(args.path), { recursive: true });
  await writeFile(args.path, lines.join('\n'), 'utf-8');

  builder.write('\n--- New Lines ---\n');
  for (let i = args.start_line - 1; i < args.start_line - 1 + newLines.length; i++) {
    builder.write(`${i + 1}: ${lines[i]}\n`);
  }

  return builder.ok(`Edited ${args.end_line - args.start_line + 1} lines, replaced with ${newLines.length} lines`);
};

const handleCodingSearch: ActionDef['execute'] = async (input, ctx, builder) => {
  const args = input as z.infer<typeof CodingSearchSchema>;

  builder.write(`Searching in: ${args.path}\n`);
  builder.write(`Term: ${args.search_term}\n`);
  builder.write(`Case sensitive: ${args.case_sensitive}\n`);
  builder.write(`Regex: ${args.regex}\n`);

  const content = await readFile(args.path, 'utf-8');
  const lines = content.split('\n');

  const searchTerm = args.case_sensitive ? args.search_term : args.search_term.toLowerCase();
  const matches: Array<{ line: number; content: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const searchLine = args.case_sensitive ? line : line.toLowerCase();

    let isMatch = false;
    if (args.regex) {
      try {
        const regex = new RegExp(args.search_term, args.case_sensitive ? 'g' : 'gi');
        isMatch = regex.test(line);
      } catch (e) {
        return builder.error(`Invalid regex pattern: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else {
      isMatch = searchLine.includes(searchTerm);
    }

    if (isMatch) {
      matches.push({ line: i + 1, content: line });
    }
  }

  builder.write(`\n--- Found ${matches.length} matches ---\n`);
  for (const match of matches) {
    builder.write(`Line ${match.line}: ${match.content.trim()}\n`);
  }

  return builder.ok(`Found ${matches.length} matches`);
};

const handleCodingFindRefs: ActionDef['execute'] = async (input, ctx, builder) => {
  const args = input as z.infer<typeof CodingFindRefsSchema>;

  builder.write(`Finding references to: ${args.identifier}\n`);
  builder.write(`In: ${args.path}\n`);
  builder.write(`Pattern: ${args.file_pattern}\n`);

  const matches: Array<{ file: string; line: number; content: string }> = [];
  const searchPattern = `\\b${args.identifier}\\b`;

  async function searchDir(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (ctx.signal.aborted) return;

      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        await searchDir(fullPath);
      } else {
        if (entry.name.endsWith('.ts') || entry.name.endsWith('.js') ||
            entry.name.endsWith('.tsx') || entry.name.endsWith('.jsx')) {
          try {
            const content = await readFile(fullPath, 'utf-8');
            const lines = content.split('\n');
            const regex = new RegExp(searchPattern, 'g');

            for (let i = 0; i < lines.length; i++) {
              if (regex.test(lines[i])) {
                matches.push({
                  file: fullPath,
                  line: i + 1,
                  content: lines[i].trim()
                });
              }
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    }
  }

  await searchDir(args.path);

  builder.write(`\n--- Found ${matches.length} references ---\n`);
  for (const match of matches.slice(0, 100)) {
    builder.write(`${match.file}:${match.line}: ${match.content}\n`);
  }

  if (matches.length > 100) {
    builder.write(`\n... and ${matches.length - 100} more matches\n`);
  }

  return builder.ok(`Found ${matches.length} references`);
};

const handleCodingVerify: ActionDef['execute'] = async (input, ctx, builder) => {
  const args = input as z.infer<typeof CodingVerifySchema>;

  builder.write(`Verifying: ${args.path}\n`);

  let language = args.language;
  if (!language) {
    const ext = args.path.split('.').pop() ?? '';
    language = LANGUAGE_MAP[`.${ext}`] ?? ext;
  }

  builder.write(`Language: ${language}\n`);

  const content = await readFile(args.path, 'utf-8');
  const issues: Array<{ line: number; type: string; message: string }> = [];

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (args.check_style && line.includes('\t')) {
      issues.push({ line: lineNum, type: 'style', message: 'Contains tabs instead of spaces' });
    }

    if (args.check_style && line.trimEnd() !== line.trim()) {
      issues.push({ line: lineNum, type: 'style', message: 'Trailing whitespace' });
    }

    if (line.length > 120) {
      issues.push({ line: lineNum, type: 'style', message: `Line too long (${line.length} chars)` });
    }
  }

  if (issues.length === 0) {
    builder.write('\n✓ No issues found\n');
    return builder.ok('Syntax verification passed');
  } else {
    builder.write(`\n--- Found ${issues.length} issues ---\n`);
    for (const issue of issues.slice(0, 50)) {
      builder.write(`Line ${issue.line} [${issue.type}]: ${issue.message}\n`);
    }

    if (issues.length > 50) {
      builder.write(`\n... and ${issues.length - 50} more issues\n`);
    }

    return builder.ok(`Found ${issues.length} issues`);
  }
};

// Define all actions
const codingActions: readonly ActionDef[] = [
  {
    name: 'edit',
    description: 'Edit specific lines in a file with backup option',
    schema: CodingEditSchema,
    getAccesses: (input) => ToolAccesses.readWriteFile((input as z.infer<typeof CodingEditSchema>).path),
    execute: handleCodingEdit,
    toDisplay: (input) => ({
      kind: 'coding',
      action: 'edit',
      path: (input as z.infer<typeof CodingEditSchema>).path,
      start_line: (input as z.infer<typeof CodingEditSchema>).start_line,
      end_line: (input as z.infer<typeof CodingEditSchema>).end_line,
    }),
  },
  {
    name: 'search',
    description: 'Search for text/regex patterns in a file',
    schema: CodingSearchSchema,
    getAccesses: (input) => ToolAccesses.readFile((input as z.infer<typeof CodingSearchSchema>).path),
    execute: handleCodingSearch,
    toDisplay: (input) => ({
      kind: 'coding',
      action: 'search',
      path: (input as z.infer<typeof CodingSearchSchema>).path,
      search_term: (input as z.infer<typeof CodingSearchSchema>).search_term,
    }),
  },
  {
    name: 'find_refs',
    description: 'Find references to an identifier across multiple files',
    schema: CodingFindRefsSchema,
    getAccesses: (input) => ToolAccesses.searchTree((input as z.infer<typeof CodingFindRefsSchema>).path),
    execute: handleCodingFindRefs,
    toDisplay: (input) => ({
      kind: 'coding',
      action: 'find_refs',
      path: (input as z.infer<typeof CodingFindRefsSchema>).path,
      identifier: (input as z.infer<typeof CodingFindRefsSchema>).identifier,
    }),
  },
  {
    name: 'verify',
    description: 'Verify syntax and check code style',
    schema: CodingVerifySchema,
    getAccesses: (input) => ToolAccesses.readFile((input as z.infer<typeof CodingVerifySchema>).path),
    execute: handleCodingVerify,
    toDisplay: (input) => ({
      kind: 'coding',
      action: 'verify',
      path: (input as z.infer<typeof CodingVerifySchema>).path,
    }),
  },
];

// Create the tool
export const CodingTool = new ActionBasedTool(
  'Coding',
  codingActions,
  {
    description: `Code-specific operations for editing, searching, and verification.

This tool provides code editing capabilities:
- edit: Edit specific lines in a file with backup option
- search: Search for text/regex patterns in a file
- find_refs: Find references to an identifier across multiple files
- verify: Verify syntax and check code style

All coding operations include proper error handling and line number tracking.`,
  }
);

// Export for backward compatibility
export { CodingTool as default };
