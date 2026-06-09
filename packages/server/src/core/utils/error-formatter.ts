/**
 * Tool Error Formatter Utility
 * Provides consistent error message formatting across browser tools
 */

export interface ErrorFormatterOptions {
  includePrefix?: boolean;
  includeAction?: boolean;
  maxLength?: number;
}

export class ToolErrorFormatter {
  private static readonly DEFAULT_MAX_LENGTH = 200;

  /**
   * Format a standard tool execution error
   */
  static format(action: string, error: unknown, options?: ErrorFormatterOptions): string {
    const message = this.extractErrorMessage(error);
    const opts = { includePrefix: true, includeAction: true, ...options };

    if (opts.includePrefix && opts.includeAction) {
      return `Failed to ${action}: ${message}`;
    } else if (opts.includeAction) {
      return `${action} failed: ${message}`;
    } else {
      return message;
    }
  }

  /**
   * Format a timeout error
   */
  static timeout(action: string, timeoutMs: number): string {
    return `Tool execution timeout: ${action} exceeded ${timeoutMs}ms`;
  }

  /**
   * Format a "not found" error for elements
   */
  static notFound(refId: number, elementType: string = 'element'): string {
    return `${elementType} with refId ${refId} not found`;
  }

  /**
   * Format a navigation error
   */
  static navigationError(url: string, error: unknown): string {
    const message = this.extractErrorMessage(error);
    return `Failed to navigate to ${url}: ${message}`;
  }

  /**
   * Format a browser context error
   */
  static browserContextError(operation: string): string {
    return `Browser context not available for: ${operation}`;
  }

  /**
   * Format a validation error
   */
  static validationError(field: string, reason: string): string {
    return `Validation failed for ${field}: ${reason}`;
  }

  /**
   * Format a script execution error
   */
  static scriptExecutionError(error: unknown): string {
    const message = this.extractErrorMessage(error);
    return `Script execution failed: ${message}`;
  }

  /**
   * Format a file operation error
   */
  static fileOperationError(operation: string, filePath: string, error: unknown): string {
    const message = this.extractErrorMessage(error);
    return `${operation} failed for "${filePath}": ${message}`;
  }

  /**
   * Extract error message from unknown error type
   */
  private static extractErrorMessage(error: unknown): string {
    if (typeof error === 'string') {
      return error;
    } else if (error instanceof Error) {
      return error.message;
    } else {
      return String(error);
    }
  }

  /**
   * Truncate error message to max length
   */
  static truncate(message: string, maxLength: number = ToolErrorFormatter.DEFAULT_MAX_LENGTH): string {
    if (message.length <= maxLength) return message;
    return message.slice(0, maxLength - 3) + '...';
  }

  /**
   * Format multiple errors (for batch operations)
   */
  static formatBatchErrors(action: string, errors: Array<{ index: number; error: unknown }>): string {
    const formatted = errors.map(({ index, error }) =>
      `  [${index}] ${this.extractErrorMessage(error)}`
    ).join('\n');

    return `${action} completed with ${errors.length} error(s):\n${formatted}`;
  }

  /**
   * Create a retry suggestion message
   */
  static retrySuggestion(action: string, attempt: number, maxAttempts: number): string {
    const remaining = maxAttempts - attempt;
    if (remaining > 0) {
      return `Retrying ${action}... (${remaining} attempt${remaining > 1 ? 's' : ''} remaining)`;
    }
    return `Max retry attempts reached for ${action}`;
  }

  /**
   * Format a generic "something went wrong" error with context
   */
  static genericError(context: string, error?: unknown): string {
    const base = `An error occurred while ${context}`;
    if (error) {
      return `${base}: ${this.extractErrorMessage(error)}`;
    }
    return base;
  }
}

/**
 * Convenience function for quick error formatting
 */
export function formatToolError(action: string, error: unknown): string {
  return ToolErrorFormatter.format(action, error);
}

/**
 * Convenience function for timeout errors
 */
export function formatTimeoutError(action: string, timeoutMs: number): string {
  return ToolErrorFormatter.timeout(action, timeoutMs);
}

/**
 * Convenience function for not found errors
 */
export function formatNotFoundError(refId: number, elementType?: string): string {
  return ToolErrorFormatter.notFound(refId, elementType);
}
