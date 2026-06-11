/**
 * Production Error Handler
 * Industrial-grade error handling with recovery, classification, and monitoring
 */

import { createLogger } from './logging';

const logger = createLogger('ErrorHandler');

export enum ErrorCategory {
  NETWORK = 'network',
  DATABASE = 'database',
  BROWSER = 'browser',
  LLM = 'llm',
  VALIDATION = 'validation',
  TIMEOUT = 'timeout',
  MEMORY = 'memory',
  PERMISSION = 'permission',
  UNKNOWN = 'unknown'
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ErrorClassification {
  category: ErrorCategory;
  severity: ErrorSeverity;
  retryable: boolean;
  userMessage: string;
  technicalMessage: string;
  suggestedActions: string[];
}

export class ErrorHandler {
  private errorCounts = new Map<string, number>();
  private errorHistory: Array<{
    error: Error;
    classification: ErrorClassification;
    timestamp: number;
    context?: Record<string, any>;
  }> = [];
  private maxHistorySize = 1000;

  /**
   * Classify error into category and severity
   */
  classifyError(error: Error, context?: Record<string, any>): ErrorClassification {
    const message = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() || '';

    // Network errors
    if (message.includes('network') || message.includes('econnrefused') ||
        message.includes('etimedout') || message.includes('connection')) {
      return {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        retryable: true,
        userMessage: 'Network connection issue. Please check your internet connection.',
        technicalMessage: `Network error: ${error.message}`,
        suggestedActions: ['Check internet connection', 'Try again', 'Check firewall settings']
      };
    }

    // Database errors
    if (message.includes('database') || message.includes('sqlite') ||
        message.includes('db') || stack.includes('knex') || stack.includes('sqlite')) {
      return {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.HIGH,
        retryable: true,
        userMessage: 'Database connection issue. The system will retry automatically.',
        technicalMessage: `Database error: ${error.message}`,
        suggestedActions: ['Check database connectivity', 'Verify database credentials', 'Check disk space']
      };
    }

    // Browser errors
    if (message.includes('browser') || message.includes('playwright') ||
        message.includes('chromium') || message.includes('page')) {
      return {
        category: ErrorCategory.BROWSER,
        severity: ErrorSeverity.MEDIUM,
        retryable: true,
        userMessage: 'Browser automation issue. The system will retry the operation.',
        technicalMessage: `Browser error: ${error.message}`,
        suggestedActions: ['Restart browser session', 'Check system resources', 'Try a simpler operation']
      };
    }

    // LLM errors
    if (message.includes('api') && message.includes('key') ||
        message.includes('openai') || message.includes('anthropic') ||
        message.includes('rate limit') || message.includes('quota')) {
      return {
        category: ErrorCategory.LLM,
        severity: ErrorSeverity.HIGH,
        retryable: message.includes('rate limit'),
        userMessage: 'AI service connection issue. Please check your API key and quota.',
        technicalMessage: `LLM error: ${error.message}`,
        suggestedActions: ['Check API key validity', 'Verify API quota', 'Try a different model']
      };
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('timed out')) {
      return {
        category: ErrorCategory.TIMEOUT,
        severity: ErrorSeverity.MEDIUM,
        retryable: true,
        userMessage: 'Operation timed out. The system will retry with a longer timeout.',
        technicalMessage: `Timeout error: ${error.message}`,
        suggestedActions: ['Increase timeout duration', 'Check system performance', 'Simplify the operation']
      };
    }

    // Memory errors
    if (message.includes('memory') || message.includes('heap') ||
        message.includes('allocation')) {
      return {
        category: ErrorCategory.MEMORY,
        severity: ErrorSeverity.CRITICAL,
        retryable: false,
        userMessage: 'System memory issue. Please try with a smaller task or restart the application.',
        technicalMessage: `Memory error: ${error.message}`,
        suggestedActions: ['Free up system memory', 'Use smaller context', 'Restart application']
      };
    }

    // Permission errors
    if (message.includes('permission') || message.includes('access denied') ||
        message.includes('unauthorized')) {
      return {
        category: ErrorCategory.PERMISSION,
        severity: ErrorSeverity.HIGH,
        retryable: false,
        userMessage: 'Permission denied. Please check your access rights.',
        technicalMessage: `Permission error: ${error.message}`,
        suggestedActions: ['Check user permissions', 'Verify authentication', 'Contact administrator']
      };
    }

    // Default classification
    return {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      retryable: true,
      userMessage: 'An unexpected error occurred. The system will attempt to recover.',
      technicalMessage: `Unknown error: ${error.message}`,
      suggestedActions: ['Try the operation again', 'Check system logs', 'Contact support if issue persists']
    };
  }

  /**
   * Handle error with recovery strategy
   */
  async handleError(error: Error, context?: Record<string, any>): Promise<{
    handled: boolean;
    action: string;
    shouldRetry: boolean;
    retryDelay?: number;
  }> {
    const classification = this.classifyError(error, context);

    // Track error
    this.trackError(error, classification, context);

    // Log error based on severity
    switch (classification.severity) {
      case ErrorSeverity.CRITICAL:
        logger.error('[CRITICAL] ' + classification.technicalMessage + ' - Error: ' + error.message);
        break;
      case ErrorSeverity.HIGH:
        logger.error('[HIGH] ' + classification.technicalMessage + ' - Error: ' + error.message);
        break;
      case ErrorSeverity.MEDIUM:
        logger.warn('[MEDIUM] ' + classification.technicalMessage + ' - Error: ' + error.message);
        break;
      default:
        logger.info('[LOW] ' + classification.technicalMessage + ' - Error: ' + error.message);
    }

    // Determine recovery strategy
    if (classification.retryable) {
      const retryDelay = this.calculateRetryDelay(classification);
      return {
        handled: true,
        action: 'retry',
        shouldRetry: true,
        retryDelay
      };
    }

    if (classification.category === ErrorCategory.MEMORY) {
      return {
        handled: true,
        action: 'cleanup_and_retry',
        shouldRetry: true,
        retryDelay: 5000
      };
    }

    if (classification.category === ErrorCategory.BROWSER) {
      return {
        handled: true,
        action: 'restart_browser',
        shouldRetry: true,
        retryDelay: 10000
      };
    }

    return {
      handled: false,
      action: 'fail',
      shouldRetry: false
    };
  }

  /**
   * Calculate retry delay based on error classification
   */
  private calculateRetryDelay(classification: ErrorClassification): number {
    switch (classification.category) {
      case ErrorCategory.NETWORK:
        return 2000; // 2 seconds
      case ErrorCategory.DATABASE:
        return 5000; // 5 seconds
      case ErrorCategory.BROWSER:
        return 10000; // 10 seconds
      case ErrorCategory.TIMEOUT:
        return 3000; // 3 seconds
      case ErrorCategory.LLM:
        return 15000; // 15 seconds
      default:
        return 1000; // 1 second
    }
  }

  /**
   * Track error for monitoring
   */
  private trackError(error: Error, classification: ErrorClassification, context?: Record<string, any>): void {
    const errorKey = `${classification.category}:${error.message}`;
    this.errorCounts.set(errorKey, (this.errorCounts.get(errorKey) || 0) + 1);

    // Add to history
    this.errorHistory.push({
      error,
      classification,
      timestamp: Date.now(),
      context
    });

    // Keep history size manageable
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }

    // Check for error patterns
    this.checkErrorPatterns(errorKey);
  }

  /**
   * Check for concerning error patterns
   */
  private checkErrorPatterns(errorKey: string): void {
    const count = this.errorCounts.get(errorKey) || 0;

    if (count > 10) {
      logger.error(`[ErrorHandler] High error count detected: ${errorKey} (${count} occurrences)`);
    }

    if (count > 50) {
      logger.error(`[ErrorHandler] CRITICAL: Error threshold exceeded: ${errorKey} (${count} occurrences)`);
      // Could trigger alerts here
    }
  }

  /**
   * Get error statistics
   */
  getErrorStatistics(): {
    totalErrors: number;
    topErrors: Array<{ error: string; count: number; category: string }>;
    recentErrors: Array<{ message: string; category: string; severity: string; timestamp: number }>;
  } {
    const totalErrors = Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0);

    const topErrors = Array.from(this.errorCounts.entries())
      .map(([error, count]) => {
        const [category, message] = error.split(':');
        return { error: message, count, category };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const recentErrors = this.errorHistory.slice(-50).map(entry => ({
      message: entry.error.message,
      category: entry.classification.category,
      severity: entry.classification.severity,
      timestamp: entry.timestamp
    }));

    return {
      totalErrors,
      topErrors,
      recentErrors
    };
  }

  /**
   * Get user-friendly error response
   */
  getUserErrorResponse(error: Error): {
    message: string;
    suggestions: string[];
    canRetry: boolean;
    technicalDetails?: string;
  } {
    const classification = this.classifyError(error);

    return {
      message: classification.userMessage,
      suggestions: classification.suggestedActions,
      canRetry: classification.retryable,
      technicalDetails: process.env.NODE_ENV === 'development' ? classification.technicalMessage : undefined
    };
  }

  /**
   * Create error with context
   */
  createError(message: string, context?: Record<string, any>): Error {
    const error = new Error(message);
    (error as any).context = context;
    return error;
  }

  /**
   * Wrap error with additional context
   */
  wrapError(error: Error, message: string, context?: Record<string, any>): Error {
    const wrappedError = new Error(`${message}: ${error.message}`);
    wrappedError.stack = error.stack;
    (wrappedError as any).context = { ...context, originalError: error };
    (wrappedError as any).cause = error;
    return wrappedError;
  }

  /**
   * Reset error tracking
   */
  reset(): void {
    this.errorCounts.clear();
    this.errorHistory = [];
    logger.info('[ErrorHandler] Error tracking reset');
  }
}

// Global error handler instance
let globalErrorHandler: ErrorHandler | null = null;

/**
 * Get the global error handler
 */
export function getErrorHandler(): ErrorHandler {
  if (!globalErrorHandler) {
    globalErrorHandler = new ErrorHandler();
  }
  return globalErrorHandler;
}

/**
 * Handle error with recovery strategy
 */
export async function handleError(error: Error, context?: Record<string, any>): Promise<{
  handled: boolean;
  action: string;
  shouldRetry: boolean;
  retryDelay?: number;
}> {
  return getErrorHandler().handleError(error, context);
}

/**
 * Reset error handler
 */
export function resetErrorHandler(): void {
  globalErrorHandler = null;
}
