# Qolaba OpenAI-Compatible Proxy

# Qolaba OpenAI-Compatible Proxy

A powerful Node.js proxy server that provides OpenAI-compatible API endpoints while routing requests to the Qolaba API. This enables seamless integration with AI tools like Kilo Code, Roo Code, Cline, and any other OpenAI-compatible applications.

## [Original Message on Discord:](https://discord.com/channels/1225812812643958866/1377469424130326568/1424067221600210985)

So I have some good news and some bad news.

**Good News:** I made an OpenAI proxy for your API so you can use it in other tools like Kilo Code, Roo Code, Cline, or anything else that supports OpenAI compatible endpoints.

**Bad News:** I have no plans on supporting it in the future as I am planning on requesting a refund on my LTDs since it's about to expire and I have trouble finding value in this vs alternatives with native OpenAI or Anthropic endpoint support.

**Why:** Really, the models available and the price.  There are disparities between the cost of credits on the main platform and the API, they cost 2.5x less on API site. But on the API site, credit usage are a min of 1 and go up as integers.  On the web portal, many models can have fractional credit usage.  Other providers are definitely cheaper and while this is a LTD and will keep replenishing and I like that credits stack between periods, I just don't see me using it.  This price disparity is fine for API purchasers to justify the different credit costs and lack of margins, but with the LTD, it makes the credit usage much much higher than on the site.  Then there are lack of things like Veo3 in API.

**Can I get a copy:** Yeah, I will probably put it on GitHub with a permissible license for others to use or fork.  Maybe it will help bring popularity to Qolaba or give them a starting point for more functions.  Keep a look out for updates or DM me if interested in taking over.  Maybe someone could share API keys/accounts if it needs updates & there is no one to maintain. But just doing basic test calls during development, I used over 900 credits in a night.  Honestly, I wanted to create an interface for this when I first got the LTD, but life got in the way & my big push was I was approaching my refund day.

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
git clone https://github.com/AppliedEllipsis/Qolaba-Proxy.git
cd Qolaba-Proxy

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

#### OpenAI Models
| OpenAI Model | Qolaba LLM | Qolaba Model |
|-------------|------------|-------------|
| `gpt-4.1-mini-2025-04-14` | OpenAI | gpt-4.1-mini-2025-04-14 |
| `gpt-4.1-2025-04-14` | OpenAI | gpt-4.1-2025-04-14 |
| `gpt-4o-mini` | OpenAI | gpt-4o-mini |
| `gpt-4o` | OpenAI | gpt-4o |
| `o3-mini` | OpenAI | o3-mini |
| `o1` | OpenAI | o1 |
| `o3` | OpenAI | o3 |
| `o4-mini-2025-04-16` | OpenAI | o4-mini-2025-04-16 |

#### ClaudeAI Models
| OpenAI Model | Qolaba LLM | Qolaba Model |
|-------------|------------|-------------|
| `claude-3-7-sonnet-latest` | ClaudeAI | claude-3-7-sonnet-latest |
| `claude-opus-4-20250514` | ClaudeAI | claude-opus-4-20250514 |
| `claude-sonnet-4-20250514` | ClaudeAI | claude-sonnet-4-20250514 |

#### GeminiAI Models
| OpenAI Model | Qolaba LLM | Qolaba Model |
|-------------|------------|-------------|
| `gemini-2.5-pro` | GeminiAI | gemini-2.5-pro |
| `gemini-2.5-flash` | GeminiAI | gemini-2.5-flash |

#### OpenRouterAI Models
| OpenAI Model | Qolaba LLM | Qolaba Model |
|-------------|------------|-------------|
| `x-ai/grok-3-beta` | OpenRouterAI | x-ai/grok-3-beta |
| `x-ai/grok-3-mini-beta` | OpenRouterAI | x-ai/grok-3-mini-beta |
| `perplexity/sonar-pro` | OpenRouterAI | perplexity/sonar-pro |
| `perplexity/sonar-reasoning-pro` | OpenRouterAI | perplexity/sonar-reasoning-pro |
| `perplexity/sonar-reasoning` | OpenRouterAI | perplexity/sonar-reasoning |
| `perplexity/sonar-deep-research` | OpenRouterAI | perplexity/sonar-deep-research |
| `deepseek/deepseek-chat` | OpenRouterAI | deepseek/deepseek-chat |
| `deepseek/deepseek-r1` | OpenRouterAI | deepseek/deepseek-r1 |

## 📡 API Endpoints

### Chat Completions

**POST** `/v1/chat/completions`


## 🔑 **Using the Test API Key**

For testing purposes, you can use the built-in test API key:

**Test API Key:** `your-test-api-key-here`

- ✅ Removed test API key `ad6dee520329cb2818c72e2c8c12b611b965c94568be085c6bce2089f52b9683` from:
  - `.env.example` (line 25)
  - `src/config/index.js` (line 16)
  - `README.md` (5 occurrences)
  - `test_kilo_vs_sillytavern.js` (line 50)
- Add it back to those locations if you want.


*Note:* Any third-party keys found in this repo history have already been revoked.  You will need to use your own. The test-key is hardcoded in index.ts

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

### Test Status

All tests are now passing! The test suite includes 166 tests across 7 test files that verify:

- Basic application functionality
- Health endpoints
- Models endpoint
- Chat completions endpoint
- Authentication middleware
- Error handling
- Configuration validation
- Translator utilities
- Response management

### Recent Test Fixes

The following issues were recently resolved:
- Fixed port conflicts during test execution by preventing server startup in test environment
- Corrected service name assertions from "qolaba-proxy" to "qoloba-proxy"
- Improved test assertions to be more specific and reliable
- Implemented test-specific handler functions for better test isolation
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
├── LICENSE                   # GNU General Public License v3.0
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

For comprehensive troubleshooting guides, see our detailed documentation:

- **[TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** - Complete troubleshooting guide with solutions for common issues
- **[TIMEOUT_ERROR_HANDLING.md](docs/TIMEOUT_ERROR_HANDLING.md)** - Specific timeout error handling documentation
- **[STREAMING_FIX_IMPLEMENTATION_PLAN.md](docs/streaming-fix-implementation-plan.md)** - Streaming fixes and implementation details

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

5. **"Streaming request timeout"**
   - See [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md#1-streaming-request-timeouts) for timeout configuration
   - Set `REQUEST_TIMEOUT=120000` for proper timeout handling

6. **"Cannot set headers after they are sent"**
   - See [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md#3-cannot-set-headers-after-sent-errors) for race condition fixes

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

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## 📚 Documentation

This project includes comprehensive documentation to help you get started and troubleshoot issues:

### Core Documentation
- **[README.md](README.md)** - This file, main project documentation
- **[TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** - Complete troubleshooting guide with solutions for common issues
- **[TIMEOUT_ERROR_HANDLING.md](docs/TIMEOUT_ERROR_HANDLING.md)** - Specific timeout error handling documentation
- **[STREAMING_FIX_IMPLEMENTATION_PLAN.md](docs/streaming-fix-implementation-plan.md)** - Streaming fixes and implementation details

### Additional Documentation
- **[CHANGELOG.md](docs/CHANGELOG.md)** - Version history and changes
- **[ai.md](docs/ai.md)** - AI knowledge base and testing guidelines
- **[hanging-issues-analysis.md](docs/hanging-issues-analysis.md)** - Analysis of hanging issues and solutions

## 🔗 Links

- [Qolaba Platform](https://platform.qolaba.ai)
- [Qolaba API Documentation](https://docs.qolaba.ai/api-platform)
- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference)

## 📞 Support

If you encounter issues or have questions:

1. Check the [troubleshooting section](#-troubleshooting)
2. Search existing [GitHub Issues](https://github.com/AppliedEllipsis/Qolaba-Proxy/issues)
3. Create a new issue with detailed information
4. Include logs and configuration details (with sensitive data redacted)

---

**Built with ❤️ for the AI development community**

## 🧪 Developer Notes

### Testing Guidelines

**Important:** Start the server before running test scripts to observe streaming in real-time. See [ai.md](docs/ai.md) for detailed knowledge base and testing guidelines.

#### Running Tests

- **Standard test suite** (uses Jest as configured in package.json):
  ```bash
  npm test
  ```

- **Header-fix focused tests** (per the repo's scripts):
  ```bash
  npm run test:header-fix
  ```

- **Specific test file** (if using Jest with a single test file path):
  ```bash
  npm test -- tests/<filename>.js
  ```

- **ES module execution**: Ensure Node runs with proper module support (e.g., `"type": "module"` in package.json or use `--input-type=module` as needed).

### Documentation Notes

- ES modules are used across test files where possible; some legacy scripts may still rely on dynamic imports.
- The test runner entrypoints (tests/test-runner.js and related test-*.js files) should import correctly in an ES module context.
- Ensure package.json scripts align with your CI environment; if Jest is not desired, you can swap test runner commands accordingly.