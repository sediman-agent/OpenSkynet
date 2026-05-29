import pino from "pino";

export const logger = pino({
  level: process.env.SEDIMAN_LOG_LEVEL ?? "info",
  transport:
    process.env.SEDIMAN_LOG_FORMAT === "json"
      ? undefined
      : { target: "pino/file", options: { destination: 2 } },
});

export function createLogger(name: string) {
  return logger.child({ module: name });
}
