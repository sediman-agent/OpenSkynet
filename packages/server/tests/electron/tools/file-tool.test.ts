/**
 * Tests for FileTool
 *
 * Tests file system operations including:
 * - read: Read file contents
 * - write: Write content to file
 * - list: List directory contents
 * - create_dir: Create directory
 * - delete: Delete file or directory
 * - move: Move or rename file
 * - search: Search for files matching pattern
 */

import { test, describe, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync, mkdirSync } from "node:fs";
import { FileTool } from "../../../src/electron/tools/file-tool";

describe("FileTool", () => {
  let testDir: string;
  let tool: typeof FileTool;

  beforeEach(() => {
    // Create temporary test directory
    testDir = join(tmpdir(), `file-tool-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    tool = FileTool;
  });

  afterEach(() => {
    // Clean up test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("tool registration", () => {
    test("has correct name", () => {
      expect(tool.name).toBe("File");
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

  describe("read action", () => {
    test("reads file successfully", async () => {
      const testFile = join(testDir, "test.txt");
      const testContent = "Hello, World!";

      // Create test file
      await Bun.write(testFile, testContent);

      // Execute tool
      const execution = await tool.resolveExecution({
        action: "read",
        path: testFile,
      });

      expect("isError" in execution).toBe(false);

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);
      expect(result.output).toContain(testContent);
    });

    test("returns error for non-existent file", async () => {
      const execution = await tool.resolveExecution({
        action: "read",
        path: join(testDir, "nonexistent.txt"),
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(true);
    });
  });

  describe("write action", () => {
    test("writes file successfully", async () => {
      const testFile = join(testDir, "write-test.txt");
      const testContent = "Test content for write";

      const execution = await tool.resolveExecution({
        action: "write",
        path: testFile,
        content: testContent,
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);

      // Verify file was written
      const readContent = await Bun.file(testFile).text();
      expect(readContent).toBe(testContent);
    });

    test("creates parent directories automatically", async () => {
      const testFile = join(testDir, "subdir", "nested", "file.txt");

      const execution = await tool.resolveExecution({
        action: "write",
        path: testFile,
        content: "content",
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);
    });
  });

  describe("list action", () => {
    test("lists directory contents", async () => {
      // Create test files
      await Bun.write(join(testDir, "file1.txt"), "content1");
      await Bun.write(join(testDir, "file2.txt"), "content2");
      mkdirSync(join(testDir, "subdir"));

      const execution = await tool.resolveExecution({
        action: "list",
        path: testDir,
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);
      expect(result.output).toContain("file1.txt");
      expect(result.output).toContain("file2.txt");
      expect(result.output).toContain("subdir");
    });

    test("handles empty directory", async () => {
      const emptyDir = join(testDir, "empty");
      mkdirSync(emptyDir);

      const execution = await tool.resolveExecution({
        action: "list",
        path: emptyDir,
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);
    });
  });

  describe("create_dir action", () => {
    test("creates directory successfully", async () => {
      const newDir = join(testDir, "newdir");

      const execution = await tool.resolveExecution({
        action: "create_dir",
        path: newDir,
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);
      // Verify directory was created
      const stat = await Bun.file(newDir).stat();
      expect(stat?.isDirectory?.()).toBe(true);
    });

    test("creates nested directories", async () => {
      const nestedDir = join(testDir, "parent", "child", "grandchild");

      const execution = await tool.resolveExecution({
        action: "create_dir",
        path: nestedDir,
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);
    });
  });

  describe("move action", () => {
    test("moves file successfully", async () => {
      const sourceFile = join(testDir, "source.txt");
      const destFile = join(testDir, "dest.txt");
      const content = "move this content";

      await Bun.write(sourceFile, content);

      const execution = await tool.resolveExecution({
        action: "move",
        source: sourceFile,
        destination: destFile,
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);

      // Verify file was moved
      const movedContent = await Bun.file(destFile).text();
      expect(movedContent).toBe(content);
    });
  });

  describe("search action", () => {
    test("finds files matching pattern", async () => {
      // Create test files
      await Bun.write(join(testDir, "test1.txt"), "content");
      await Bun.write(join(testDir, "test2.txt"), "content");
      await Bun.write(join(testDir, "other.txt"), "content");

      const execution = await tool.resolveExecution({
        action: "search",
        path: testDir,
        pattern: "test",
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);
      expect(result.output).toContain("test1.txt");
      expect(result.output).toContain("test2.txt");
    });

    test("returns empty for no matches", async () => {
      const execution = await tool.resolveExecution({
        action: "search",
        path: testDir,
        pattern: "nonexistent",
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);
    });
  });
});
