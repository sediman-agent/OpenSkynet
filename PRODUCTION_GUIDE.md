# OpenSkynet Industrial-Grade Production Guide

## Overview

OpenSkynet has been enhanced to industrial/production-grade quality with comprehensive reliability, monitoring, and security features designed for production deployment.

## Production Features

### 1. **Configuration Management**
- **Environment-based configuration** - Separate configs for development, staging, production
- **Validation** - Automatic configuration validation on startup
- **Runtime updates** - Dynamic configuration changes without restart
- **Feature flags** - Environment-specific feature toggles

### 2. **Health & Monitoring**
- **Health checks** - Comprehensive system health monitoring
- **Performance metrics** - Real-time performance tracking
- **Error classification** - Intelligent error categorization and recovery
- **Telemetry collection** - Centralized metrics and operation tracking

### 3. **Database Reliability**
- **Automatic backups** - Periodic database backups with retention policies
- **Connection testing** - Proactive connection health monitoring
- **Automatic recovery** - Self-healing database connections
- **Backup restoration** - Quick recovery from backups

### 4. **Graceful Shutdown**
- **Clean shutdown** - Proper resource cleanup on termination
- **State preservation** - Automatic state saving before shutdown
- **Backup creation** - Final backup before shutdown
- **Timeout protection** - Configurable shutdown timeouts

### 5. **Error Handling**
- **Error classification** - Automatic categorization by type and severity
- **Recovery strategies** - Intelligent retry logic with exponential backoff
- **User-friendly messages** - Clear error messages for end users
- **Technical details** - Comprehensive error context for debugging

### 6. **Playwright Optimizations**
- **Enhanced session management** - Improved browser session reliability
- **Circuit breakers** - Prevent cascading failures
- **Adaptive throttling** - Dynamic performance-based rate limiting
- **Element caching** - Improved element resolution with caching
- **Performance monitoring** - Detailed operation tracking

## Production Deployment

### Environment Variables

```bash
# Environment
NODE_ENV=production                    # Environment: development, staging, production
DEBUG=false                              # Enable debug mode

# Server Configuration
PORT=3000                               # Server port
HOST=0.0.0.0                            # Server host
MAX_CONNECTIONS=100                     # Maximum concurrent connections
SERVER_TIMEOUT=30000                    # Server timeout (ms)
KEEP_ALIVE=60000                        # Keep-alive duration (ms)

# Rate Limiting
RATE_LIMIT_ENABLED=true                  # Enable rate limiting
RATE_LIMIT_MAX=100                       # Max requests per window
RATE_LIMIT_WINDOW=900000                 # Window duration (ms)

# Agent Configuration
MAX_CONCURRENT_TASKS=5                   # Maximum concurrent agent tasks
TASK_TIMEOUT=300000                     # Task timeout (ms)
RETRY_ATTEMPTS=3                         # Number of retry attempts
RETRY_DELAY=1000                         # Retry delay (ms)
MEMORY_LIMIT=1024                        # Memory limit (MB)
CACHE_ENABLED=true                        # Enable caching
CACHE_SIZE=1000                          # Cache size
CACHE_TTL=3600000                        # Cache TTL (ms)

# Browser Configuration
BROWSER_HEADLESS=true                     # Run browser in headless mode
BROWSER_MAX_INSTANCES=10                  # Maximum browser instances
BROWSER_INSTANCE_TIMEOUT=600000          # Browser instance timeout (ms)
BROWSER_POOL_SIZE=5                      # Browser pool size
BROWSER_STEALTH=true                      # Enable stealth mode
BROWSER_PROXY=                            # Optional proxy server

# Monitoring
MONITORING_ENABLED=true                   # Enable monitoring
METRICS_PORT=9090                         # Metrics server port
LOG_LEVEL=info                            # Logging level
TRACING_ENABLED=false                     # Enable distributed tracing
TRACING_SAMPLE_RATE=0.1                  # Tracing sample rate
ALERT_WEBHOOK=                           # Optional alert webhook URL

# Database
DB_POOL_SIZE=10                          # Database connection pool size
DB_CONNECTION_TIMEOUT=30000              # Database connection timeout (ms)
DB_MAX_RETRIES=3                          # Maximum database retry attempts
DB_ENABLE_BACKUP=true                     # Enable automatic backups
DB_BACKUP_INTERVAL=3600000               # Backup interval (ms)
```

### Deployment Steps

1. **Setup Environment**
   ```bash
   # Set production environment
   export NODE_ENV=production
   
   # Configure logging
   export LOG_LEVEL=warn
   
   # Set production values
   export MAX_CONCURRENT_TASKS=10
   export BROWSER_MAX_INSTANCES=20
   ```

2. **Initialize Database**
   ```bash
   # Database will be automatically initialized on first run
   # Backups will be created in data/backups/
   ```

3. **Start Server**
   ```bash
   # Start in production mode
   bun run start
   
   # Or with explicit mode
   bun run start --mode api
   ```

4. **Monitor Health**
   ```bash
   # Health check endpoint (if API enabled)
   curl http://localhost:3000/health
   
   # Metrics endpoint
   curl http://localhost:9090/metrics
   ```

### Process Management

#### Using PM2
```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start src/index.ts --name openskynet --node-args="--loader ts-node/esm/transpiler-only"

# Monitor
pm2 monitor openskynet

# View logs
pm2 logs openskynet

# Restart
pm2 restart openskynet

# Stop
pm2 stop openskynet
```

#### Using Systemd
```ini
# /etc/systemd/system/openskynet.service
[Unit]
Description=OpenSkynet Industrial Automation
After=network.target

[Service]
Type=simple
User=openskynet
WorkingDirectory=/opt/openskynet
Environment="NODE_ENV=production"
ExecStart=/usr/bin/bun run /opt/openskynet/src/index.ts
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start
sudo systemctl enable openskynet
sudo systemctl start openskynet
sudo systemctl status openskynet
```

## Monitoring & Observability

### Health Check Endpoint
The application provides comprehensive health monitoring:

- **Database health** - Connection status, backup info
- **Memory status** - Current usage, limits, trends  
- **Event loop** - Delay measurements
- **File system** - Read/write operations
- **Configuration** - Validation status

### Performance Metrics

- **Operations per second** - Current throughput
- **Average duration** - Response time trends
- **Success rate** - Operation reliability
- **Resource usage** - Memory, CPU, connections
- **Error rates** - Failure patterns

### Error Categories

Errors are automatically classified into:
- **Network** - Connection issues, timeouts
- **Database** - SQL errors, connection problems
- **Browser** - Playwright issues, element resolution
- **LLM** - API errors, rate limiting
- **Memory** - Resource exhaustion
- **Permission** - Access control issues

## Backup & Recovery

### Automatic Backups
- **Interval**: Hourly (configurable)
- **Retention**: 24 backups (configurable)
- **Location**: `data/backups/`
- **Format**: `backup-YYYY-MM-DD-HH-MM-SS.db`

### Manual Backup
```bash
# Create backup programmatically
# (Handled automatically by the system)
```

### Recovery
```bash
# Restore from latest backup
# (Automatic recovery built into system)

# Manual restore if needed
cp data/backups/backup-YYYY-MM-DD-HH-MM-SS.db data/sediman.db
```

## Security Best Practices

### Production Security
1. **API Keys** - Use environment variables for sensitive data
2. **Rate Limiting** - Prevent abuse with configurable limits
3. **CORS** - Restrict cross-origin access in production
4. **Logging** - Use appropriate log levels (warn/error in production)
5. **File Permissions** - Restrict access to data directories

### Network Security
1. **Proxy Support** - Configure proxy for outbound connections
2. **Stealth Mode** - Reduce detection fingerprint
3. **Isolation** - Run in isolated environments when possible

## Troubleshooting

### Common Issues

**High Memory Usage**
```bash
# Check memory limits
echo $MEMORY_LIMIT

# Reduce concurrent tasks
export MAX_CONCURRENT_TASKS=3

# Clear caches
# (Automatic cache management built-in)
```

**Browser Issues**
```bash
# Check browser instances
# (Use monitoring dashboard)

# Reduce browser pool
export BROWSER_POOL_SIZE=3
export BROWSER_MAX_INSTANCES=5
```

**Database Issues**
```bash
# Check database health
# (Automatic health checks)

# Restore from backup
# (Automatic recovery built-in)
```

### Performance Optimization

1. **Enable Caching** - Set `CACHE_ENABLED=true`
2. **Adjust Timeouts** - Balance between reliability and speed
3. **Concurrent Tasks** - Match to available resources
4. **Browser Pool** - Optimize based on workload
5. **Monitoring** - Use metrics to identify bottlenecks

## Scaling Considerations

### Horizontal Scaling
- **Multiple instances** - Run multiple server instances
- **Load balancer** - Distribute traffic across instances
- **Shared storage** - Use external database if needed
- **Session affinity** - Maintain browser sessions

### Vertical Scaling
- **Increase resources** - More CPU, memory, storage
- **Optimize configuration** - Tune limits and timeouts
- **Profile performance** - Use built-in monitoring
- **Database optimization** - Regular backups and maintenance

## Maintenance

### Regular Tasks
- **Review logs** - Check for error patterns
- **Monitor metrics** - Track performance trends
- **Test backups** - Verify backup integrity
- **Update configuration** - Adjust based on workload
- **Security updates** - Keep dependencies updated

### Maintenance Windows
- **Graceful shutdown** - Built-in zero-downtime shutdown
- **Backup before updates** - Automatic backup creation
- **State preservation** - Automatic state saving
- **Quick recovery** - Fast restart after updates

## Compliance & Reliability

### Production Readiness
- **99.9% uptime** - Target availability
- **Graceful degradation** - Operate under reduced capacity
- **Error recovery** - Automatic retry and fallback
- **Data persistence** - Regular backups and validation
- **Monitoring** - Comprehensive health checks

### Service Level
- **Response time** - Configurable timeouts
- **Reliability** - Circuit breakers and retry logic  
- **Scalability** - Horizontal and vertical scaling
- **Observability** - Full metrics and logging
- **Support** - Detailed error context for debugging

This production-grade implementation is designed for industrial SaaS reliability and performance.
