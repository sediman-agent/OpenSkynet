import { existsSync, unlinkSync } from "node:fs";
import { createServer as createNetServer } from "node:net";

type RPCHandler = (params: Record<string, unknown>) => Promise<unknown>;

class MinimalRPCServer {
  private handlers = new Map<string, RPCHandler>();
  private startTime = Date.now();

  register(method: string, handler: RPCHandler): void {
    this.handlers.set(method, handler);
  }

  getUptimeSecs(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  async listen(socketPath: string): Promise<void> {
    if (existsSync(socketPath)) {
      try { unlinkSync(socketPath); } catch {}
    }

    const server = createNetServer((conn) => {
      let buffer = "";
      conn.on("data", (data) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          this.handleRequest(conn, line);
        }
      });
    });

    return new Promise((resolve, reject) => {
      server.listen(socketPath, () => resolve());
      server.on("error", reject);
    });
  }

  private async handleRequest(conn: import("node:net").Socket, raw: string): Promise<void> {
    let id: unknown = null;
    try {
      const msg = JSON.parse(raw);
      id = msg.id;
      const handler = this.handlers.get(msg.method);
      if (!handler) {
        conn.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } }) + "\n");
        return;
      }
      const result = await handler(msg.params ?? {});
      conn.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
    } catch (err) {
      conn.write(JSON.stringify({
        jsonrpc: "2.0",
        id,
        error: { code: -32603, message: (err as Error).message ?? "Internal error" },
      }) + "\n");
    }
  }
}

async function main() {
  const socketPath = process.env.SEDIMAN_RPC_SOCKET ?? "/tmp/sediman.sock";
  const server = new MinimalRPCServer();

  server.register("system.status", async () => ({
    running: true,
    uptime_secs: server.getUptimeSecs(),
    browser_open: false,
    tasks_completed: 0,
  }));

  server.register("model.list_providers", async () => {
    const { listProvidersWithAuth } = await import("./llm/provider.js");
    return { providers: await listProvidersWithAuth() };
  });

  server.register("model.list", async (params) => {
    const { listProvidersWithAuth } = await import("./llm/provider.js");
    const provider = params.provider as string | undefined;
    const providers = await listProvidersWithAuth();
    if (provider) {
      const p = providers.find((pr) => pr.name === provider);
      return { models: p ? [{ id: p.default_model, name: p.default_model, provider: p.name }] : [] };
    }
    return { models: providers.map((p) => ({ id: p.default_model, name: p.default_model, provider: p.name })) };
  });

  server.register("model.switch", async (params) => {
    const { createProvider } = await import("./llm/provider.js");
    const provider = params.provider as string;
    const model = params.model as string | undefined;
    const baseUrl = params.base_url as string | undefined;
    try {
      createProvider(provider, model, baseUrl);
      return { switched: true, provider, model: model ?? "default" };
    } catch (err) {
      return { switched: false, error: (err as Error).message };
    }
  });

  await server.listen(socketPath);

  const { setupLogging, createLogger } = await import("./core/logging.js");
  setupLogging();
  const logger = createLogger("rpc-fast");
  logger.info({ socket: socketPath }, "rpc_server_fast_started");

  const allHandlers: Record<string, (server: { register: (m: string, h: RPCHandler) => void }, deps: any) => void> = {};
  const handlerMods = await Promise.all([
    import("./rpc/handlers/browser.js"),
    import("./rpc/handlers/skills.js"),
    import("./rpc/handlers/hub.js"),
    import("./rpc/handlers/memory.js"),
    import("./rpc/handlers/sessions.js"),
    import("./rpc/handlers/schedule.js"),
    import("./rpc/handlers/auth.js"),
    // import("./rpc/handlers/terminal.js"), // Terminal handler removed
    import("./rpc/handlers/record.js"),
    // import("./rpc/handlers/integration.js"), // Integration handler removed
    import("./rpc/handlers/checkpoint.js"),
    import("./rpc/handlers/sandbox.js"),
    import("./rpc/handlers/project.js"),
  ]);

  const { getConfig } = await import("./core/config.js");
  const config = getConfig();
  const { FileMemoryStrategy } = await import("./memory/strategies/file-memory.js");
  const { SkillEngine } = await import("./skills/engine.js");
  const { HubClient } = await import("./skills/hub.js");
  const { GitHubInstaller } = await import("./skills/hub.js");
  const { SkillSearchEngine } = await import("./skills/search.js");
  const { CronManager } = await import("./scheduler/cron.js");
  const { Changelog } = await import("./memory/utils/changelog.js");
  const { CheckpointManager } = await import("./agent/memory/checkpoint.js");
  const { BrowserSession } = await import("./browser/session.js");
  const { BrowserController } = await import("./browser/controller.js");
  const { setGlobalBrowserSession } = await import("./browser/global-session.js");
  const { createProvider } = await import("./llm/provider.js");
  const { AgentLoop } = await import("./agent/loop.js");
  const { ProjectManager } = await import("./project/manager.js");
  const { setProjectManager } = await import("./agent/tools/browser-tools.js");
  const { sandboxSessionManager } = await import("./sandbox/SessionManager.js");

  const headless = (process.env.SEDIMAN_HEADLESS ?? "true") === "true";
  const memory = new FileMemoryStrategy();
  const skillEngine = new SkillEngine();
  const llmProvider = createProvider(
    process.env.SEDIMAN_PROVIDER ?? "openai",
    process.env.SEDIMAN_MODEL,
    process.env.SEDIMAN_BASE_URL,
    process.env.SEDIMAN_API_KEY,
  );

  const projectManager = new ProjectManager({
    llmProvider,
    memory,
    skillEngine,
    headless,
    terminalAllowed: false,
  });
  await projectManager.ensureDefaultProject();
  setProjectManager(projectManager);
  sandboxSessionManager.setProjectManager(projectManager);

  const browserSession = new BrowserSession({
    headless,
    stealth: config.stealthEnabled,
    proxy: config.stealthProxy || undefined,
    userDataDir: config.browserProfileDir,
  });

  // In Electron mode, prepare for CDP connection instead of launching Playwright
  if (process.env.SEDIMAN_MODE === 'electron') {
    browserSession.prepareForWebviewCDP();
    logger.info('[RPC] Browser session prepared for Electron embedded webview');
  }

  // Register globally for API access
  setGlobalBrowserSession(browserSession);
  const agentLoop = new AgentLoop({
    llmProvider,
    browserSession,
    memory,
    skillEngine,
    headless,
  });

  const deps = {
    llmProvider,
    browserSession,
    browserController: new BrowserController({
      headless,
      userDataDir: config.browserProfileDir,
    }),
    projectManager,
    memory,
    skillEngine,
    agentLoop,
    checkpointManager: new CheckpointManager(),
    cronManager: new CronManager(),
    hubClient: new HubClient(),
    gitHubInstaller: new GitHubInstaller(config.skillsDir),
    skillSearch: new SkillSearchEngine(skillEngine),
    changelog: new Changelog(),
    tasksCompleted: 0,
    terminalAllowed: false,
    headless,
    sandboxMode: process.env.SEDIMAN_SANDBOX ?? "off",
    activeRecording: null,
  };

  const fakeServer = {
    register: (method: string, handler: RPCHandler) => server.register(method, handler),
    handlers: new Map(),
    getUptimeSecs: () => server.getUptimeSecs(),
  };

  for (const mod of handlerMods) {
    const fn = Object.values(mod).find((v) => typeof v === "function") as ((s: any, d: any) => void) | undefined;
    if (fn) fn(fakeServer, deps);
  }

  memory.initialize().catch(() => {});

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting_down");
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  logger.info("rpc_server_full_ready");
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
