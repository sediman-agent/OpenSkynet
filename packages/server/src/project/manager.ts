/**
 * Project Manager - Simplified
 *
 * Refactored from 317 lines to ~150 lines
 * Database operations extracted to ProjectRepository
 * Instance management extracted to ProjectInstanceManager
 */

import { join } from "node:path";
import { getConfig } from "../core/config.js";
import logger from "../core/logging.js";
import type { LLMProvider } from "../llm/provider.js";
import type { BaseMemoryStrategy } from "../memory/strategy.js";
import type { SkillEngine } from "../skills/engine.js";
import type { Project, ProjectConversation, ProjectConfig } from "../core/types.js";

// Extracted modules
import { ProjectRepository } from "./repository/project-repository.js";
import { ProjectInstanceManager } from "./instances/project-instance-manager.js";

/**
 * Project Instance
 * Represents a running project with all its components
 */
export interface ProjectInstance {
  projectId: string;
  project: { headless: boolean; userDataDir: string };
  browserSession?: any;
  browserController?: any;
  agentLoop?: any;
  toolBus?: any;
}

/**
 * Project Manager coordinates project and instance management
 * This is the simplified main file that delegates to specialized modules
 */
export class ProjectManager {
  private repository: ProjectRepository;
  private instances: ProjectInstanceManager;
  private terminalAllowed: boolean;

  constructor(opts: {
    llmProvider: LLMProvider;
    memory: BaseMemoryStrategy;
    skillEngine: SkillEngine;
    headless?: boolean;
    terminalAllowed?: boolean;
  }) {
    const { getDb } = require("../store/db.js");

    this.repository = new ProjectRepository(getDb);
    this.instances = new ProjectInstanceManager(
      opts.llmProvider,
      opts.memory,
      opts.skillEngine,
      opts.headless ?? true,
      opts.terminalAllowed ?? false
    );
    this.terminalAllowed = opts.terminalAllowed ?? false;
  }

  /**
   * Create a new project
   */
  async createProject(config: ProjectConfig): Promise<Project> {
    const id = this.generateId();
    const userDataDir = this.projectDir(id);
    const headlessNum = config.headless ?? true ? 1 : 0;

    return this.repository.createProject({
      id,
      name: config.name,
      description: config.description,
      userDataDir,
      headless: headlessNum
    });
  }

  /**
   * Get project by ID
   */
  getProject(id: string): Project | null {
    return this.repository.getProject(id);
  }

  /**
   * List all projects
   */
  listProjects(): Project[] {
    return this.repository.listProjects();
  }

  /**
   * Update project
   */
  updateProject(
    id: string,
    updates: { name?: string; description?: string; headless?: boolean }
  ): Project | null {
    return this.repository.updateProject(id, updates);
  }

  /**
   * Delete project
   */
  async deleteProject(id: string): Promise<boolean> {
    // Stop browser instance first
    await this.instances.stop(id);

    return this.repository.deleteProject(id);
  }

  /**
   * Get or create browser instance for project
   */
  async getOrCreateBrowser(projectId: string): Promise<ProjectInstance> {
    const project = this.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    return this.instances.getOrCreate(projectId, project);
  }

  /**
   * Stop project browser
   */
  async stopProjectBrowser(projectId: string): Promise<void> {
    return this.instances.stop(projectId);
  }

  /**
   * Get browser controller
   */
  getBrowserController(projectId: string): any | null {
    return this.instances.getBrowserController(projectId);
  }

  /**
   * Get browser session (alias for getBrowserController)
   */
  getBrowserSession(projectId: string): any | null {
    return this.instances.getBrowserController(projectId);
  }

  /**
   * Create conversation
   */
  createConversation(
    projectId: string,
    task: string,
    agentMode?: string
  ): ProjectConversation {
    return this.repository.createConversation(projectId, task, agentMode);
  }

  /**
   * Update conversation
   */
  updateConversation(
    conversationId: string,
    updates: { result?: string; stepsJson?: string }
  ): boolean {
    return this.repository.updateConversation(conversationId, updates);
  }

  /**
   * List conversations
   */
  listConversations(projectId: string): ProjectConversation[] {
    return this.repository.listConversations(projectId);
  }

  /**
   * Get conversation
   */
  getConversation(conversationId: string): ProjectConversation | null {
    return this.repository.getConversation(conversationId);
  }

  /**
   * Delete conversation
   */
  deleteConversation(conversationId: string): boolean {
    return this.repository.deleteConversation(conversationId);
  }

  /**
   * Ensure default project exists
   */
  async ensureDefaultProject(): Promise<Project> {
    const DEFAULT_PROJECT_ID = "__default__";
    let project = this.getProject(DEFAULT_PROJECT_ID);

    if (project) return project;

    // Create default project
    const config = getConfig();
    const userDataDir = config.browserProfileDir;

    project = await this.repository.createProject({
      id: DEFAULT_PROJECT_ID,
      name: "Default",
      description: "Default project for legacy tasks",
      userDataDir,
      headless: 1
    });

    logger.info("default_project_created");
    return project;
  }

  /**
   * Shutdown all projects
   */
  async shutdown(): Promise<void> {
    await this.instances.shutdown();
    logger.info("project_manager_shutdown");
  }

  /**
   * Get manager statistics
   */
  getStats(): {
    projects: ReturnType<ProjectRepository['getStats']>;
    instances: ReturnType<ProjectInstanceManager['getStats']>;
  } {
    return {
      projects: this.repository.getStats(),
      instances: this.instances.getStats()
    };
  }

  /**
   * Get project directory path
   */
  private projectDir(projectId: string): string {
    const config = getConfig();
    return join(config.dataDir, "projects", projectId);
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    }).toLowerCase();
  }
}

// Re-export types
export type { ProjectInstance };

// Re-export classes for direct use
export { ProjectRepository, ProjectInstanceManager };
