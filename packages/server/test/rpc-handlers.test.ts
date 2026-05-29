import { describe, it, expect, beforeEach } from "bun:test";
import { handlers, resetState } from "../src/rpc-handlers.js";

describe("rpc-handlers", () => {

  beforeEach(() => {
    resetState();
  });

  // ── Skills (pure TS, no Python needed) ──────────────────────────
  it("skills.list returns an array", async () => {
    const result = await handlers["skills.list"]({}) as { skills: unknown[] };
    expect(Array.isArray(result.skills)).toBe(true);
  });

  it("skills.get returns skill or null", async () => {
    const result = await handlers["skills.get"]({ name: "test-skill" });
    expect(result).toBeTruthy();
    if (result) {
      const r = result as Record<string, unknown>;
      expect(typeof r.name).toBe("string");
    }
  });

  it("skills.delete returns deleted name", async () => {
    const result = await handlers["skills.delete"]({ name: "nonexistent-test" }) as { deleted: string };
    expect(result.deleted).toBe("");
  });

  // ── System (native TS) ──────────────────────────────────────────
  it("system.status returns TS-native status", async () => {
    const result = await handlers["system.status"]({}) as Record<string, unknown>;
    expect(result.browser_open).toBe(false);
    expect(result).toHaveProperty("scheduler");
    expect(result).toHaveProperty("provider");
    expect(result).toHaveProperty("model");
  });

  it("system.status reflects in-memory provider state", async () => {
    await handlers["model.switch"]({ provider: "ollama", model: "llama3" });
    const result = await handlers["system.status"]({}) as Record<string, unknown>;
    expect(result.provider).toBe("ollama");
    expect(result.model).toBe("llama3");
  });

  it("system.doctor returns checks object", async () => {
    const result = await handlers["system.doctor"]({}) as { checks: Record<string, unknown> };
    expect(result.checks).toBeDefined();
    expect(typeof result.checks.google_chrome !== undefined).toBe(true);
  });

  it("system.btw fails without API key", async () => {
    const key = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      await handlers["system.btw"]({ question: "hello" });
      expect.unreachable("should have thrown");
    } catch (e: unknown) {
      expect((e as Error).message).toContain("OPENAI_API_KEY");
    }
    if (key) process.env.OPENAI_API_KEY = key;
  });

  it("system.btw rejects empty question", async () => {
    const result = await handlers["system.btw"]({ question: "" }) as { answer: string };
    expect(result.answer).toBe("");
  });

  it("system.screenshot fails gracefully without Python", async () => {
    try {
      await handlers["system.screenshot"]({});
    } catch (e: unknown) {
      expect((e as Error).message).toContain("socket");
    }
  });

  // ── Agent ───────────────────────────────────────────────────────
  it("agent.run fails gracefully without Python", async () => {
    try {
      await handlers["agent.run"]({ task: "test" });
    } catch (e: unknown) {
      expect((e as Error).message).toContain("socket");
    }
  });

  it("agent.run rejects empty task", async () => {
    try {
      await handlers["agent.run"]({ task: "" });
      expect.unreachable("should have thrown");
    } catch (e: unknown) {
      expect((e as Error).message).toContain("task is required");
    }
  });

  // ── Model (native TS) ───────────────────────────────────────────
  it("model.list_providers returns providers", async () => {
    const result = await handlers["model.list_providers"]({}) as { providers: unknown[] };
    expect(Array.isArray(result.providers)).toBe(true);
    expect(result.providers.length).toBe(2);
    expect((result.providers[0] as Record<string, unknown>).name).toBe("openai");
  });

  it("model.switch updates provider and model", async () => {
    const result = await handlers["model.switch"]({ provider: "ollama", model: "llama3" }) as Record<string, unknown>;
    expect(result.provider).toBe("ollama");
    expect(result.model).toBe("llama3");
  });

  it("model.switch rejects empty provider", async () => {
    try {
      await handlers["model.switch"]({ provider: "" });
      expect.unreachable("should have thrown");
    } catch (e: unknown) {
      expect((e as Error).message).toContain("provider");
    }
  });

  // ── Terminal (native TS) ────────────────────────────────────────
  it("terminal.status returns false by default", async () => {
    const result = await handlers["terminal.status"]({}) as { allowed: boolean };
    expect(result.allowed).toBe(false);
  });

  it("terminal.set enables and disables", async () => {
    await handlers["terminal.set"]({ allowed: true });
    const on = await handlers["terminal.status"]({}) as { allowed: boolean };
    expect(on.allowed).toBe(true);

    await handlers["terminal.set"]({ allowed: false });
    const off = await handlers["terminal.status"]({}) as { allowed: boolean };
    expect(off.allowed).toBe(false);
  });

  // ── Schedule (pure TS) ──────────────────────────────────────────
  it("schedule.list returns an array", async () => {
    const result = await handlers["schedule.list"]({}) as { jobs: unknown[] };
    expect(Array.isArray(result.jobs)).toBe(true);
  });

  // ── Memory (pure TS) ────────────────────────────────────────────
  it("memory.get returns entries and usage", async () => {
    const result = await handlers["memory.get"]({}) as Record<string, unknown>;
    expect(result).toHaveProperty("entries");
    expect(result).toHaveProperty("usage");
  });

  // ── Sessions (pure TS) ──────────────────────────────────────────
  it("sessions.list returns an array", async () => {
    const result = await handlers["sessions.list"]({}) as { sessions: unknown[] };
    expect(Array.isArray(result.sessions)).toBe(true);
  });

  // ── Hub (pure TS, uses fetch) ───────────────────────────────────
  it("hub.browse returns array of skills (may be empty)", async () => {
    const result = await handlers["hub.browse"]({}) as { skills: unknown[] };
    expect(Array.isArray(result.skills)).toBe(true);
  });

  // ── Unknown method ──────────────────────────────────────────────
  it("throws for unknown methods (via handler map absence)", () => {
    expect(handlers["__no_such_method__"]).toBeUndefined();
  });

  // ── Method enumeration ──────────────────────────────────────────
  it("has all expected method handlers", () => {
    const expected = [
      "system.status", "system.screenshot", "system.btw", "system.doctor",
      "agent.run", "agent.cancel",
      "skills.list", "skills.get", "skills.run", "skills.delete",
      "hub.browse", "hub.search", "hub.info", "hub.install",
      "schedule.list", "schedule.add", "schedule.remove",
      "memory.get", "memory.add",
      "sessions.list",
      "model.switch", "model.list_providers",
      "terminal.set", "terminal.status",
      "record.start", "record.stop", "record.active",
    ];
    for (const m of expected) {
      expect(handlers[m]).toBeDefined();
    }
    expect(Object.keys(handlers).length).toBe(expected.length);
  });
});
