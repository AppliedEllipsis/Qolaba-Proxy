# Qolaba OpenAI-Compatible Proxy

# Qolaba OpenAI-Compatible Proxy

A powerful Node.js proxy server that provides OpenAI-compatible API endpoints while routing requests to the Qolaba API. This enables seamless integration with AI tools like Kilo Code, Roo Code, Cline, and any other OpenAI-compatible applications.

## 🚀 Features

- **OpenAI API Compatibility**: Drop-in replacement for OpenAI endpoints (`/v1/chat/completions`, `/v1/models`)
- **Streaming Support**: Real-time streaming responses with Server-Sent Events (SSE)
- **Model Mapping**: Intelligent mapping between OpenAI model names and Qolaba models
- **API Key Passthrough**: Secure handling of API keys with configurable authentication modes
- **Tool Calling Support**: XML-based tool execution for enhanced functionality
- **Comprehensive Logging**: Structured logging with request tracking and performance metrics
- **Rate Limiting**: Built-in protection against abuse
- **Health Checks**: Detailed health monitoring endpoints
- **Docker Support**: Easy containerization and deployment

## 📋 Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn package manager
- Qolaba API key (get one from [Qolaba Platform](https://platform.qolaba.ai))

## 🛠️ Installation

### Option 1: Direct Installation

```bash
# Clone the repository
git clone <repository-url>
cd qoloba-proxy

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env file with your configuration
nano .env

# Start the server
npm start
```

### Option 2: Docker (Recommended)

```bash
# Build and run with Docker Compose
docker-compose up -d --build

# Or with plain Docker
docker build -t qolaba-proxy .
docker run -p 3000:3000 --env-file .env qolaba-proxy
```

### Option 3: NPX (Global Installation)

```bash
# Run directly with NPX (coming soon)
npx qolaba-proxy
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# Qolaba API Configuration
QOLABA_BASE_URL=https://qolaba-server-b2b.up.railway.app/api/v1/studio
TEST_API_KEY=your-test-api-key-here

# Model Configuration
DEFAULT_MODEL=gpt-4.1-mini-2025-04-14
ENABLE_STREAMING=true

# Authentication
API_KEY_MODE=passthrough  # 'passthrough' or 'override'
# OVERRIDE_API_KEY=your-override-key

# Logging
LOG_LEVEL=info
ENABLE_VERBOSE_LOGGING=false

# Performance
REQUEST_TIMEOUT=300000
MAX_RESPONSE_SIZE=10485760
CONCURRENT_REQUESTS_LIMIT=100
```

### Model Mapping

The proxy automatically maps OpenAI model names to Qolaba models:

| OpenAI Model | Qolaba LLM | Qolaba Model |
|-------------|------------|-------------|
| `gpt-4.1-mini-2025-04-14` | OpenAI | gpt-4.1-mini-2025-04-14 |
| `gpt-4.1-2025-04-14` | OpenAI | gpt-4.1-2025-04-14 |
| `gpt-4o-mini` | OpenAI | gpt-4o-mini |
| `claude-3-5-sonnet-20241022` | ClaudeAI | claude-3-7-sonnet-latest |
| `gemini-1.5-pro` | GeminiAI | gemini-2.5-pro |
| `gemini-1.5-flash` | GeminiAI | gemini-2.5-flash |

## 📡 API Endpoints

### Chat Completions

**POST** `/v1/chat/completions`


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


## 🖥️ **Windows Command Line Reference**

### Health Check Commands (Windows CMD)
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

### Health Check Commands (Windows PowerShell)
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

### API Testing (Windows CMD)
```cmd
rem Models list
curl http://localhost:3000/v1/models -H "Authorization: Bearer YOUR_API_KEY"

rem Chat completion (non-streaming)
curl -X POST http://localhost:3000/v1/chat/completions ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_API_KEY" ^
  -d "{\"model\": \"gpt-4.1-mini-2025-04-14\", \"messages\": [{\"role\": \"user\", \"content\": \"Hello\"}]}"

rem Chat completion (streaming)
curl -X POST http://localhost:3000/v1/chat/completions ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_API_KEY" ^
  -d "{\"model\": \"gpt-4.1-mini-2025-04-14\", \"messages\": [{\"role\": \"user\", \"content\": \"Hello\"}], \"stream\": true}"
```

### API Testing (Windows PowerShell)
```powershell
# Models list
curl http://localhost:3000/v1/models -H "Authorization: Bearer YOUR_API_KEY"

# Chat completion (non-streaming)
curl -X POST http://localhost:3000/v1/chat/completions `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer YOUR_API_KEY" `
  -d '{"model": "gpt-4.1-mini-2025-04-14", "messages": [{"role": "user", "content": "Hello"}]}'

# Chat completion (streaming)
curl -X POST http://localhost:3000/v1/chat/completions `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer YOUR_API_KEY" `
  -d '{"model": "gpt-4.1-mini-2025-04-14", "messages": [{"role": "user", "content": "Hello"}], "stream": true}'
```

OpenAI-compatible chat completions endpoint with streaming support.

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_QOLABA_API_KEY" \
  -d '{
    "model": "gpt-4.1-mini-2025-04-14",
    "messages": [
      {"role": "user", "content": "Hello, how are you?"}
    ],
    "max_tokens": 1000,
    "temperature": 0.7,
    "stream": true
  }'
```

### Models List

**GET** `/v1/models`

List available models with OpenAI-compatible format.

```bash
curl http://localhost:3000/v1/models \
  -H "Authorization: Bearer YOUR_QOLABA_API_KEY"
```

### Health Checks

- **GET** `/health` - Basic health status
- **GET** `/health/detailed` - Detailed health with dependencies
- **GET** `/health/ready` - Readiness probe
- **GET** `/health/live` - Liveness probe

### Usage Information

**GET** `/v1/models/usage` - Get usage statistics and credit information

**GET** `/v1/models/pricing` - Get pricing information

## 🛠️ Development

### Running in Development Mode

```bash
# Install dependencies
npm install

# Run with file watching
npm run dev

# Run tests
npm test

# Run with coverage
npm run test:coverage

# Lint code
npm run lint
```

### Project Structure

```
qoloba-proxy/
├── src/
│   ├── index.js              # Main server entry point
│   ├── config/               # Configuration management
│   ├── middleware/           # Express middleware
│   ├── routes/               # API route handlers
│   ├── services/             # Business logic and external APIs
│   └── utils/                # Utility functions
├── tests/                    # Test files
├── docs/                     # Documentation
├── docker-compose.yml        # Docker configuration
├── Dockerfile               # Docker build file
├── package.json             # Node.js dependencies
└── README.md                # This file
```

## 🧪 Testing

### Unit Tests

```bash
# Run all tests
npm test

# Run with file watching
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Integration Testing

```bash
# Test the proxy with curl
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $QOLABA_API_KEY" \
  -d '{
    "model": "gpt-4.1-mini-2025-04-14",
    "messages": [{"role": "user", "content": "Test message"}],
    "stream": false
  }'
```

## 🐳 Docker Usage

### Basic Docker Commands

```bash
# Build the image
docker build -t qolaba-proxy .

# Run with environment file
docker run -p 3000:3000 --env-file .env qolaba-proxy

# Run with environment variables
docker run -p 3000:3000 \
  -e QOLABA_BASE_URL=https://api.qolaba.ai/v1 \
  -e API_KEY_MODE=passthrough \
  qolaba-proxy

# View logs
docker logs -f <container-id>
```

### Docker Compose

```yaml
version: '3.8'
services:
  qolaba-proxy:
    build: .
    ports:
      - "3000:3000"
    environment:
      - QOLABA_BASE_URL=https://qolaba-server-b2b.up.railway.app/api/v1/studio
      - API_KEY_MODE=passthrough
      - LOG_LEVEL=info
    restart: unless-stopped
    volumes:
      - ./logs:/app/logs
```

## 📊 Monitoring and Logging

### Logging Levels

- `error` - Error messages only
- `warn` - Warnings and errors
- `info` - General information (default)
- `debug` - Detailed debugging information

### Performance Metrics

The proxy tracks:
- Request/response times
- Token usage statistics
- Error rates
- Rate limiting metrics
- Upstream API performance

### Health Monitoring

- `/health` - Basic status check
- `/health/detailed` - Complete system health including Qolaba API connectivity
- `/v1/models/usage` - Usage statistics and credit information

## 🔧 Troubleshooting

### Common Issues

1. **"API key not found"**
   - Check your API key is correctly set in `.env`
   - Verify `API_KEY_MODE` is set correctly

2. **"Connection refused"**
   - Ensure the Qolaba API endpoint is accessible
   - Check network connectivity and firewall settings

3. **"Rate limit exceeded"**
   - Wait for the rate limit to reset
   - Consider increasing `CONCURRENT_REQUESTS_LIMIT`

4. **"Model not found"**
   - Check the model mapping in `src/config/index.js`
   - Use the model names returned by `/v1/models`

### Debug Mode

Enable verbose logging:

```bash
# Set log level to debug
LOG_LEVEL=debug ENABLE_VERBOSE_LOGGING=true npm start
```

### Docker Debugging

```bash
# View container logs
docker-compose logs -f qolaba-proxy

# Enter container for debugging
docker-compose exec qolaba-proxy /bin/bash
```

## 📚 API Reference

### Request Format

All requests follow OpenAI API format. See [OpenAI API Documentation](https://platform.openai.com/docs/api-reference) for details.

### Response Format

Responses are formatted to match OpenAI API responses, ensuring compatibility with existing OpenAI clients.

### Streaming

Set `"stream": true` in your request to enable streaming responses. The proxy will send Server-Sent Events (SSE) compatible with OpenAI's streaming format.

## 🔒 Security

- API keys are never logged in full
- Request validation prevents malformed inputs
- Rate limiting protects against abuse
- CORS configuration can be customized
- Input sanitization prevents injection attacks

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- [Qolaba Platform](https://platform.qolaba.ai)
- [Qolaba API Documentation](https://docs.qolaba.ai/api-platform)
- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference)

## 📞 Support

If you encounter issues or have questions:

1. Check the [troubleshooting section](#-troubleshooting)
2. Search existing [GitHub Issues](https://github.com/your-org/qolaba-proxy/issues)
3. Create a new issue with detailed information
4. Include logs and configuration details (with sensitive data redacted)

---

**Built with ❤️ for the AI development community**
// Note for test workflows
// Important: Start the server before running test scripts to observe streaming in real-time.
// See ai.md for detailed knowledge base and testing guidelines.
// Tests and how to run them
// - Run the standard test suite (uses Jest as configured in package.json):
//     npm test
// - Run header-fix focused tests (per the repo's scripts):
//     npm run test:header-fix
// - Run a specific test file (if using Jest with a single test file path):
//     npm test -- tests/<filename>.js
// - If the project requires ES module execution, ensure Node runs with proper module support (e.g., "type": "module" in package.json or use --input-type=module as needed).
//
// Documentation notes:
// - ES modules are used across test files where possible; some legacy scripts may still rely on dynamic imports.
// - The test runner entrypoints (tests/test-runner.js and related test-*.js files) should import correctly in an ES module context.
// - Ensure package.json scripts align with your CI environment; if Jest is not desired, you can swap test runner commands accordingly.