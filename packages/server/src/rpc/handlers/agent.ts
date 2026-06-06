import type { RPCServer, NotifyFn } from "../server.js";
import type { RPCHandlerDeps } from "../deps.js";
import type { StepEvent } from "../../core/types.js";
import { T800Agent, TerminatorAgent } from "../../electron/index.js";

export function registerAgentHandlers(
  server: RPCServer,
  deps: RPCHandlerDeps,
): void {
  server.register("agent.run", async (params, notify) => {
    return runStreaming(params, notify, deps, (task, mode) =>
      runAgentTask(task, mode, deps),
    );
  });

  server.register("agent.cancel", async () => {
    deps.agentLoop.cancel();
    return { cancelled: true };
  });

  server.register("agent.terminator", async (params, notify) => {
    const task = (params.task as string) ?? "";
    const mode = "terminator";

    return runStreaming(params, notify, deps, (task, mode) =>
      runAgentTask(task, mode, deps),
    );
  });

  server.register("agent.dispatch", async (params, notify) => {
    const task = (params.task as string) ?? "";
    const mode = params.mode as string ?? "kimi";

    return runStreaming(params, notify, deps, (task, mode) =>
      runAgentTask(task, mode, deps),
    );
  });
}

async function runAgentTask(
  task: string,
  mode: string | undefined,
  deps: RPCHandlerDeps,
): Promise<import("../../core/types.js").AgentResult> {
  // Route to appropriate agent based on mode
  const agentMode = mode === "terminator" ? "terminator" : "t800";

  if (agentMode === "terminator") {
    const agent = new TerminatorAgent({
      llmProvider: deps.llmProvider,
      memory: deps.memory,
      skillEngine: deps.skillEngine,
      skillSearch: deps.skillSearch,
      agentLoop: deps.agentLoop,
      toolBus: deps.agentLoop["toolBus"] ?? undefined,
      headless: deps.headless,
      workingDirectory: process.cwd(),
    });
    return agent.run(task);
  } else {
    const agent = new T800Agent({
      llmProvider: deps.llmProvider,
      memory: deps.memory,
      skillEngine: deps.skillEngine,
      skillSearch: deps.skillSearch,
      agentLoop: deps.agentLoop,
      toolBus: deps.agentLoop["toolBus"] ?? undefined,
      headless: deps.headless,
      workingDirectory: process.cwd(),
    });
    return agent.run(task);
  }
}

async function runStreaming(
  params: Record<string, unknown>,
  notify: NotifyFn | undefined,
  deps: RPCHandlerDeps,
  runFn: (task: string, mode?: string) => Promise<import("../../core/types.js").AgentResult>,
): Promise<import("../../core/types.js").AgentResult> {
  const task = (params.task as string) ?? "";
  const mode = params.mode as string | undefined;

  const origCallback = (deps.llmProvider as any)._tokenCallback;
  (deps.llmProvider as any)._tokenCallback = (tokens: number) => {
    notify?.("chat.streaming", { token: String(tokens), phase: "executing" });
  };

  notify?.("chat.progress", { phase: "planning", action: "run_start", detail: task });

  try {
    const result = await runFn(task, mode);

    for (let i = 0; i < result.steps.length; i++) {
      const step = result.steps[i];
      notify?.("chat.progress", {
        phase: step.phase,
        action: step.action,
        url: step.url,
        detail: step.detail,
        step: i,
      });
    }

    return result;
  } finally {
    (deps.llmProvider as any)._tokenCallback = origCallback;
  }
}
