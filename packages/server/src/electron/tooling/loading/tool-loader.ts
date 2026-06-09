/**
 * Tool Loader
 * Handles lazy loading of tools with dependency resolution
 */

import type { BuiltinTool } from '../types.js';
import type { ToolLifecycle } from '../tool-manager.js';

/**
 * Lazy tool descriptor
 */
export interface LazyToolDescriptor {
  readonly name: string;
  readonly loader: () => Promise<BuiltinTool> | BuiltinTool;
  readonly dependencies?: string[];
  loaded?: boolean;
  tool?: BuiltinTool;
}

/**
 * Tool Loader handles lazy loading with dependency resolution
 * This is extracted from electron/tooling/tool-manager.ts
 */
export class ToolLoader {
  private readonly tools = new Map<string, LazyToolDescriptor>();
  private readonly loadingPromises = new Map<string, Promise<BuiltinTool>>();
  private lifecycle?: ToolLifecycle;

  constructor(lifecycle?: ToolLifecycle) {
    this.lifecycle = lifecycle;
  }

  /**
   * Register a lazy tool
   */
  registerTool(
    name: string,
    loader: () => Promise<BuiltinTool> | BuiltinTool,
    dependencies: string[] = []
  ): void {
    this.tools.set(name, { name, loader, dependencies, loaded: false });
  }

  /**
   * Register an immediate (already loaded) tool
   */
  registerImmediateTool(name: string, tool: BuiltinTool): void {
    this.tools.set(name, {
      name,
      loader: () => tool,
      dependencies: [],
      loaded: true,
      tool
    });
  }

  /**
   * Get a tool (loads if necessary)
   */
  async getTool(name: string): Promise<BuiltinTool | null> {
    const descriptor = this.tools.get(name);
    if (!descriptor) {
      return null;
    }

    // Return cached tool if already loaded
    if (descriptor.loaded && descriptor.tool) {
      return descriptor.tool;
    }

    // Check if already loading (prevent duplicate loads)
    if (this.loadingPromises.has(name)) {
      return this.loadingPromises.get(name)!;
    }

    // Load the tool
    const loadPromise = this.loadTool(descriptor);
    this.loadingPromises.set(name, loadPromise);

    try {
      const tool = await loadPromise;
      return tool;
    } finally {
      this.loadingPromises.delete(name);
    }
  }

  /**
   * Check if tool is loaded
   */
  isLoaded(name: string): boolean {
    const descriptor = this.tools.get(name);
    return descriptor?.loaded ?? false;
  }

  /**
   * Get all loaded tool names
   */
  getLoadedTools(): string[] {
    const loaded: string[] = [];
    for (const [name, descriptor] of this.tools.entries()) {
      if (descriptor.loaded) {
        loaded.push(name);
      }
    }
    return loaded;
  }

  /**
   * Get all registered tool names
   */
  getAllToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Preload tools (useful for initialization)
   */
  async preloadTools(...names: string[]): Promise<void> {
    await Promise.all(names.map(name => this.getTool(name)));
  }

  /**
   * Unload a tool (free memory)
   */
  async unloadTool(name: string): Promise<void> {
    const descriptor = this.tools.get(name);
    if (!descriptor || !descriptor.loaded) {
      return;
    }

    // Call lifecycle hook
    if (this.lifecycle?.onBeforeUnload && descriptor.tool) {
      await this.lifecycle.onBeforeUnload(name, descriptor.tool);
    }

    // Clear tool
    descriptor.loaded = false;
    descriptor.tool = undefined;

    // Call lifecycle hook
    if (this.lifecycle?.onAfterUnload) {
      await this.lifecycle.onAfterUnload(name);
    }
  }

  /**
   * Unload all tools
   */
  async unloadAll(): Promise<void> {
    const names = Array.from(this.tools.keys());
    await Promise.all(names.map(name => this.unloadTool(name)));
  }

  /**
   * Internal: Load a tool with dependency resolution
   */
  private async loadTool(descriptor: LazyToolDescriptor): Promise<BuiltinTool> {
    // Load dependencies first
    if (descriptor.dependencies) {
      await Promise.all(
        descriptor.dependencies.map(dep => this.getTool(dep))
      );
    }

    // Call lifecycle hook
    if (this.lifecycle?.onBeforeLoad) {
      await this.lifecycle.onBeforeLoad(descriptor.name);
    }

    // Load the tool
    const tool = await descriptor.loader();

    // Cache the tool
    descriptor.loaded = true;
    descriptor.tool = tool;

    // Call lifecycle hook
    if (this.lifecycle?.onAfterLoad) {
      await this.lifecycle.onAfterLoad(descriptor.name, tool);
    }

    return tool;
  }

  /**
   * Get tool descriptor
   */
  getDescriptor(name: string): LazyToolDescriptor | undefined {
    return this.tools.get(name);
  }

  /**
   * Get loader statistics
   */
  getStats(): {
    total: number;
    loaded: number;
    loading: number;
  } {
    let loaded = 0;
    let loading = 0;

    for (const descriptor of this.tools.values()) {
      if (descriptor.loaded) loaded++;
      if (this.loadingPromises.has(descriptor.name)) loading++;
    }

    return {
      total: this.tools.size,
      loaded,
      loading
    };
  }
}
