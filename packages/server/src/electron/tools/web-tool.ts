/**
 * WebTool - Web operations (fetch, search)
 *
 * Refactored to use ActionBasedTool pattern for:
 * - Flat action handlers (no nested switches)
 * - Type-safe action routing
 * - Single source of truth for schemas
 * - Consistency with other tools
 */

import { z } from 'zod';
import { ActionBasedTool, type ActionDef, type ActionContext } from '../tooling/action-tool';
import { ToolAccesses } from '../tooling/tool-access';
import type { ToolResultBuilder } from '../tooling/result-builder';

// Action schemas
const WebFetchSchema = z.object({
  action: z.literal('fetch'),
  url: z.string().url('Invalid URL format'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('GET'),
  headers: z.record(z.string()).optional().default({}),
  body: z.string().optional(),
});

const WebSearchSchema = z.object({
  action: z.literal('search'),
  query: z.string().min(1, 'Query cannot be empty'),
  max_results: z.number().int().positive().default(5),
});

// Action handlers
const handleFetch: ActionDef['execute'] = async (input, ctx, builder) => {
  const args = input as z.infer<typeof WebFetchSchema>;

  builder.write(`Fetching: ${args.url}\n`);
  builder.write(`Method: ${args.method}\n`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  if (ctx.signal.aborted) {
    controller.abort();
  } else {
    ctx.signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const response = await fetch(args.url, {
      method: args.method,
      headers: args.headers,
      body: args.body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const text = await response.text();

    builder.write(`Status: ${response.status} ${response.statusText}\n`);
    builder.write(`Content-Length: ${text.length} bytes\n`);
    builder.write('\n--- Response Body ---\n');
    builder.write(text.slice(0, 100_000));

    if (text.length > 100_000) {
      builder.write('\n[...truncated...]');
    }

    if (response.ok) {
      return builder.ok(`Fetched successfully (${response.status})`);
    } else {
      return builder.error(`HTTP error: ${response.status}`);
    }
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

const handleSearch: ActionDef['execute'] = async (input, ctx, builder) => {
  const args = input as z.infer<typeof WebSearchSchema>;

  builder.write(`Searching for: ${args.query}\n`);
  builder.write(`Max results: ${args.max_results}\n`);

  // TODO: Integrate with actual search API (e.g., Bing, Google, DuckDuckGo)
  builder.write('\n--- Search Results ---\n');
  builder.write('[Web search is not yet configured. Please configure a search API.]\n');
  builder.write(`\nQuery: ${args.query}`);
  builder.write(`Expected ${args.max_results} results`);

  return builder.error('Web search not configured');
};

// Define all actions
const webActions: readonly ActionDef[] = [
  {
    name: 'fetch',
    description: 'Fetch content from a URL with customizable method, headers, and body',
    schema: WebFetchSchema,
    getAccesses: () => ToolAccesses.none(),
    execute: handleFetch,
    toDisplay: (input) => ({
      kind: 'web',
      action: 'fetch',
      target: (input as z.infer<typeof WebFetchSchema>).url,
    }),
  },
  {
    name: 'search',
    description: 'Search the web for information (uses web search API)',
    schema: WebSearchSchema,
    getAccesses: () => ToolAccesses.none(),
    execute: handleSearch,
    toDisplay: (input) => ({
      kind: 'web',
      action: 'search',
      target: (input as z.infer<typeof WebSearchSchema>).query,
    }),
  },
];

// Create the tool
export const WebTool = new ActionBasedTool(
  'Web',
  webActions,
  {
    description: `Web operations for fetching URLs and searching the web.

This tool provides web capabilities:
- fetch: Fetch content from a URL with customizable method, headers, and body
- search: Search the web for information (uses web search API)

All web operations include proper error handling and timeout protection.`,
  }
);

// Export for backward compatibility
export { WebTool as default };
