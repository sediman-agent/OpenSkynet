/**
 * Optimized Browser Automation Components
 *
 * This module provides optimized browser automation components designed to be
 * way better than browser-use through:
 *
 * 1. **Resilience**: Circuit breakers, retry logic with exponential backoff, adaptive throttling
 * 2. **Performance**: Multi-level caching, element caching, parallel execution, connection pooling
 * 3. **Monitoring**: Performance tracking, operation metrics, health checks
 * 4. **Reliability**: Timeout protection, health checks, automatic recovery
 *
 * @example Basic usage
 * ```typescript
 * import { createOptimizedBrowserController } from './browser/optimized';
 *
 * const controller = createOptimizedBrowserController({
 *   headless: true,
 *   enableRetry: true,
 *   enableCircuitBreaker: true,
 *   enablePerformanceMonitoring: true
 * });
 *
 * await controller.start();
 * await controller.navigate('https://example.com');
 * await controller.click(1);
 * await controller.stop();
 * ```
 */

// Core components
export { OptimizedBrowserSession } from '../optimized-session.js';
export { OptimizedBrowserController, createOptimizedBrowserController } from '../optimized-controller.js';

// Types
export type { ElementInfo, PageSnapshot, OptimizedControllerOptions } from '../optimized-controller.js';

// Factory functions for easy access
export { getMultiLevelCache } from '../../agent/cache/multi-level-cache.js';
export { getRetrySystem } from '../../agent/stability/retry-system.js';
export { getPerformanceMonitor } from '../../agent/performance/monitor.js';
export { circuitBreakerRegistry } from '../../agent/stability/circuit-breaker.js';
export { getAdaptiveThrottler } from '../../agent/stability/adaptive-throttling.js';
