import { setupLogging, createLogger } from "./core/logging";
import { addLog } from "./api/routes/logs";
import { cleanupBrowserTools } from "./agent/tools/browser-tools";
import { closeDb } from "./store/db";
import { createRPCServer } from "./rpc";
import { startApiServer } from "./api";
import { buildServerDeps, toRpcDeps, toApiDeps } from "./cli/deps";
import type { RPCHandlerDeps } from "./rpc/deps";

// Production reliability imports
import { getConfigManager } from "./core/production-config";
import { getHealthCheckSystem } from "./core/health-check";
import { getGracefulShutdown } from "./core/graceful-shutdown";
import { initDatabaseReliability } from "./store/db-reliability";
import { getErrorHandler } from "./core/error-handler";

function parseMode(argv: string[]): "rpc" | "api" | "all" {
  const idx = argv.indexOf("--mode");
  if (idx !== -1 && idx + 1 < argv.length) {
    const mode = argv[idx + 1];
    if (mode === "rpc" || mode === "api") return mode;
  }
  return "all";
}

async function main() {
  const mode = parseMode(process.argv);

  // Initialize production configuration
  const configManager = getConfigManager();
  const config = configManager.getEnvironmentConfig();

  // Setup logging with production config
  setupLogging();
  const logger = createLogger("server");

  // Check production readiness
  const productionCheck = configManager.isProductionReady();
  if (!productionCheck.ready) {
    logger.error("Configuration issues: " + productionCheck.issues.join(", "));
  }
  if (productionCheck.warnings.length > 0) {
    logger.warn("Configuration warnings: " + productionCheck.warnings.join(", "));
  }

  addLog("info", `Server starting in ${config.environment} environment (${mode} mode)`, "system");

  // Initialize error handling
  const errorHandler = getErrorHandler();

  // Initialize database reliability
  try {
    await initDatabaseReliability();
    logger.info("Database reliability initialized");
  } catch (error) {
    logger.error("Failed to initialize database reliability: " + (error as Error).message);
  }

  // Initialize health check system
  const healthSystem = getHealthCheckSystem();
  healthSystem.startPeriodicChecks(60000); // Check every minute

  // Build dependencies
  const deps = await buildServerDeps();

  if (mode === "rpc") {
    const rpcDeps = toRpcDeps(deps);
    const rpcServer = createRPCServer(rpcDeps);
    const rpcSocket = process.env.SEDIMAN_RPC_SOCKET ?? "/tmp/sediman.sock";
    await rpcServer.listen(rpcSocket);
    addLog("info", `RPC server listening on ${rpcSocket}`, "system");
    logger.info({ mode: "rpc", socket: rpcSocket }, "server_started");

    deps.memory.initialize().catch(() => {});

    // Setup production graceful shutdown
    const gracefulShutdown = getGracefulShutdown({
      saveState: true,
      createBackup: config.environment === 'production',
      timeout: 30000,
      forceTimeout: 60000
    });

    // Override default signal handlers
    const signals: Array<NodeJS.Signals> = ["SIGINT", "SIGTERM"];
    for (const signal of signals) {
      process.removeAllListeners(signal);
    }

    process.on("SIGINT", () => gracefulShutdown.shutdown("SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown.shutdown("SIGTERM"));

    logger.info({ mode: "rpc" }, "sediman_server_ready");
    return;
  }

  const rpcDeps: RPCHandlerDeps = toRpcDeps(deps);
  const apiDeps = toApiDeps(deps);

  const servers: { stop: () => Promise<void> }[] = [];

  if (mode === "all") {
    const rpcServer = createRPCServer(rpcDeps);
    const rpcSocket = process.env.SEDIMAN_RPC_SOCKET ?? "/tmp/sediman.sock";
    await rpcServer.listen(rpcSocket);
    servers.push(rpcServer);
    addLog("info", `RPC server listening on ${rpcSocket}`, "system");
    logger.info({ mode: "rpc", socket: rpcSocket }, "server_started");
  }

  if (mode === "api" || mode === "all") {
    const apiServer = startApiServer({ deps: apiDeps, rpcDeps });
    servers.push({ stop: async () => apiServer.stop() });
    addLog("info", "API server started", "system");
    logger.info({ mode: "api" }, "server_started");
  }

  // Setup production graceful shutdown
  const gracefulShutdown = getGracefulShutdown({
    saveState: true,
    createBackup: config.environment === 'production',
    timeout: 30000,
    forceTimeout: 60000
  });

  // Register server cleanup handlers
  for (let i = 0; i < servers.length; i++) {
    gracefulShutdown.registerHandler(`server_${i}_cleanup`, async () => {
      await servers[i].stop();
    });
  }

  // Override default signal handlers
  const signals: Array<NodeJS.Signals> = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.removeAllListeners(signal);
  }

  process.on("SIGINT", () => gracefulShutdown.shutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown.shutdown("SIGTERM"));

  logger.info({ mode, environment: config.environment }, "sediman_server_ready");
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});

export { getConfig } from "./core/config";
export type { Config } from "./core/config";
export { getDb, initDb, closeDb } from "./store/db";
