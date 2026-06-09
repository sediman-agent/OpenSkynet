/**
 * Coding Tool Action Definitions
 * Defines all action schemas and metadata for the coding tool
 */

import { z } from 'zod';
import type { ActionDef } from '../tooling/action-tool.js';
import { ToolAccesses } from '../tooling/tool-access.js';
import type { ToolResultBuilder } from '../tooling/result-builder.js';
import type { AbortSignal } from '../../core/types.js';

import { FileOperationsHandler, type FileEditOptions } from './file-operations.js';
import { SearchOperationsHandler, type SearchOptions } from './search-operations.js';
import { ReferenceFinder, type FindRefsOptions, type ReferenceResult } from './reference-finder.js';
import { CodeVerifier, type VerificationOptions } from './code-verifier.js';

// ============================================================================
// Action Schemas
// ============================================================================

export const CodingEditSchema = z.object({
  action: z.literal('edit'),
  path: z.string().min(1, 'Path cannot be empty'),
  start_line: z.number().int().positive().describe('Starting line number (1-based)'),
  end_line: z.number().int().positive().describe('Ending line number (1-based)'),
  new_content: z.string().describe('New content to replace the lines'),
  create_backup: z.boolean().default(false).describe('Create backup before editing'),
});

export const CodingSearchSchema = z.object({
  action: z.literal('search'),
  path: z.string().min(1, 'Path cannot be empty'),
  search_term: z.string().min(1, 'Search term cannot be empty'),
  case_sensitive: z.boolean().default(false),
  regex: z.boolean().default(false).describe('Use regex pattern'),
});

export const CodingFindRefsSchema = z.object({
  action: z.literal('find_refs'),
  path: z.string().min(1, 'Path cannot be empty'),
  identifier: z.string().min(1, 'Identifier cannot be empty'),
  file_pattern: z.string().default('*.{ts,js,tsx,jsx,py,rs,go,java}').describe('File pattern to search'),
});

export const CodingVerifySchema = z.object({
  action: z.literal('verify'),
  path: z.string().min(1, 'Path cannot be empty'),
  language: z.string().optional().describe('Language for syntax verification (auto-detected if not provided)'),
  check_style: z.boolean().default(false).describe('Check code style/linting'),
});

// ============================================================================
// Action Handlers
// ============================================================================

/**
 * Handle coding edit action
 */
const handleCodingEdit: ActionDef['execute'] = async (input, ctx, builder) => {
  const args = input as z.infer<typeof CodingEditSchema>;
  const handler = new FileOperationsHandler();

  const options: FileEditOptions = {
    path: args.path,
    startLine: args.start_line,
    endLine: args.end_line,
    newContent: args.new_content,
    createBackup: args.create_backup,
  };

  const result = await handler.editFile(options, builder);

  if (!result.success) {
    return builder.error(result.error || 'Edit failed');
  }

  return builder.ok(
    `Edited ${result.linesReplaced} lines, replaced with ${result.linesAdded} lines`
  );
};

/**
 * Handle coding search action
 */
const handleCodingSearch: ActionDef['execute'] = async (input, ctx, builder) => {
  const args = input as z.infer<typeof CodingSearchSchema>;
  const handler = new SearchOperationsHandler();

  const options: SearchOptions = {
    path: args.path,
    searchTerm: args.search_term,
    caseSensitive: args.case_sensitive,
    regex: args.regex,
  };

  const result = await handler.search(options, builder);

  if (!result.success) {
    return builder.error(result.error || 'Search failed');
  }

  return builder.ok(`Found ${result.results.length} matches`);
};

/**
 * Handle coding find_refs action
 */
const handleCodingFindRefs: ActionDef['execute'] = async (input, ctx, builder) => {
  const args = input as z.infer<typeof CodingFindRefsSchema>;
  const handler = new ReferenceFinder();

  const options: FindRefsOptions = {
    path: args.path,
    identifier: args.identifier,
    filePattern: args.file_pattern,
    signal: ctx.signal,
  };

  const result = await handler.findReferences(options, builder);

  if (!result.success) {
    return builder.error(result.error || 'Find references failed');
  }

  return builder.ok(`Found ${result.results.length} references`);
};

/**
 * Handle coding verify action
 */
const handleCodingVerify: ActionDef['execute'] = async (input, ctx, builder) => {
  const args = input as z.infer<typeof CodingVerifySchema>;
  const handler = new CodeVerifier();

  const options: VerificationOptions = {
    path: args.path,
    language: args.language,
    checkStyle: args.check_style,
  };

  const result = await handler.verify(options, builder);

  if (!result.success) {
    return builder.error(result.error || 'Verification failed');
  }

  if (result.issues.length === 0) {
    return builder.ok('Syntax verification passed');
  }

  return builder.ok(`Found ${result.issues.length} issues`);
};

// ============================================================================
// Action Definitions
// ============================================================================

export const codingActions: readonly ActionDef[] = [
  {
    name: 'edit',
    description: 'Edit specific lines in a file with backup option',
    schema: CodingEditSchema,
    getAccesses: (input) =>
      ToolAccesses.readWriteFile((input as z.infer<typeof CodingEditSchema>).path),
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
    getAccesses: (input) =>
      ToolAccesses.readFile((input as z.infer<typeof CodingSearchSchema>).path),
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
    getAccesses: (input) =>
      ToolAccesses.searchTree((input as z.infer<typeof CodingFindRefsSchema>).path),
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
    getAccesses: (input) =>
      ToolAccesses.readFile((input as z.infer<typeof CodingVerifySchema>).path),
    execute: handleCodingVerify,
    toDisplay: (input) => ({
      kind: 'coding',
      action: 'verify',
      path: (input as z.infer<typeof CodingVerifySchema>).path,
    }),
  },
];
