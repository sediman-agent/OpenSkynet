/**
 * Tool Registry Proxy
 * Proxy interface for tool registry access
 */

import type { BuiltinTool } from '../types.js';
import type { ToolLoader } from '../loading/tool-loader.js';

/**
 * Tool Registry Proxy provides convenient access to tools
 * This is extracted from electron/tooling/tool-manager.ts
 */
export class ToolRegistryProxy {
  constructor(private readonly loader: ToolLoader) {}

  /**
   * Proxy to get tool by name
   */
  async get(name: string): Promise<BuiltinTool | null> {
    return this.loader.getTool(name);
  }

  /**
   * Proxy to check if tool is loaded
   */
  has(name: string): boolean {
    return this.loader.isLoaded(name);
  }

  /**
   * Proxy to get all loaded tool names
   */
  keys(): string[] {
    return this.loader.getLoadedTools();
  }

  /**
   * Proxy to get all registered tool names
   */
  allKeys(): string[] {
    return this.loader.getAllToolNames();
  }

  /**
   * Check if tool exists (loaded or registered)
   */
  exists(name: string): boolean {
    return this.loader.getDescriptor(name) !== undefined;
  }

  /**
   * Get tool count
   */
  count(): {
    total: number;
    loaded: number;
  } {
    const stats = this.loader.getStats();
    return {
      total: stats.total,
      loaded: stats.loaded
    };
  }
}
