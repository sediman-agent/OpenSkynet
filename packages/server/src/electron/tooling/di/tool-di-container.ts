/**
 * Dependency Injection Container
 * Manages tool dependencies with proper lifecycle
 */

/**
 * Dependency Injection Container for tool dependencies
 * This is extracted from electron/tooling/tool-manager.ts
 */
export class ToolDIContainer {
  private readonly singletons = new Map<string, unknown>();
  private readonly factories = new Map<string, () => unknown>();
  private readonly transient = new Set<string>();

  /**
   * Register a singleton dependency
   */
  registerSingleton<T>(key: string, factory: () => T): void {
    this.factories.set(key, factory);
    this.singletons.delete(key);
    this.transient.delete(key);
  }

  /**
   * Register a transient dependency (new instance each time)
   */
  registerTransient<T>(key: string, factory: () => T): void {
    this.factories.set(key, factory);
    this.transient.add(key);
  }

  /**
   * Register an existing instance
   */
  registerInstance<T>(key: string, instance: T): void {
    this.singletons.set(key, instance);
    this.factories.delete(key);
    this.transient.delete(key);
  }

  /**
   * Resolve a dependency
   */
  resolve<T>(key: string): T {
    // Check for existing instance
    if (this.singletons.has(key)) {
      return this.singletons.get(key) as T;
    }

    // Check if transient
    if (this.transient.has(key)) {
      const factory = this.factories.get(key);
      if (!factory) {
        throw new Error(`No factory registered for: ${key}`);
      }
      return factory() as T;
    }

    // Create new singleton
    const factory = this.factories.get(key);
    if (!factory) {
      throw new Error(`No factory registered for: ${key}`);
    }

    const instance = factory();
    this.singletons.set(key, instance);
    return instance as T;
  }

  /**
   * Check if dependency exists
   */
  has(key: string): boolean {
    return this.factories.has(key) || this.singletons.has(key);
  }

  /**
   * Get all registered keys
   */
  keys(): string[] {
    const allKeys = new Set([
      ...this.singletons.keys(),
      ...this.factories.keys()
    ]);
    return Array.from(allKeys);
  }

  /**
   * Get container statistics
   */
  getStats(): {
    singletons: number;
    factories: number;
    transients: number;
  } {
    return {
      singletons: this.singletons.size,
      factories: this.factories.size,
      transients: this.transient.size
    };
  }

  /**
   * Clear all dependencies (for testing)
   */
  clear(): void {
    this.singletons.clear();
    this.factories.clear();
    this.transient.clear();
  }
}
