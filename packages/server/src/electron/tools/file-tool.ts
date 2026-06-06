/**
 * FileTool - File system operations
 *
 * Refactored to use ActionBasedTool pattern for:
 * - Flat action handlers (no nested switches)
 * - Type-safe action routing
 * - Single source of truth for schemas
 * - Easier maintenance
 */

import { z } from 'zod';
import { readFile, writeFile, readdir, mkdir, unlink, rename, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { ActionBasedTool, type ActionDef } from '../tooling/action-tool';
import { ToolAccesses } from '../tooling/tool-access';

// Action schemas
const FileReadSchema = z.object({
  action: z.literal('read'),
  path: z.string().min(1, 'Path cannot be empty'),
});

const FileWriteSchema = z.object({
  action: z.literal('write'),
  path: z.string().min(1, 'Path cannot be empty'),
  content: z.string(),
});

const FileListSchema = z.object({
  action: z.literal('list'),
  path: z.string().min(1, 'Path cannot be empty'),
});

const FileCreateDirSchema = z.object({
  action: z.literal('create_dir'),
  path: z.string().min(1, 'Path cannot be empty'),
});

const FileDeleteSchema = z.object({
  action: z.literal('delete'),
  path: z.string().min(1, 'Path cannot be empty'),
});

const FileMoveSchema = z.object({
  action: z.literal('move'),
  source: z.string().min(1, 'Source path cannot be empty'),
  destination: z.string().min(1, 'Destination path cannot be empty'),
});

const FileSearchSchema = z.object({
  action: z.literal('search'),
  path: z.string().min(1, 'Search path cannot be empty'),
  pattern: z.string().min(1, 'Pattern cannot be empty'),
});

// Action handlers
const handleFileRead: ActionDef['execute'] = async (input, ctx, builder) => {
  const { path } = input as z.infer<typeof FileReadSchema>;
  builder.write(`Reading file: ${path}\n`);
  const content = await readFile(path, 'utf-8');
  builder.write(content);
  return builder.ok(`File read successfully (${content.length} bytes)`);
};

const handleFileWrite: ActionDef['execute'] = async (input, ctx, builder) => {
  const { path, content } = input as z.infer<typeof FileWriteSchema>;
  builder.write(`Writing to file: ${path}\n`);

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf-8');

  builder.write(`Wrote ${content.length} bytes to ${path}`);
  return builder.ok('File written successfully');
};

const handleFileList: ActionDef['execute'] = async (input, ctx, builder) => {
  const { path } = input as z.infer<typeof FileListSchema>;
  builder.write(`Listing directory: ${path}\n`);
  const entries = await readdir(path, { withFileTypes: true });

  if (entries.length === 0) {
    builder.write('(empty directory)');
  } else {
    const lines = entries.map((e) => {
      const type = e.isDirectory() ? 'd' : 'f';
      const name = e.name;
      return `${type} ${name}`;
    });
    builder.write(lines.join('\n'));
  }

  return builder.ok(`Listed ${entries.length} entries`);
};

const handleFileCreateDir: ActionDef['execute'] = async (input, ctx, builder) => {
  const { path } = input as z.infer<typeof FileCreateDirSchema>;
  builder.write(`Creating directory: ${path}\n`);
  await mkdir(path, { recursive: true });
  builder.write(`Directory created: ${path}`);
  return builder.ok('Directory created successfully');
};

const handleFileDelete: ActionDef['execute'] = async (input, ctx, builder) => {
  const { path } = input as z.infer<typeof FileDeleteSchema>;
  builder.write(`Deleting: ${path}\n`);

  const stats = await stat(path);

  if (stats.isDirectory()) {
    const { rmdir } = await import('node:fs/promises');
    await rmdir(path);
  } else {
    await unlink(path);
  }

  builder.write(`Deleted: ${path}`);
  return builder.ok('File/directory deleted successfully');
};

const handleFileMove: ActionDef['execute'] = async (input, ctx, builder) => {
  const { source, destination } = input as z.infer<typeof FileMoveSchema>;
  builder.write(`Moving: ${source} -> ${destination}\n`);

  await mkdir(dirname(destination), { recursive: true });
  await rename(source, destination);

  builder.write(`Moved ${source} to ${destination}`);
  return builder.ok('File moved successfully');
};

const handleFileSearch: ActionDef['execute'] = async (input, ctx, builder) => {
  const { path, pattern } = input as z.infer<typeof FileSearchSchema>;
  builder.write(`Searching in: ${path} for pattern: ${pattern}\n`);

  const matches: string[] = [];
  const rootPath = path;
  const searchPattern = pattern.toLowerCase();

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (ctx.signal.aborted) return;

      const fullPath = join(dir, entry.name);

      if (entry.name.toLowerCase().includes(searchPattern)) {
        matches.push(fullPath);
      }

      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        await walk(fullPath);
      }
    }
  }

  await walk(rootPath);

  if (matches.length === 0) {
    builder.write('No matches found');
  } else {
    builder.write(matches.join('\n'));
  }

  return builder.ok(`Found ${matches.length} matching files`);
};

// Define all actions
const fileActions: readonly ActionDef[] = [
  {
    name: 'read',
    description: 'Read the contents of a file',
    schema: FileReadSchema,
    getAccesses: (input) => ToolAccesses.readFile((input as z.infer<typeof FileReadSchema>).path),
    execute: handleFileRead,
    toDisplay: (input) => ({ kind: 'file', action: 'read', path: (input as z.infer<typeof FileReadSchema>).path }),
  },
  {
    name: 'write',
    description: 'Write content to a file (creates parent directories if needed)',
    schema: FileWriteSchema,
    getAccesses: (input) => ToolAccesses.writeFile((input as z.infer<typeof FileWriteSchema>).path),
    execute: handleFileWrite,
    toDisplay: (input) => ({
      kind: 'file',
      action: 'write',
      path: (input as z.infer<typeof FileWriteSchema>).path,
    }),
  },
  {
    name: 'list',
    description: 'List files and directories in a path',
    schema: FileListSchema,
    getAccesses: (input) => ToolAccesses.readTree((input as z.infer<typeof FileListSchema>).path),
    execute: handleFileList,
    toDisplay: (input) => ({ kind: 'file', action: 'list', path: (input as z.infer<typeof FileListSchema>).path }),
  },
  {
    name: 'create_dir',
    description: 'Create a directory (and parent directories)',
    schema: FileCreateDirSchema,
    getAccesses: (input) => ToolAccesses.writeTree((input as z.infer<typeof FileCreateDirSchema>).path),
    execute: handleFileCreateDir,
    toDisplay: (input) => ({
      kind: 'file',
      action: 'create_dir',
      path: (input as z.infer<typeof FileCreateDirSchema>).path,
    }),
  },
  {
    name: 'delete',
    description: 'Delete a file or empty directory',
    schema: FileDeleteSchema,
    getAccesses: () => ToolAccesses.all(),
    execute: handleFileDelete,
    toDisplay: (input) => ({ kind: 'file', action: 'delete', path: (input as z.infer<typeof FileDeleteSchema>).path }),
  },
  {
    name: 'move',
    description: 'Move or rename a file',
    schema: FileMoveSchema,
    getAccesses: () => ToolAccesses.all(),
    execute: handleFileMove,
    toDisplay: (input) => ({
      kind: 'file',
      action: 'move',
      path: (input as z.infer<typeof FileMoveSchema>).source,
      destination: (input as z.infer<typeof FileMoveSchema>).destination,
    }),
  },
  {
    name: 'search',
    description: 'Search for files matching a pattern under a directory',
    schema: FileSearchSchema,
    getAccesses: (input) => ToolAccesses.searchTree((input as z.infer<typeof FileSearchSchema>).path),
    execute: handleFileSearch,
    toDisplay: (input) => ({
      kind: 'file',
      action: 'search',
      path: (input as z.infer<typeof FileSearchSchema>).path,
      pattern: (input as z.infer<typeof FileSearchSchema>).pattern,
    }),
  },
];

// Create the tool
export const FileTool = new ActionBasedTool(
  'File',
  fileActions,
  {
    description: `File system operations for reading, writing, and managing files.

This tool provides comprehensive file operations:
- read: Read the contents of a file
- write: Write content to a file (creates parent directories if needed)
- list: List files and directories in a path
- create_dir: Create a directory (and parent directories)
- delete: Delete a file or empty directory
- move: Move or rename a file
- search: Search for files matching a pattern under a directory

All file operations include proper error handling and access tracking.`,
  }
);

// Export for backward compatibility
export { FileTool as default };
