/**
 * Tool Manager - Simplified
 *
 * Refactored from 352 lines to ~150 lines
 * DI Container extracted to ToolDIContainer
 * Tool Loading extracted to ToolLoader
 * Registry Proxy extracted to ToolRegistryProxy
 */

import type { BuiltinTool } from './types.js';
import type { ToolBus } from '../../agent/tools/bus.js';

// Extracted modules
import { ToolDIContainer } from './di/index.js';
import { ToolLoader, type LazyToolDescriptor, type ToolLifecycle } from './loading/index.js';
import { ToolRegistryProxy } from './registry/index.js';

// ============================================================================
// Tool Lifecycle Hooks
// ============================================================================

/**
 * Tool lifecycle hooks interface
 */
export interface ToolLifecycle {
  onBeforeLoad?(toolName: string): void | Promise<void>;
  onAfterLoad?(toolName: string, tool: BuiltinTool): void | Promise<void>;
  onBeforeUnload?(toolName: string, tool: BuiltinTool): void | Promise<void>;
  onAfterUnload?(toolName: string): void | Promise<void>;
}

// ============================================================================
// Lazy-loading Tool Manager (Simplified)
// ============================================================================

/**
 * Lazy Tool Manager coordinates tool loading and dependency management
 * This is the simplified main file that delegates to specialized modules
 */
export class LazyToolManager {
  private container: ToolDIContainer;
  private loader: ToolLoader;
  private registry: ToolRegistryProxy;

  constructor(lifecycle?: ToolLifecycle) {
    this.container = new ToolDIContainer();
    this.loader = new ToolLoader(lifecycle);
    this.registry = new ToolRegistryProxy(this.loader);
  }

  /**
   * Register a lazy tool
   */
  registerTool(
    name: string,
    loader: () => Promise<BuiltinTool> | BuiltinTool,
    dependencies: string[] = []
  ): void {
    this.loader.registerTool(name, loader, dependencies);
  }

  /**
   * Register an immediate tool
   */
  registerImmediateTool(name: string, tool: BuiltinTool): void {
    this.loader.registerImmediateTool(name, tool);
  }

  /**
   * Register a tool factory (for DI)
   */
  registerToolFactory<T>(
    name: string,
    factory: () => T,
    singleton: boolean = true
  ): void {
    if (singleton) {
      this.container.registerSingleton(name, factory);
    } else {
      this.container.registerTransient(name, factory);
    }
  }

  /**
   * Get a tool (loads if necessary)
   */
  async getTool(name: string): Promise<BuiltinTool | null> {
    return this.loader.getTool(name);
  }

  /**
   * Check if tool is loaded
   */
  isLoaded(name: string): boolean {
    return this.loader.isLoaded(name);
  }

  /**
   * Get all loaded tool names
   */
  getLoadedTools(): string[] {
    return this.loader.getLoadedTools();
  }

  /**
   * Preload tools (useful for initialization)
   */
  async preloadTools(...names: string[]): Promise<void> {
    return this.loader.preloadTools(...names);
  }

  /**
   * Unload a tool (free memory)
   */
  async unloadTool(name: string): Promise<void> {
    return this.loader.unloadTool(name);
  }

  /**
   * Unload all tools
   */
  async unloadAll(): Promise<void> {
    return this.loader.unloadAll();
  }

  /**
   * Get tool from DI container
   */
  getDependency<T>(key: string): T {
    return this.container.resolve<T>(key);
  }

  /**
   * Check if dependency exists
   */
  hasDependency(key: string): boolean {
    return this.container.has(key);
  }

  /**
   * Get registry proxy
   */
  getRegistry(): ToolRegistryProxy {
    return this.registry;
  }

  /**
   * Get manager statistics
   */
  getStats(): {
    tools: ReturnType<ToolLoader['getStats']>;
    dependencies: ReturnType<ToolDIContainer['getStats']>;
  } {
    return {
      tools: this.loader.getStats(),
      dependencies: this.container.getStats()
    };
  }

  /**
   * Clear all resources (for testing)
   */
  clear(): void {
    this.container.clear();
  }
}

// ============================================================================
// Global Instance Management
// ============================================================================

let globalToolManager: LazyToolManager | null = null;

/**
 * Get or create global tool manager
 */
export function getToolManager(): LazyToolManager {
  if (!globalToolManager) {
    globalToolManager = new LazyToolManager();
  }
  return globalToolManager;
}

/**
 * Set global tool manager (for testing)
 */
export function setToolManager(manager: LazyToolManager): void {
  globalToolManager = manager;
}

/**
 * Reset global tool manager
 */
export function resetToolManager(): void {
  globalToolManager = null;
}

// Re-export types
export type { ToolLifecycle, LazyToolDescriptor };
export { ToolDIContainer, ToolLoader, ToolRegistryProxy };
