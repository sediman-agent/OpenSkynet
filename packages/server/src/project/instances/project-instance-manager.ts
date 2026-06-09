/**
 * Project Instance Manager
 * Manages browser instances and related components for projects
 */

import type { BrowserSession } from "../../browser/session.js";
import { BrowserController } from "../../browser/controller.js";
import type { AgentLoop } from "../../agent/loop.js";
import type { ToolBus } from "../../agent/tools/bus.js";
import type { ProjectInstance } from "../manager.js";
import { createAgentToolRegistry } from "../../agent/tools";
import { registerBrowserTools } from "../../agent/tools/browser-tools.js";
import { getConfig } from "../../core/config.js";
import logger from "../../core/logging.js";

/**
 * Project Instance Manager manages project component lifecycles
 * This is extracted from project/manager.ts
 */
export class ProjectInstanceManager {
  private instances: Map<string, ProjectInstance> = new Map();

  constructor(
    private llmProvider: any,
    private memory: any,
    private skillEngine: any,
    private headless: boolean = true,
    private terminalAllowed: boolean = false
  ) {}

  /**
   * Get or create project instance
   */
  async getOrCreate(
    projectId: string,
    project: { headless: boolean; userDataDir: string }
  ): Promise<ProjectInstance> {
    let instance = this.instances.get(projectId);
    if (instance) return instance;

    const config = getConfig();

    // Create browser session
    const browserSession = new BrowserSession({
      headless: project.headless,
      stealth: config.stealthEnabled,
      proxy: config.stealthProxy || undefined,
      userDataDir: project.userDataDir,
    });

    // Create browser controller
    const browserController = new BrowserController({
      headless: project.headless,
      userDataDir: project.userDataDir,
    });

    await browserController.start();

    // Create tool bus
    const toolBus = createAgentToolRegistry({
      terminalAllowed: this.terminalAllowed,
      memoryManager: this.memory,
      skillEngine: this.skillEngine,
      enableBrowserTools: true,
      browserController,
    });

    // Register browser tools
    registerBrowserTools(toolBus, browserController);

    // Create agent loop
    const agentLoop = new (await import("../../agent/loop.js")).AgentLoop({
      llmProvider: this.llmProvider,
      browserSession,
      memory: this.memory,
      skillEngine: this.skillEngine,
      toolBus,
      headless: project.headless,
    });

    instance = { browserController, browserSession, toolBus, agentLoop };
    this.instances.set(projectId, instance);

    logger.info({ projectId }, "project_browser_started");
    return instance;
  }

  /**
   * Stop project browser instance
   */
  async stop(projectId: string): Promise<void> {
    const instance = this.instances.get(projectId);
    if (!instance) return;

    try {
      await instance.browserController.stop();
    } catch (err) {
      logger.error({ projectId, err: (err as Error).message }, "project_browser_stop_error");
    }

    this.instances.delete(projectId);
    logger.info({ projectId }, "project_browser_stopped");
  }

  /**
   * Get browser controller for project
   */
  getBrowserController(projectId: string): BrowserController | null {
    return this.instances.get(projectId)?.browserController ?? null;
  }

  /**
   * Check if project instance exists
   */
  hasInstance(projectId: string): boolean {
    return this.instances.has(projectId);
  }

  /**
   * Get project instance
   */
  getInstance(projectId: string): ProjectInstance | undefined {
    return this.instances.get(projectId);
  }

  /**
   * Get all project IDs
   */
  getActiveProjectIds(): string[] {
    return Array.from(this.instances.keys());
  }

  /**
   * Shutdown all instances
   */
  async shutdown(): Promise<void> {
    const projectIds = this.getActiveProjectIds();

    for (const projectId of projectIds) {
      await this.stop(projectId);
    }

    logger.info({ shutdownCount: projectIds.length }, "project_instances_shutdown");
  }

  /**
   * Get instance statistics
   */
  getStats(): {
    total: number;
    active: number;
  } {
    return {
      total: this.instances.size,
      active: this.instances.size
    };
  }
}
