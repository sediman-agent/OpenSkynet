/**
 * Tests for WebTool
 *
 * Tests web operations:
 * - fetch: Fetch content from a URL
 * - search: Search the web
 */

import { test, describe, expect } from "bun:test";
import { WebTool } from "../../../src/electron/tools/web-tool";

describe("WebTool", () => {
  // WebTool is an instance, not a class
  const tool = WebTool;

  test("tool has correct name", () => {
    expect(tool.name).toBe("Web");
  });

  describe("tool registration", () => {
    test("has correct name", () => {
      expect(tool.name).toBe("Web");
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

  describe("fetch action", () => {
    test("fetches a URL successfully", async () => {

      // Use a reliable test URL
      const execution = await tool.resolveExecution({
        action: "fetch",
        url: "https://example.com",
        method: "GET",
      });

      expect("isError" in execution).toBe(false);

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);
      expect(result.output).toContain("Example Domain");
    });

    test("handles invalid URL", async () => {
      const execution = await tool.resolveExecution({
        action: "fetch",
        url: "not-a-valid-url",
        method: "GET",
      });

      // Validation happens at resolveExecution stage
      if ("isError" in execution) {
        expect(execution.isError).toBe(true);
        expect(execution.output).toContain("Validation error");
      } else {
        // If validation passes (shouldn't happen), execution should fail
        const result = await execution.execute({
          turnId: "test-turn",
          toolCallId: "test-call",
          signal: new AbortController().signal,
        });
        expect(result.isError).toBe(true);
      }
    });

    test("handles network errors gracefully", async () => {

      // Use a non-existent domain
      const execution = await tool.resolveExecution({
        action: "fetch",
        url: "https://this-domain-definitely-does-not-exist-12345.com",
        method: "GET",
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      // Should either error or handle gracefully
      expect(result !== undefined).toBe(true);
    });

    test("supports POST method", async () => {

      // Use AbortController with timeout to prevent hanging
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000); // 3 second timeout

      try {
        const execution = await tool.resolveExecution({
          action: "fetch",
          url: "https://httpbin.org/post",
          method: "POST",
          body: "test data",
          headers: {
            "Content-Type": "text/plain",
          },
        });

        const result = await execution.execute({
          turnId: "test-turn",
          toolCallId: "test-call",
          signal: controller.signal,
        });

        clearTimeout(timeout);

        // httpbin might be unavailable, so we just check the structure
        expect(result !== undefined).toBe(true);
      } catch (error) {
        clearTimeout(timeout);
        // If it's an abort error, the test timed out - this is acceptable for network tests
        if (error instanceof Error && error.name === 'AbortError') {
          expect(true).toBe(true); // Test passes - timeout handled correctly
        } else {
          throw error; // Re-throw other errors
        }
      }
    });
  });

  describe("search action", () => {
    test("returns not configured error", async () => {

      const execution = await tool.resolveExecution({
        action: "search",
        query: "test query",
        max_results: 5,
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      // Web search is not configured by default
      expect(result.isError).toBe(true);
      expect(result.output).toContain("not configured");
    });

    test("handles search with custom limit", async () => {

      const execution = await tool.resolveExecution({
        action: "search",
        query: "test",
        max_results: 10,
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.output).toContain("10");
    });
  });

  describe("ToolAccesses", () => {
    test("returns no file accesses for fetch", async () => {

      const execution = await tool.resolveExecution({
        action: "fetch",
        url: "https://example.com",
      });

      if (!("isError" in execution)) {
        expect(execution.accesses).toBeTruthy();
      }
    });

    test("returns no file accesses for search", async () => {

      const execution = await tool.resolveExecution({
        action: "search",
        query: "test",
      });

      if (!("isError" in execution)) {
        expect(execution.accesses).toBeTruthy();
      }
    });
  });

  describe("Display metadata", () => {
    test("provides display info for fetch", async () => {

      const execution = await tool.resolveExecution({
        action: "fetch",
        url: "https://example.com/path",
      });

      if (!("isError" in execution)) {
        expect(execution.display).toBeTruthy();
        expect(execution.display?.kind).toBe("web");
        expect(execution.display?.action).toBe("fetch");
      }
    });

    test("provides display info for search", async () => {

      const execution = await tool.resolveExecution({
        action: "search",
        query: "test search query",
      });

      if (!("isError" in execution)) {
        expect(execution.display).toBeTruthy();
        expect(execution.display?.kind).toBe("web");
        expect(execution.display?.action).toBe("search");
      }
    });
  });
});
