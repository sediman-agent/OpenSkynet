/**
 * Tests for SkillsTool
 *
 * Tests skill management operations:
 * - list: List all available skills
 * - run: Execute a skill by name
 * - create: Create a new skill
 * - delete: Delete a skill
 * - search: Search for skills
 */

import { test, describe, expect, beforeEach } from "bun:test";
import { createSkillsTool } from "../../../src/electron/tools/skills-tool";

// Simple mock skill engine for testing
class MockSkillEngine {
  private skills = new Map<string, { name: string; description: string; steps: string[] }>();

  create(name: string, description: string, steps: string[], extra?: Record<string, unknown>) {
    this.skills.set(name, { name, description, steps });
    return { name, description, steps, version: 1, ...extra };
  }

  getSkill(name: string) {
    return this.skills.get(name);
  }

  delete(name: string) {
    return this.skills.delete(name);
  }

  listSkills() {
    return Array.from(this.skills.values());
  }
}

describe("SkillsTool", () => {
  let tool: ReturnType<typeof createSkillsTool>;
  let skillEngine: MockSkillEngine;

  beforeEach(() => {
    // Create a skill engine for testing
    skillEngine = new MockSkillEngine();

    // Create tool with dependencies
    tool = createSkillsTool({
      skillEngine: skillEngine as any,
      skillSearch: undefined,
      runSkill: async (name: string) => {
        return {
          task: name,
          result: `Executed skill: ${name}`,
          success: true,
          elapsed_secs: 0.5,
          steps: [],
        };
      },
    });
  });

  describe("tool registration", () => {
    test("has correct name", () => {
      expect(tool.name).toBe("Skills");
    });

    test("has description", () => {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(0);
    });

    test("has parameters schema", () => {
      expect(tool.parameters).toBeTruthy();
      expect(typeof tool.parameters).toBe("object");
    });
  });

  describe("list action", () => {
    test("lists no skills when engine is empty", async () => {
      const execution = await tool.resolveExecution({
        action: "list",
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);
      expect(result.output).toContain("No skills");
    });

    test("lists available skills", async () => {
      // Create a test skill
      skillEngine.create("test-skill", "Test skill description", ["step 1", "step 2"]);

      const execution = await tool.resolveExecution({
        action: "list",
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);
      expect(result.output).toContain("test-skill");
    });

    test("returns error when skill engine not available", async () => {
      const toolWithoutEngine = createSkillsTool({});

      const execution = await toolWithoutEngine.resolveExecution({
        action: "list",
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(true);
    });
  });

  describe("run action", () => {
    test("runs a skill successfully", async () => {
      // Create a test skill
      skillEngine.create("run-test", "A test skill", ["action 1", "action 2"]);

      const execution = await tool.resolveExecution({
        action: "run",
        name: "run-test",
        args: {},
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);
      expect(result.output).toContain("Executed skill: run-test");
    });

    test("returns error for non-existent skill", async () => {
      const execution = await tool.resolveExecution({
        action: "run",
        name: "nonexistent-skill",
        args: {},
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(true);
      expect(result.output).toContain("not found");
    });

    test("returns error when runSkill not available", async () => {
      const toolWithoutRun = createSkillsTool({ skillEngine });

      const execution = await toolWithoutRun.resolveExecution({
        action: "run",
        name: "any-skill",
        args: {},
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(true);
    });
  });

  describe("create action", () => {
    test("creates a new skill successfully", async () => {
      const execution = await tool.resolveExecution({
        action: "create",
        name: "new-skill",
        description: "A new test skill",
        steps: ["step 1", "step 2", "step 3"],
        category: "test",
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);
      expect(result.output).toContain("new-skill");

      // Verify skill was created
      const skill = skillEngine.getSkill("new-skill");
      expect(skill).toBeTruthy();
    });

    test("creates skill with variables", async () => {
      const execution = await tool.resolveExecution({
        action: "create",
        name: "skill-with-vars",
        description: "Skill with variables",
        steps: ["use {{var1}}", "use {{var2}}"],
        variables: {
          var1: "value1",
          var2: "value2",
        },
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);
    });

    test("returns error when skill engine not available", async () => {
      const toolWithoutEngine = createSkillsTool({});

      const execution = await toolWithoutEngine.resolveExecution({
        action: "create",
        name: "test",
        description: "Test",
        steps: ["step 1"],
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(true);
    });
  });

  describe("delete action", () => {
    test("deletes a skill successfully", async () => {
      // Create a test skill first
      skillEngine.create("delete-test", "To be deleted", ["step 1"]);

      const execution = await tool.resolveExecution({
        action: "delete",
        name: "delete-test",
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);
      expect(result.output).toContain("delete-test");

      // Verify skill was deleted
      const skill = skillEngine.getSkill("delete-test");
      expect(skill).toBeUndefined();
    });

    test("returns error for non-existent skill", async () => {
      const execution = await tool.resolveExecution({
        action: "delete",
        name: "nonexistent-skill",
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(true);
      expect(result.output).toContain("not found");
    });

    test("returns error when skill engine not available", async () => {
      const toolWithoutEngine = createSkillsTool({});

      const execution = await toolWithoutEngine.resolveExecution({
        action: "delete",
        name: "test",
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(true);
    });
  });

  describe("search action", () => {
    test("returns error when search not available", async () => {
      const execution = await tool.resolveExecution({
        action: "search",
        query: "test query",
        limit: 10,
        scope: "all",
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(true);
      expect(result.output).toContain("not available");
    });
  });
});
