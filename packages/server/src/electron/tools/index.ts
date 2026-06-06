/**
 * Electron Tools - Comprehensive tool collection
 *
 * Based on kimi-code's tool system with proper:
 * - BuiltinTool classes
 * - ToolManager for registration
 * - ExecutableTool interface
 * - Display metadata
 */

export { BrowserTool } from './browser-tool';
export { ShellTool } from './shell-tool';
export { FileTool } from './file-tool';
export { WebTool } from './web-tool';
export { SkillsTool, createSkillsTool } from './skills-tool';
export { DocumentConverterTool as DocumentTool } from './document-tool';
export { CodingTool } from './coding-tool';

export * from '../tooling/types';
export * from '../tooling/tool-access';
export * from '../tooling/result-builder';
export * from '../tooling/action-tool';

import { BrowserTool } from './browser-tool';
import { ShellTool } from './shell-tool';
import { FileTool } from './file-tool';
import { WebTool } from './web-tool';
import { SkillsTool, createSkillsTool } from './skills-tool';
import { DocumentConverterTool } from './document-tool';
import { CodingTool } from './coding-tool';
import type { BuiltinTool } from '../tooling/types';
import type { ToolBus } from '../../agent/tools/bus';

/**
 * Initialize all T-800 Agent tools and register them to ToolBus
 *
 * This follows kimi-code's pattern of:
 * - Tool classes with resolveExecution
 * - Proper tool registration
 * - Display metadata for UI
 * - Resource tracking via ToolAccesses
 */
export function initializeT800Tools(
  toolBus: ToolBus,
  options: {
    cwd?: string;
    enableShellTools?: boolean;
    enableBrowserTools?: boolean;
    enableFileTools?: boolean;
    enableWebTools?: boolean;
    enableSkillsTools?: boolean;
    enableDocumentTools?: boolean;
    enableCodingTools?: boolean;
    skillDeps?: {
      skillEngine?: import('../../skills/engine').SkillEngine;
      skillSearch?: import('../../skills/search').SkillSearchEngine;
      runSkill?: (name: string) => Promise<unknown>;
    };
  } = {}
): void {
  const {
    cwd = process.cwd(),
    enableShellTools = true,
    enableBrowserTools = true,
    enableFileTools = true,
    enableWebTools = true,
    enableSkillsTools = true,
    enableDocumentTools = true,
    enableCodingTools = true,
    skillDeps,
  } = options;

  // Browser tools
  if (enableBrowserTools) {
    const browserTool = new BrowserTool();
    registerToolToToolBus(toolBus, browserTool);
  }

  // Shell tools
  if (enableShellTools) {
    const shellTool = new ShellTool(cwd);
    registerToolToToolBus(toolBus, shellTool);
  }

  // File tools
  if (enableFileTools) {
    registerToolToToolBus(toolBus, FileTool);
  }

  // Web tools
  if (enableWebTools) {
    const webTool = new WebTool();
    registerToolToToolBus(toolBus, webTool);
  }

  // Skills tools
  if (enableSkillsTools) {
    const skillsTool = createSkillsTool(skillDeps);
    registerToolToToolBus(toolBus, skillsTool);
  }

  // Document tools
  if (enableDocumentTools) {
    registerToolToToolBus(toolBus, DocumentConverterTool);
  }

  // Coding tools
  if (enableCodingTools) {
    registerToolToToolBus(toolBus, CodingTool);
  }
}

/**
 * Initialize legacy Electron tools (backward compatibility)
 *
 * @deprecated Use initializeT800Tools instead for full tool suite
 */
export function initializeElectronTools(
  toolBus: ToolBus,
  options: {
    cwd?: string;
    enableShellTools?: boolean;
    enableBrowserTools?: boolean;
  } = {}
): void {
  initializeT800Tools(toolBus, {
    cwd: options.cwd,
    enableShellTools: options.enableShellTools,
    enableBrowserTools: options.enableBrowserTools,
    enableFileTools: false,
    enableWebTools: false,
    enableSkillsTools: false,
    enableDocumentTools: false,
    enableCodingTools: false,
  });
}

/**
 * Register a BuiltinTool to ToolBus (bridges kimi-code style to our ToolBus)
 */
function registerToolToToolBus(
  toolBus: ToolBus,
  builtinTool: BuiltinTool<unknown>
): void {
  toolBus.register(
    {
      name: builtinTool.name,
      description: builtinTool.description,
      parameters: builtinTool.parameters,
    },
    async (name, args) => {
      const execution = await builtinTool.resolveExecution(args);

      // Helper to convert output to string
      const outputToString = (output: string | Array<{ type: string; text?: string; image_url?: { url: string } }>): string => {
        if (typeof output === 'string') {
          return output;
        }
        // Convert multi-modal output to string
        return output.map(item => {
          if (item.type === 'text' && item.text) {
            return item.text;
          } else if (item.type === 'image_url' && item.image_url?.url) {
            return `[Image: ${item.image_url.url}]`;
          }
          return `[${item.type}]`;
        }).join('\n');
      };

      // Check if execution failed at resolve time
      if ('isError' in execution && execution.isError === true) {
        return {
          success: false,
          output: outputToString(execution.output),
          error: typeof execution.output === 'string' ? execution.output : 'Tool resolution failed'
        };
      }

      // At this point, execution must be RunnableToolExecution
      const runnable = execution as import('../tooling/types').RunnableToolExecution;

      // Execute the tool
      try {
        const result = await runnable.execute({
          turnId: 'electron-turn',
          toolCallId: Date.now().toString(),
          signal: new AbortController().signal
        });

        if (result.isError) {
          return {
            success: false,
            output: outputToString(result.output),
            error: typeof result.output === 'string' ? result.output : 'Tool execution failed'
          };
        }

        return {
          success: true,
          output: outputToString(result.output)
        };
      } catch (error) {
        return {
          success: false,
          output: error instanceof Error ? error.message : String(error),
          error: error instanceof Error ? error.message : 'Tool execution failed'
        };
      }
    }
  );
}
