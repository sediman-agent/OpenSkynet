/**
 * Production Configuration System
 * Industrial-grade configuration management with validation, environment variables, and runtime updates
 */

import { createLogger } from './logging';

const logger = createLogger('ProductionConfig');

export interface DatabaseConfig {
  url: string;
  poolSize: number;
  connectionTimeout: number;
  maxRetries: number;
  enableBackup: boolean;
  backupInterval: number;
}

export interface ServerConfig {
  port: number;
  host: string;
  maxConnections: number;
  timeout: number;
  keepAlive: number;
  cors: {
    enabled: boolean;
    origins: string[];
  };
  rateLimit: {
    enabled: boolean;
    maxRequests: number;
    windowMs: number;
  };
}

export interface AgentConfig {
  maxConcurrentTasks: number;
  taskTimeout: number;
  retryAttempts: number;
  retryDelay: number;
  memoryLimit: number;
  enableCaching: boolean;
  cacheSize: number;
  cacheTTL: number;
}

export interface BrowserConfig {
  headless: boolean;
  maxInstances: number;
  instanceTimeout: number;
  poolSize: number;
  enableStealth: boolean;
  proxy?: string;
}

export interface MonitoringConfig {
  enabled: boolean;
  metricsPort: number;
  logLevel: string;
  enableTracing: boolean;
  tracingSampleRate: number;
  alertWebhook?: string;
}

export interface ProductionConfig {
  environment: 'development' | 'staging' | 'production';
  debug: boolean;
  database: DatabaseConfig;
  server: ServerConfig;
  agent: AgentConfig;
  browser: BrowserConfig;
  monitoring: MonitoringConfig;
}

class ConfigManager {
  private config: ProductionConfig;
  private configPath: string | null = null;
  private watchers: Map<string, Set<(value: any) => void>> = new Map();

  constructor() {
    this.config = this.loadConfig();
    this.validateConfig(this.config);
  }

  /**
   * Load configuration from environment variables and defaults
   */
  private loadConfig(): ProductionConfig {
    const env = process.env.NODE_ENV || 'development';

    return {
      environment: env as 'development' | 'staging' | 'production',
      debug: process.env.DEBUG === 'true',

      database: {
        url: process.env.DATABASE_URL || 'sqlite:./data/sediman.db',
        poolSize: parseInt(process.env.DB_POOL_SIZE || '10'),
        connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '30000'),
        maxRetries: parseInt(process.env.DB_MAX_RETRIES || '3'),
        enableBackup: process.env.DB_ENABLE_BACKUP !== 'false',
        backupInterval: parseInt(process.env.DB_BACKUP_INTERVAL || '3600000')
      },

      server: {
        port: parseInt(process.env.PORT || '3000'),
        host: process.env.HOST || '0.0.0.0',
        maxConnections: parseInt(process.env.MAX_CONNECTIONS || '100'),
        timeout: parseInt(process.env.SERVER_TIMEOUT || '30000'),
        keepAlive: parseInt(process.env.KEEP_ALIVE || '60000'),
        cors: {
          enabled: process.env.CORS_ENABLED !== 'false',
          origins: (process.env.CORS_ORIGINS || '*').split(',')
        },
        rateLimit: {
          enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
          maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100'),
          windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000')
        }
      },

      agent: {
        maxConcurrentTasks: parseInt(process.env.MAX_CONCURRENT_TASKS || '5'),
        taskTimeout: parseInt(process.env.TASK_TIMEOUT || '300000'),
        retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3'),
        retryDelay: parseInt(process.env.RETRY_DELAY || '1000'),
        memoryLimit: parseInt(process.env.MEMORY_LIMIT || '1024'),
        enableCaching: process.env.CACHE_ENABLED !== 'false',
        cacheSize: parseInt(process.env.CACHE_SIZE || '1000'),
        cacheTTL: parseInt(process.env.CACHE_TTL || '3600000')
      },

      browser: {
        headless: process.env.BROWSER_HEADLESS !== 'false',
        maxInstances: parseInt(process.env.BROWSER_MAX_INSTANCES || '10'),
        instanceTimeout: parseInt(process.env.BROWSER_INSTANCE_TIMEOUT || '600000'),
        poolSize: parseInt(process.env.BROWSER_POOL_SIZE || '5'),
        enableStealth: process.env.BROWSER_STEALTH !== 'false',
        proxy: process.env.BROWSER_PROXY
      },

      monitoring: {
        enabled: process.env.MONITORING_ENABLED !== 'false',
        metricsPort: parseInt(process.env.METRICS_PORT || '9090'),
        logLevel: process.env.LOG_LEVEL || 'info',
        enableTracing: process.env.TRACING_ENABLED === 'true',
        tracingSampleRate: parseFloat(process.env.TRACING_SAMPLE_RATE || '0.1'),
        alertWebhook: process.env.ALERT_WEBHOOK
      }
    };
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: ProductionConfig): void {
    const errors: string[] = [];

    // Validate database config
    if (config.database.poolSize < 1) {
      errors.push('Database pool size must be at least 1');
    }
    if (config.database.connectionTimeout < 1000) {
      errors.push('Database connection timeout must be at least 1000ms');
    }

    // Validate server config
    if (config.server.port < 1 || config.server.port > 65535) {
      errors.push('Server port must be between 1 and 65535');
    }
    if (config.server.maxConnections < 1) {
      errors.push('Max connections must be at least 1');
    }

    // Validate agent config
    if (config.agent.maxConcurrentTasks < 1) {
      errors.push('Max concurrent tasks must be at least 1');
    }
    if (config.agent.taskTimeout < 1000) {
      errors.push('Task timeout must be at least 1000ms');
    }

    // Validate browser config
    if (config.browser.maxInstances < 1) {
      errors.push('Browser max instances must be at least 1');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }

    logger.info('Configuration validated successfully');
  }

  /**
   * Get configuration value by path
   */
  get(path: string): any {
    const keys = path.split('.');
    let value = this.config as any;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Set configuration value (runtime updates)
   */
  set(path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    let obj = this.config as any;

    for (const key of keys) {
      if (!(key in obj)) {
        obj[key] = {};
      }
      obj = obj[key];
    }

    obj[lastKey] = value;

    // Notify watchers
    this.notifyWatchers(path, value);

    logger.info(`Configuration updated: ${path} = ${JSON.stringify(value)}`);
  }

  /**
   * Watch configuration changes
   */
  watch(path: string, callback: (value: any) => void): () => void {
    if (!this.watchers.has(path)) {
      this.watchers.set(path, new Set());
    }

    this.watchers.get(path)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.watchers.get(path)?.delete(callback);
    };
  }

  /**
   * Notify watchers of configuration changes
   */
  private notifyWatchers(path: string, value: any): void {
    const watchers = this.watchers.get(path);
    if (watchers) {
      for (const callback of watchers) {
        try {
          callback(value);
        } catch (error) {
          logger.error(`Error in config watcher for ${path}: ` + (error as Error).message);
        }
      }
    }
  }

  /**
   * Get all configuration
   */
  getAll(): ProductionConfig {
    return { ...this.config };
  }

  /**
   * Reload configuration from environment
   */
  reload(): void {
    logger.info('Reloading configuration...');
    this.config = this.loadConfig();
    this.validateConfig(this.config);
    logger.info('Configuration reloaded successfully');
  }

  /**
   * Export configuration (sans secrets)
   */
  export(): string {
    const safeConfig = { ...this.config };

    // Remove sensitive values
    if (safeConfig.database.url.includes('://') && safeConfig.database.url.includes(':')) {
      safeConfig.database.url = this.maskUrl(safeConfig.database.url);
    }

    return JSON.stringify(safeConfig, null, 2);
  }

  /**
   * Mask URL credentials
   */
  private maskUrl(url: string): string {
    return url.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
  }

  /**
   * Get environment-specific overrides
   */
  getEnvironmentConfig(): ProductionConfig {
    const env = this.config.environment;

    const environmentOverrides: Record<string, Partial<ProductionConfig>> = {
      development: {
        debug: true,
        monitoring: {
          ...this.config.monitoring,
          enabled: false,
          logLevel: 'debug'
        }
      },
      staging: {
        debug: false,
        monitoring: {
          ...this.config.monitoring,
          enabled: true,
          logLevel: 'info'
        }
      },
      production: {
        debug: false,
        monitoring: {
          ...this.config.monitoring,
          enabled: true,
          logLevel: 'warn'
        }
      }
    };

    return {
      ...this.config,
      ...environmentOverrides[env]
    };
  }

  /**
   * Get feature flags
   */
  getFeatureFlags(): {
    enableExperimentalFeatures: boolean;
    enableBetaFeatures: boolean;
    enableAdvancedAnalytics: boolean;
    enableAIRecommendations: boolean;
  } {
    return {
      enableExperimentalFeatures: process.env.ENABLE_EXPERIMENTAL === 'true',
      enableBetaFeatures: this.config.environment !== 'production',
      enableAdvancedAnalytics: process.env.ENABLE_ADVANCED_ANALYTICS === 'true',
      enableAIRecommendations: process.env.ENABLE_AI_RECOMMENDATIONS === 'true'
    };
  }

  /**
   * Validate configuration is production-ready
   */
  isProductionReady(): {
    ready: boolean;
    issues: string[];
    warnings: string[];
  } {
    const issues: string[] = [];
    const warnings: string[] = [];

    // Check for required settings
    if (this.config.environment === 'production') {
      if (this.config.server.rateLimit.enabled === false) {
        warnings.push('Rate limiting is disabled in production');
      }

      if (this.config.monitoring.enabled === false) {
        issues.push('Monitoring must be enabled in production');
      }

      if (this.config.database.url.includes('localhost')) {
        warnings.push('Using localhost database in production');
      }

      if (this.config.browser.maxInstances < 5) {
        warnings.push('Browser pool size may be too small for production load');
      }
    }

    // Check for insecure settings
    if (this.config.server.cors.origins.includes('*') && this.config.environment === 'production') {
      warnings.push('CORS is set to allow all origins in production');
    }

    return {
      ready: issues.length === 0,
      issues,
      warnings
    };
  }
}

// Global configuration manager instance
let globalConfigManager: ConfigManager | null = null;

/**
 * Get the global configuration manager
 */
export function getConfigManager(): ConfigManager {
  if (!globalConfigManager) {
    globalConfigManager = new ConfigManager();
  }
  return globalConfigManager;
}

/**
 * Get configuration value
 */
export function getConfigValue(path: string): any {
  return getConfigManager().get(path);
}

/**
 * Set configuration value
 */
export function setConfigValue(path: string, value: any): void {
  getConfigManager().set(path, value);
}

/**
 * Get all configuration
 */
export function getAllConfig(): ProductionConfig {
  return getConfigManager().getAll();
}

/**
 * Reset configuration manager
 */
export function resetConfigManager(): void {
  globalConfigManager = null;
}
