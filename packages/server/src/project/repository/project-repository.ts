/**
 * Project Repository
 * Handles database operations for projects and conversations
 */

import { join } from "node:path";
import { getConfig } from "../../core/config.js";
import logger from "../../core/logging.js";
import type { Project, ProjectConversation } from "../../core/types.js";

/**
 * Project Repository handles database operations
 * This is extracted from project/manager.ts
 */
export class ProjectRepository {
  constructor(private getDb: () => any) {}

  /**
   * Create a new project
   */
  async createProject(config: {
    id: string;
    name: string;
    description?: string;
    userDataDir: string;
    headless: number;
  }): Promise<Project> {
    const db = this.getDb();

    const stmt = db.prepare(
      `INSERT INTO projects (id, name, description, user_data_dir, headless)
       VALUES (?, ?, ?, ?, ?)`
    );
    stmt.run(
      config.id,
      config.name,
      config.description ?? "",
      config.userDataDir,
      config.headless
    );

    logger.info({ projectId: config.id, name: config.name }, "project_created");

    return this.getProject(config.id)!;
  }

  /**
   * Get project by ID
   */
  getProject(id: string): Project | null {
    const db = this.getDb();
    const row = db
      .query("SELECT * FROM projects WHERE id = ?")
      .get(id) as any;
    return row ? this.rowToProject(row) : null;
  }

  /**
   * List all projects
   */
  listProjects(): Project[] {
    const db = this.getDb();
    const rows = db
      .query("SELECT * FROM projects ORDER BY created_at DESC")
      .all() as any[];
    return rows.map((r) => this.rowToProject(r));
  }

  /**
   * Update project
   */
  updateProject(
    id: string,
    updates: { name?: string; description?: string; headless?: boolean }
  ): Project | null {
    const db = this.getDb();
    const existing = this.getProject(id);

    if (!existing) return null;

    const name = updates.name ?? existing.name;
    const description = updates.description ?? existing.description;
    const headlessNum =
      updates.headless !== undefined ? (updates.headless ? 1 : 0) : (existing.headless ? 1 : 0);

    db
      .prepare(
        `UPDATE projects SET name = ?, description = ?, headless = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      )
      .run(name, description, headlessNum, id);

    return this.getProject(id);
  }

  /**
   * Delete project
   */
  deleteProject(id: string): boolean {
    const db = this.getDb();

    // Check if exists first
    const existing = db.query("SELECT id FROM projects WHERE id = ?").get(id);
    if (!existing) return false;

    db.prepare("DELETE FROM project_conversations WHERE project_id = ?").run(id);
    db.prepare("DELETE FROM projects WHERE id = ?").run(id);

    logger.info({ projectId: id }, "project_deleted");
    return true;
  }

  /**
   * Create conversation
   */
  createConversation(
    projectId: string,
    task: string,
    agentMode?: string
  ): ProjectConversation {
    const db = this.getDb();
    const id = this.generateId();

    db
      .prepare(
        `INSERT INTO project_conversations (id, project_id, task, steps_json, agent_mode)
         VALUES (?, ?, ?, '[]', ?)`
      )
      .run(id, projectId, task, agentMode ?? "browser");

    const row = db
      .query("SELECT * FROM project_conversations WHERE id = ?")
      .get(id) as any;

    return this.rowToConversation(row);
  }

  /**
   * Update conversation
   */
  updateConversation(
    conversationId: string,
    updates: { result?: string; stepsJson?: string }
  ): boolean {
    const db = this.getDb();
    const existing = db
      .query("SELECT id FROM project_conversations WHERE id = ?")
      .get(conversationId) as any;

    if (!existing) return false;

    if (updates.result !== undefined) {
      db
        .prepare("UPDATE project_conversations SET result = ? WHERE id = ?")
        .run(updates.result, conversationId);
    }
    if (updates.stepsJson !== undefined) {
      db
        .prepare("UPDATE project_conversations SET steps_json = ? WHERE id = ?")
        .run(updates.stepsJson, conversationId);
    }
    return true;
  }

  /**
   * List conversations for project
   */
  listConversations(projectId: string): ProjectConversation[] {
    const db = this.getDb();
    const rows = db
      .query(
        "SELECT * FROM project_conversations WHERE project_id = ? ORDER BY created_at DESC"
      )
      .all(projectId) as any[];
    return rows.map((r) => this.rowToConversation(r));
  }

  /**
   * Get conversation by ID
   */
  getConversation(conversationId: string): ProjectConversation | null {
    const db = this.getDb();
    const row = db
      .query("SELECT * FROM project_conversations WHERE id = ?")
      .get(conversationId) as any;
    return row ? this.rowToConversation(row) : null;
  }

  /**
   * Delete conversation
   */
  deleteConversation(conversationId: string): boolean {
    const db = this.getDb();
    const existing = db
      .query("SELECT id FROM project_conversations WHERE id = ?")
      .get(conversationId) as any;
    if (!existing) return false;

    db
      .prepare("DELETE FROM project_conversations WHERE id = ?")
      .run(conversationId);
    return true;
  }

  /**
   * Get database statistics
   */
  getStats(): {
    projectCount: number;
    conversationCount: number;
  } {
    const db = this.getDb();
    const projects = db.query("SELECT COUNT(*) as count FROM projects").get() as any;
    const conversations = db.query("SELECT COUNT(*) as count FROM project_conversations").get() as any;

    return {
      projectCount: projects.count,
      conversationCount: conversations.count
    };
  }

  /**
   * Convert database row to Project object
   */
  private rowToProject(row: any): Project {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? "",
      userDataDir: row.user_data_dir,
      headless: row.headless === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Convert database row to ProjectConversation object
   */
  private rowToConversation(row: any): ProjectConversation {
    return {
      id: row.id,
      projectId: row.project_id,
      task: row.task,
      stepsJson: row.steps_json ?? "[]",
      result: row.result ?? undefined,
      agentMode: row.agent_mode ?? "browser",
      createdAt: row.created_at,
    };
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
