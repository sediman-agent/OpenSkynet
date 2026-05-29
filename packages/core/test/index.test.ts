import { describe, it, expect, beforeEach } from "bun:test";
import {
  DATA_DIR,
  PATHS,
  LIMITS,
  STEALTH,
  ensureDataDir,
} from "../src/config/index.js";
import {
  SedimanError,
  ToolError,
  BrowserError,
  LLMError,
  classifyError,
  looksLikeError,
} from "../src/errors/index.js";
import {
  AgentPhase,
  Strategy,
  type StepEvent,
  type PlanStep,
  type ToolResult,
} from "../src/types/index.js";
import { countTokens, estimateTokens } from "../src/llm/tokens.js";
import { generateId, slugify, truncate, sleep } from "../src/utils/index.js";

describe("config", () => {
  it("DATA_DIR resolves to a path", () => {
    expect(DATA_DIR).toBeTruthy();
    expect(DATA_DIR.length).toBeGreaterThan(0);
  });

  it("PATHS has all required keys", () => {
    expect(PATHS.skills).toBeTruthy();
    expect(PATHS.memory).toBeTruthy();
    expect(PATHS.sessions).toBeTruthy();
    expect(PATHS.cron).toBeTruthy();
    expect(PATHS.db).toBeTruthy();
  });

  it("LIMITS has sensible defaults", () => {
    expect(LIMITS.memory).toBeGreaterThan(0);
    expect(LIMITS.maxTaskLength).toBe(10_000);
    expect(LIMITS.skillStaleDays).toBe(30);
  });

  it("STEALTH defaults to enabled", () => {
    expect(STEALTH.enabled).toBe(true);
  });

  it("ensureDataDir does not throw", () => {
    expect(() => ensureDataDir()).not.toThrow();
  });
});

describe("errors", () => {
  it("SedimanError has code and message", () => {
    const err = new SedimanError("test", "TEST_CODE");
    expect(err.message).toBe("test");
    expect(err.code).toBe("TEST_CODE");
    expect(err).toBeInstanceOf(Error);
  });

  it("ToolError inherits from SedimanError", () => {
    const err = new ToolError("tool failed");
    expect(err).toBeInstanceOf(SedimanError);
    expect(err.name).toBe("ToolError");
  });

  it("BrowserError inherits from SedimanError", () => {
    const err = new BrowserError("browser crashed");
    expect(err).toBeInstanceOf(SedimanError);
  });

  it("LLMError inherits from SedimanError", () => {
    const err = new LLMError("api key invalid");
    expect(err).toBeInstanceOf(SedimanError);
  });

  it("classifyError handles SedimanError", () => {
    const info = classifyError(new LLMError("timeout"));
    expect(info.type).toBe("LLMError");
    expect(info.suggestion).toBeTruthy();
  });

  it("classifyError handles plain Error", () => {
    const info = classifyError(new Error("oops"));
    expect(info.type).toBe("UnknownError");
  });

  it("classifyError handles non-Error", () => {
    const info = classifyError("string error");
    expect(info.type).toBe("UnknownError");
  });

  it("looksLikeError detects errors", () => {
    expect(looksLikeError("Error: something failed")).toBe(true);
    expect(looksLikeError("Task completed successfully")).toBe(false);
    expect(looksLikeError("Connection timed out")).toBe(true);
  });
});

describe("types", () => {
  it("AgentPhase enum values", () => {
    expect(AgentPhase.Planning).toBe("planning");
    expect(AgentPhase.Done).toBe("done");
    expect(AgentPhase.Failed).toBe("failed");
  });

  it("Strategy enum values", () => {
    expect(Strategy.Direct).toBe("direct");
    expect(Strategy.UseSkill).toBe("use_skill");
    expect(Strategy.Delegate).toBe("delegate");
  });

  it("StepEvent interface works", () => {
    const step: StepEvent = {
      action: "click",
      observation: "button clicked",
      phase: "executing",
    };
    expect(step.action).toBe("click");
  });

  it("PlanStep interface works", () => {
    const plan: PlanStep = {
      id: "1",
      description: "Check stock price",
      strategy: Strategy.Direct,
      status: "pending",
      retries: 0,
      fallbackAttempted: false,
    };
    expect(plan.strategy).toBe(Strategy.Direct);
  });

  it("ToolResult interface works", () => {
    const result: ToolResult = {
      success: true,
      output: "done",
    };
    expect(result.success).toBe(true);
  });
});

describe("llm/tokens", () => {
  it("countTokens returns rough estimate", () => {
    expect(countTokens("hello world")).toBe(3);
    expect(countTokens("")).toBe(0);
  });

  it("estimateTokens sums message tokens", () => {
    const tokens = estimateTokens([
      { content: "hello" },
      { content: "world" },
    ]);
    expect(tokens).toBeGreaterThan(0);
  });
});

describe("utils", () => {
  it("generateId returns unique strings", () => {
    const a = generateId();
    const b = generateId();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it("slugify normalizes text", () => {
    expect(slugify("Hello World!")).toBe("hello-world");
    expect(slugify("  foo bar  ")).toBe("foo-bar");
  });

  it("truncate shortens long text", () => {
    expect(truncate("hello", 10)).toBe("hello");
    expect(truncate("hello world", 8)).toBe("hello...");
  });

  it("sleep resolves", async () => {
    const start = Date.now();
    await sleep(10);
    expect(Date.now() - start).toBeGreaterThanOrEqual(9);
  });
});
