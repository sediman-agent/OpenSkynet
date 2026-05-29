export class SedimanError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "SedimanError";
  }
}

export class ToolError extends SedimanError {
  constructor(message: string, code = "TOOL_ERROR") {
    super(message, code);
    this.name = "ToolError";
  }
}

export class BrowserError extends SedimanError {
  constructor(message: string, code = "BROWSER_ERROR") {
    super(message, code);
    this.name = "BrowserError";
  }
}

export class LLMError extends SedimanError {
  constructor(message: string, code = "LLM_ERROR") {
    super(message, code);
    this.name = "LLMError";
  }
}

export class AuthError extends SedimanError {
  constructor(message: string, code = "AUTH_ERROR") {
    super(message, code);
    this.name = "AuthError";
  }
}

export class RateLimitError extends SedimanError {
  constructor(message: string, code = "RATE_LIMIT") {
    super(message, code);
    this.name = "RateLimitError";
  }
}

export class SkillError extends SedimanError {
  constructor(message: string, code = "SKILL_ERROR") {
    super(message, code);
    this.name = "SkillError";
  }
}

export class MemoryError extends SedimanError {
  constructor(message: string, code = "MEMORY_ERROR") {
    super(message, code);
    this.name = "MemoryError";
  }
}

export class ConfigError extends SedimanError {
  constructor(message: string, code = "CONFIG_ERROR") {
    super(message, code);
    this.name = "ConfigError";
  }
}

export interface ErrorInfo {
  type: string;
  code: string;
  message: string;
  suggestion: string;
}

export function classifyError(err: unknown): ErrorInfo {
  if (err instanceof SedimanError) {
    return {
      type: err.name,
      code: err.code,
      message: err.message,
      suggestion: getSuggestion(err.code),
    };
  }
  if (err instanceof Error) {
    return {
      type: "UnknownError",
      code: "UNKNOWN",
      message: err.message,
      suggestion: "Check the error message and try again.",
    };
  }
  return {
    type: "UnknownError",
    code: "UNKNOWN",
    message: String(err),
    suggestion: "An unexpected error occurred.",
  };
}

function getSuggestion(code: string): string {
  const map: Record<string, string> = {
    BROWSER_ERROR: "Try restarting the browser or running in headed mode.",
    LLM_ERROR: "Check your API key and model configuration.",
    AUTH_ERROR: "Verify your credentials are correct.",
    RATE_LIMIT: "Wait a moment and retry. Consider upgrading your plan.",
    SKILL_ERROR: "Try re-recording the skill or healing it.",
    MEMORY_ERROR: "Check memory limits in your configuration.",
    CONFIG_ERROR: "Review your environment variables and config.",
  };
  return map[code] ?? "Try again or check the logs for details.";
}

export function looksLikeError(text: string): boolean {
  const patterns = [
    /error:/i,
    /failed:/i,
    /exception/i,
    /traceback/i,
    /cannot/i,
    /unable to/i,
    /timed? ?out/i,
    /not found/i,
    /denied/i,
    /forbidden/i,
    /unavailable/i,
  ];
  return patterns.some((p) => p.test(text));
}
