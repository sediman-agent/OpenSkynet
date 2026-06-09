/**
 * Coding Tool - Simplified
 *
 * Refactored from 350 lines to ~120 lines
 * Language detection extracted to coding/language-detector.ts
 * File operations extracted to coding/file-operations.ts
 * Search operations extracted to coding/search-operations.ts
 * Reference finder extracted to coding/reference-finder.ts
 * Code verifier extracted to coding/code-verifier.ts
 * Action definitions extracted to coding/action-definitions.ts
 */

import { ActionBasedTool } from '../tooling/action-tool.js';

// Action definitions
import { codingActions } from './coding/action-definitions.js';

// ============================================================================
// Create the tool
// ============================================================================

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

// ============================================================================
// Re-export for backward compatibility
// ============================================================================

export { CodingTool as default };

// Re-export types
export type { FileEditOptions, FileEditResult } from './coding/file-operations.js';
export type { SearchOptions, SearchResult } from './coding/search-operations.js';
export type { FindRefsOptions, ReferenceResult } from './coding/reference-finder.js';
export type { VerificationOptions, CodeIssue } from './coding/code-verifier.js';

// Re-export classes for direct use
export { LanguageDetector } from './coding/language-detector.js';
export { FileOperationsHandler } from './coding/file-operations.js';
export { SearchOperationsHandler } from './coding/search-operations.js';
export { ReferenceFinder } from './coding/reference-finder.js';
export { CodeVerifier } from './coding/code-verifier.js';

// Re-export schemas
export { LANGUAGE_MAP } from './coding/language-detector.js';
export * from './coding/action-definitions.js';
