# Qoloba Proxy - Troubleshooting Guide

This guide helps diagnose and resolve common issues with the Qoloba OpenAI-Compatible Proxy server.

## 🔍 **Quick Diagnosis**

## 🖥️ **Windows Command Reference**

## 🔑 **Using the Test API Key**

For testing purposes, you can use the built-in test API key:

**Test API Key:** `your-test-api-key-here`

**Usage Examples (Windows CMD):**
```cmd
rem Using test API key for models list
curl http://localhost:3000/v1/models -H "Authorization: Bearer your-test-api-key-here"

rem Using test API key for chat completion
curl -X POST http://localhost:3000/v1/chat/completions ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer your-test-api-key-here" ^
  -d "{\"model\": \"gpt-4.1-mini-2025-04-14\", \"messages\": [{\"role\": \"user\", \"content\": \"Hello\"}]}"
```

**Usage Examples (PowerShell):**
```powershell
# Using test API key for models list
curl http://localhost:3000/v1/models -H "Authorization: Bearer your-test-api-key-here"

# Using test API key for chat completion
curl -X POST http://localhost:3000/v1/chat/completions `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer your-test-api-key-here" `
  -d '{"model": "gpt-4.1-mini-2025-04-14", "messages": [{"role": "user", "content": "Hello"}]}'
```

**Note:** This test key is provided for development and testing only. For production use, replace it with your actual Qolaba API key.


### Health Check Commands

**Windows CMD:**
```cmd
rem Basic health check
curl http://localhost:3000/health

rem Detailed health with metrics
curl http://localhost:3000/health/detailed

rem System readiness
curl http://localhost:3000/health/ready

rem Liveness probe
curl http://localhost:3000/health/live
```

**Windows PowerShell:**
```powershell
# Basic health check
curl http://localhost:3000/health

# Detailed health with metrics
curl http://localhost:3000/health/detailed

# System readiness
curl http://localhost:3000/health/ready

# Liveness probe
curl http://localhost:3000/health/live
```

### API Testing Commands

**Windows CMD:**
```cmd
rem Models list
curl http://localhost:3000/v1/models -H "Authorization: Bearer YOUR_API_KEY"

rem Chat completion (non-streaming)
curl -X POST http://localhost:3000/v1/chat/completions ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_API_KEY" ^
  -d "{\"model\": \"gpt-4o-mini\", \"messages\": [{\"role\": \"user\", \"content\": \"Hello\"}]}"

rem Chat completion (streaming)
curl -X POST http://localhost:3000/v1/chat/completions ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_API_KEY" ^
  -d "{\"model\": \"gpt-4o-mini\", \"messages\": [{\"role\": \"user\", \"content\": \"Hello\"}], \"stream\": true}"
```

**Windows PowerShell:**
```powershell
# Models list
curl http://localhost:3000/v1/models -H "Authorization: Bearer YOUR_API_KEY"

# Chat completion (non-streaming)
curl -X POST http://localhost:3000/v1/chat/completions `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer YOUR_API_KEY" `
  -d '{"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "Hello"}]}'

# Chat completion (streaming)
curl -X POST http://localhost:3000/v1/chat/completions `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer YOUR_API_KEY" `
  -d '{"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "Hello"}], "stream": true}'
```

### System Diagnostics

**Windows CMD:**
```cmd
rem Check if server is running
tasklist | findstr node

rem Check port usage
netstat -an | findstr :3000

rem Check memory usage
curl http://localhost:3000/health/detailed

rem Get recent logs
type logs\app.log | more

rem Restart server
npm start
```

**Windows PowerShell:**
```powershell
# Check if server is running
Get-Process | Where-Object {$_.ProcessName -like "*node*"}

# Check port usage
netstat -an | Select-String ":3000"

# Check memory usage
curl http://localhost:3000/health/detailed | ConvertFrom-Json | Select-Object -ExpandProperty memory

# Get recent logs
Get-Content "logs\app.log" | Select-Object -Last 100

# Restart server
npm start
```


### Check Server Status
```bash
# Basic health check
curl http://localhost:3000/health

# Detailed health with metrics
curl http://localhost:3000/health/detailed

# System readiness
curl http://localhost:3000/health/ready
```

### Common Error Patterns

#### 1. **Timeout Errors**
**Symptoms:**
- `Request timeout after 30000ms`
- `Streaming error occurred`
- `Request completed near timeout`

**Solutions:**
- Check if streaming requests are properly handled
- Verify timeout configuration in `.env`
- Monitor network connectivity to Qolaba API
- Check for client disconnect patterns

**Configuration:**
```bash
# Increase timeouts if needed
REQUEST_TIMEOUT=120000  # 2 minutes
CONNECTION_TIMEOUT=60000 # 1 minute
```

#### 2. **JSON Parsing Errors**
**Symptoms:**
- `Invalid JSON format in request body`
- `Unexpected token ''', "'model:" is not valid JSON`
- `Request body cannot be empty`

**Solutions:**
- Validate JSON before sending requests
- Check for malformed JSON syntax
- Ensure proper content-type headers
- Use JSON linters for request validation

**Example Valid Request:**
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": true
  }'
```

#### 3. **Client Disconnect Issues**
**Symptoms:**
- `Client disconnected during streaming`
- `Request aborted by client`
- Incomplete streaming responses

**Solutions:**
- Check client-side timeout settings
- Verify network stability
- Monitor client disconnect rates
- Implement retry logic on client side

#### 4. **API Connection Issues**
**Symptoms:**
- `ECONNREFUSED`
- `ECONNRESET`
- `ETIMEDOUT`
- `Qolaba API error`

**Solutions:**
- Verify Qolaba API endpoint accessibility
- Check API key validity
- Monitor rate limiting
- Test network connectivity

## 📊 **Monitoring and Logs**

### Enable Debug Logging
```bash
# Set environment variables
LOG_LEVEL=debug
ENABLE_VERBOSE_LOGGING=true
npm start
```

### Key Log Patterns to Watch

#### Successful Requests
```
info: Request started {requestId: "...", method: "POST", url: "/v1/chat/completions"}
info: Chat completion request received {requestId: "...", stream: true}
info: Streaming started {requestId: "..."}
info: Streaming completed successfully {requestId: "..."}
info: Chat completion completed successfully {requestId: "..."}
```

#### Problem Patterns
```
warn: Request timeout reached {requestId: "...", duration: "30015ms"}
info: Client disconnected during streaming {requestId: "..."}
error: Streaming error occurred {requestId: "..."}
error: JSON parsing error {requestId: "..."}
```

### Health Metrics
Monitor these metrics via `/health/detailed`:
- Error rate (should be < 10%)
- Average response time (should be < 30s)
- Circuit breaker state (should be CLOSED)
- Streaming disconnect rate (should be < 30%)

## 🔧 **Configuration Fixes**

### Timeout Optimization
```bash
# .env file optimizations
REQUEST_TIMEOUT=120000          # 2 minutes
CONNECTION_TIMEOUT=60000        # 1 minute
SOCKET_TIMEOUT=120000           # 2 minutes
KEEP_ALIVE_TIMEOUT=65000        # 65 seconds
```

### Connection Pool Settings
```bash
# Improve connection handling
MAX_SOCKETS=50
MAX_FREE_SOCKETS=10
KEEP_ALIVE=true
KEEP_ALIVE_MSECS=30000
```

### Rate Limiting
```bash
# Adjust rate limits if needed
CONCURRENT_REQUESTS_LIMIT=100
```

## 🚨 **Alert Scenarios**

### High Error Rate
- **Trigger**: Error rate > 10%
- **Action**: Check logs for pattern, verify API connectivity
- **Check**: `/health/detailed` for error details

### Slow Response Times
- **Trigger**: Average response time > 30 seconds
- **Action**: Check Qolaba API performance, network latency
- **Check**: Response time logs

### Circuit Breaker Open
- **Trigger**: Multiple consecutive failures
- **Action**: Check API connectivity, restart service if needed
- **Check**: Circuit breaker state in health endpoint

### High Streaming Disconnect Rate
- **Trigger**: Disconnect rate > 30%
- **Action**: Check client-side implementations, network stability
- **Check**: Streaming logs and metrics

## 🛠️ **Step-by-Step Troubleshooting**

### 1. **Server Not Responding**
```bash
# Check if server is running
ps aux | grep node

# Check port usage
netstat -tlnp | grep :3000

# Restart server
npm start
```

### 2. **API Connection Issues**
```bash
# Test Qolaba API directly
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://qolaba-server-b2b.up.railway.app/api/v1/studio/get-status

# Check network connectivity
ping qolaba-server-b2b.up.railway.app
```

### 3. **Streaming Issues**
```bash
# Test streaming endpoint
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Test"}],
    "stream": true
  }' --no-buffer
```

### 4. **Memory Issues**
```bash
# Check memory usage
curl http://localhost:3000/health/detailed | jq '.memory'

# Monitor process
top -p $(pgrep -f "node.*index.js")
```

## 📈 **Performance Tuning**

### For High Traffic
- Increase `CONCURRENT_REQUESTS_LIMIT`
- Optimize connection pool settings
- Consider load balancing multiple instances
- Monitor memory usage

### For Large Requests
- Increase `MAX_RESPONSE_SIZE`
- Adjust timeout settings
- Monitor payload sizes
- Consider request size limits

### For Better Reliability
- Enable retry logic
- Configure circuit breaker
- Set up monitoring alerts
- Implement health checks

## 🔍 **Debug Mode**

Enable comprehensive debugging:
```bash
# Environment variables
LOG_LEVEL=debug
ENABLE_VERBOSE_LOGGING=true
ENABLE_DEBUG_ENDPOINTS=true
REQUEST_TIMEOUT=300000

# Start with debug output
DEBUG=* npm start
```

## 🆘 **Getting Help**

### Gather Information
1. Server logs (last 100 lines)
2. Health check output
3. Error patterns
4. Configuration used
5. Request that caused the issue

### Useful Commands
```bash
# Get recent logs
tail -100 logs/app.log

# Health check
curl -s http://localhost:3000/health/detailed | jq .

# Test API
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"test"}],"stream":false}'
```

### Contact Support
Include the following information:
- Server version and configuration
- Full error logs
- Steps to reproduce
- Expected vs actual behavior

---

## ✅ **Health Check Checklist**

Before going to production, verify:

- [ ] Server starts without errors
- [ ] Health endpoints respond correctly
- [ ] Basic chat completion works
- [ ] Streaming responses work
- [ ] Error handling works
- [ ] Rate limiting is functional
- [ ] Circuit breaker works
- [ ] Logs are informative
- [ ] Monitoring alerts are configured
- [ ] Memory usage is stable
- [ ] Timeouts are reasonable
- [ ] Client disconnect handling works
- [ ] All tests pass (166 tests across 7 test files)

## 🧪 **Test Troubleshooting**

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Common Test Issues

#### 1. Port Conflicts During Tests

**Symptoms:**
- `EADDRINUSE: address already in use 0.0.0.0:3000`
- Tests failing to start server

**Solutions:**
- Ensure the server is not running before starting tests
- Verify that `NODE_ENV=test` is set in the test script
- Check that server startup is properly prevented in test environment

#### 2. Service Name Mismatches

**Symptoms:**
- Test assertions failing with service name errors
- Expected "qoloba-proxy" but got "qolaba-proxy"

**Solutions:**
- Check that the service name is "qoloba-proxy" in the test assertions
- Verify that the service name is consistent across all test files
- Ensure that the service name is correctly set in the configuration

#### 3. Test Assertion Errors

**Symptoms:**
- Tests failing with assertion errors
- Expected values not matching actual values

**Solutions:**
- Check that the assertions are using the correct syntax
- Verify that the expected values match the actual values
- Ensure that the test assertions are specific and not too broad

### Test Results Interpretation

#### Success Indicators

- ✅ **PASSED** - Test completed successfully
- **Test Suites: 7 passed, 7 total** - All test suites passed
- **Tests: 166 passed, 166 total** - All tests passed
- **Snapshots: 0 total** - No snapshot tests
- **Time: ~2s** - Tests completed quickly

#### Failure Indicators

- ❌ **FAILED** - Test failed
- **Error messages** - Look for specific error messages in the test output
- **Port conflicts** - Ensure the server is not running before starting tests
- **Service name mismatches** - Check that service name is "qoloba-proxy" in tests

### Recent Test Fixes

The following issues were recently resolved:
- Fixed port conflicts during test execution by preventing server startup in test environment
- Corrected service name assertions from "qolaba-proxy" to "qoloba-proxy"
- Improved test assertions to be more specific and reliable
- Implemented test-specific handler functions for better test isolation

---

**Last Updated**: October 2025  
**Version**: 1.0.0  
**Maintainer**: Qoloba Proxy Team