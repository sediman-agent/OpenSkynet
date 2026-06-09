import { createBunWebSocket } from "hono/bun";
import type { WSContext } from "hono/ws";
import { createApiApp } from "./app";
import type { ApiDeps } from "./app";
import { createWSApp } from "./ws-app";
import type { WSDeps } from "./ws-app";
import { getConfig } from "../core/config";
import logger from "../core/logging";
import type { RPCHandlerDeps } from "../rpc/deps";

export type { ApiDeps } from "./app";

const { upgradeWebSocket, websocket } = createBunWebSocket();

export { upgradeWebSocket };

export interface ApiServerOptions {
  port?: number;
  deps: ApiDeps;
  rpcDeps?: RPCHandlerDeps;
}

export function startApiServer(opts: ApiServerOptions) {
  getConfig();
  const port = opts.port ?? parseInt(process.env.SEDIMAN_API_PORT ?? "3001", 10);

  const wsDeps: WSDeps = { ...opts.deps, rpcDeps: opts.rpcDeps };

  const app = createApiApp(opts.deps);
  const wsApp = createWSApp(wsDeps, upgradeWebSocket);

  app.route("/", wsApp);

  const server = Bun.serve({
    port,
    fetch: app.fetch,
    websocket,
    idleTimeout: 255, // Maximum allowed - allow browser agents time to complete
  });

  logger.info({ port }, "api_server_started");
  return server;
}
