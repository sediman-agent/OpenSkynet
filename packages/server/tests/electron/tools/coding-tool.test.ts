/**
 * Tests for CodingTool
 *
 * Tests code-specific operations including:
 * - edit: Edit specific lines in a file
 * - search: Search for text/regex patterns in a file
 * - find_refs: Find references to an identifier
 * - verify: Verify syntax and check code style
 */

import { test, describe, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync, mkdirSync } from "node:fs";
import { CodingTool } from "../../../src/electron/tools/coding-tool";

describe("CodingTool", () => {
  let testDir: string;
  let tool: typeof CodingTool;

  beforeEach(() => {
    // Create temporary test directory
    testDir = join(tmpdir(), `coding-tool-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    tool = CodingTool;
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
      expect(tool.name).toBe("Coding");
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

  describe("edit action", () => {
    test("edits specific lines successfully", async () => {
      const testFile = join(testDir, "test.ts");
      const originalContent = "line 1\nline 2\nline 3\nline 4\nline 5\n";

      await Bun.write(testFile, originalContent);

      const execution = await tool.resolveExecution({
        action: "edit",
        path: testFile,
        start_line: 2,
        end_line: 4,
        new_content: "new line 2\nnew line 3",
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);

      // Verify content was edited
      const editedContent = await Bun.file(testFile).text();
      expect(editedContent).toBe("line 1\nnew line 2\nnew line 3\nline 5\n");
    });

    test("creates backup when requested", async () => {
      const testFile = join(testDir, "backup-test.ts");
      const originalContent = "original content\n";

      await Bun.write(testFile, originalContent);

      const execution = await tool.resolveExecution({
        action: "edit",
        path: testFile,
        start_line: 1,
        end_line: 1,
        new_content: "edited content\n",
        create_backup: true,
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);
      expect(result.output).toContain("Backup created");
    });

    test("returns error for invalid line numbers", async () => {
      const testFile = join(testDir, "test.ts");
      await Bun.write(testFile, "line 1\nline 2\n");

      const execution = await tool.resolveExecution({
        action: "edit",
        path: testFile,
        start_line: 10,
        end_line: 15,
        new_content: "content",
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
    test("finds text matches", async () => {
      const testFile = join(testDir, "search-test.ts");
      const content = "function hello() {\n  const world = 'hello';\n  return hello + world;\n}";

      await Bun.write(testFile, content);

      const execution = await tool.resolveExecution({
        action: "search",
        path: testFile,
        search_term: "hello",
        case_sensitive: false,
        regex: false,
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);
      expect(result.output).toContain("hello");
    });

    test("supports regex search", async () => {
      const testFile = join(testDir, "regex-test.ts");
      const content = "const abc123 = 1;\nconst def456 = 2;\nconst ghi789 = 3;\n";

      await Bun.write(testFile, content);

      const execution = await tool.resolveExecution({
        action: "search",
        path: testFile,
        search_term: "\\b[a-z]{3}\\d{3}\\b",
        case_sensitive: false,
        regex: true,
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);
      expect(result.output).toContain("abc123");
      expect(result.output).toContain("def456");
    });

    test("respects case sensitivity", async () => {
      const testFile = join(testDir, "case-test.ts");
      const content = "Hello\nHELLO\nhello\n";

      await Bun.write(testFile, content);

      const execution = await tool.resolveExecution({
        action: "search",
        path: testFile,
        search_term: "hello",
        case_sensitive: true,
        regex: false,
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);
      // Should only find the lowercase "hello" in the actual content
      const outputLines = (result.output as string).split('\n');
      const matches = outputLines.filter(line => line.includes('hello') && !line.includes('Line') && !line.includes('Found'));
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("find_refs action", () => {
    test("finds identifier references in codebase", async () => {
      // Create test files
      const srcDir = join(testDir, "src");
      mkdirSync(srcDir, { recursive: true });

      await Bun.write(join(srcDir, "file1.ts"), "export const myFunc = () => {};\n");
      await Bun.write(join(srcDir, "file2.ts"), "import { myFunc } from './file1';\nmyFunc();\n");

      const execution = await tool.resolveExecution({
        action: "find_refs",
        path: srcDir,
        identifier: "myFunc",
        file_pattern: "*.{ts,js}",
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);
      expect(result.output).toContain("myFunc");
    });
  });

  describe("verify action", () => {
    test("detects trailing whitespace", async () => {
      const testFile = join(testDir, "style-test.ts");
      const content = "line 1\t\nline 2   \nline 3\n";

      await Bun.write(testFile, content);

      const execution = await tool.resolveExecution({
        action: "verify",
        path: testFile,
        language: "typescript",
        check_style: true,
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);
      expect(result.output).toContain("issues");
    });

    test("detects long lines", async () => {
      const testFile = join(testDir, "long-line.ts");
      const content = "a".repeat(150) + "\n";

      await Bun.write(testFile, content);

      const execution = await tool.resolveExecution({
        action: "verify",
        path: testFile,
        language: "typescript",
        check_style: true,
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);
      expect(result.output).toContain("too long");
    });

    test("auto-detects language from extension", async () => {
      const testFile = join(testDir, "test.py");
      const content = "print('hello')\n";

      await Bun.write(testFile, content);

      const execution = await tool.resolveExecution({
        action: "verify",
        path: testFile,
        check_style: false,
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);
      expect(result.output).toContain("python");
    });

    test("verifies clean code successfully", async () => {
      const testFile = join(testDir, "clean.ts");
      const content = "const x = 1;\nconst y = 2;\n";

      await Bun.write(testFile, content);

      const execution = await tool.resolveExecution({
        action: "verify",
        path: testFile,
        language: "typescript",
        check_style: true,
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);
      expect(result.output).toContain("No issues");
    });
  });
});
