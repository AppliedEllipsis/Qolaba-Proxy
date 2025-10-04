# Comprehensive Test Suite for Header Error Fix

This test suite verifies that the "Cannot set headers after they are sent to the client" error has been properly fixed in the Qoloba Proxy server.

## Overview

The test suite includes:

1. **Original Error Scenario Tests** - Reproduce the exact conditions that were causing the error
2. **Fixed Response Management Tests** - Verify that headers are only set once and coordinated termination works
3. **Edge Case Tests** - Test unusual scenarios and boundary conditions
4. **Logging Functionality Tests** - Ensure enhanced error logging is working properly
5. **Performance Tests** - Verify the fixes don't impact performance
6. **Manual Test Script** - Make actual HTTP requests to test the server

## Quick Start

### Run All Tests

```bash
node tests/test-runner.js all
```

### Run Specific Test Suite

```bash
node tests/test-runner.js suite "Original Error Scenarios"
```

### Run Manual Tests

First, start the server:
```bash
npm start
```

Then run manual tests:
```bash
node tests/test-runner.js manual
```

### List Available Test Suites

```bash
node tests/test-runner.js list
```

## Test Suites

### 1. Original Error Scenario Tests

**File**: `tests/test-original-error-scenarios.js`

**Purpose**: Reproduce the exact conditions that were causing the "Cannot set headers after they are sent to the client" error.

**Tests**:
- Concurrent streaming requests
- Client disconnections during streaming
- Timeout scenarios during streaming
- Rapid successive requests
- Response errors during streaming

**Expected Outcome**: All tests should pass with no header errors detected.

### 2. Fixed Response Management Tests

**File**: `tests/test-fixed-response-management.js`

**Purpose**: Verify that the fixed response management system works correctly.

**Tests**:
- Headers are only set once
- Multiple response operations don't conflict
- End callbacks don't try to set headers after they're sent
- Coordinated termination system
- Response state consistency
- Safe methods prevent header errors

**Expected Outcome**: All tests should pass, demonstrating that the response management system prevents header errors.

### 3. Edge Case Tests

**File**: `tests/test-edge-cases.js`

**Purpose**: Test unusual scenarios and boundary conditions to ensure robustness.

**Tests**:
- Rapid requests with immediate disconnections
- Client disconnections at different stages
- Multiple timeout scenarios
- Error conditions during streaming
- Concurrent operations on same response
- Resource cleanup under stress

**Expected Outcome**: All tests should pass with no header errors detected.

### 4. Logging Functionality Tests

**File**: `tests/test-logging-functionality.js`

**Purpose**: Ensure that enhanced error logging is working properly and request ID tracking works throughout the flow.

**Tests**:
- Enhanced error logging creates detailed error entries
- Request ID tracking works throughout the flow
- Errors log file is created and populated
- Header operation logging
- Response state logging
- Error context preservation in logs

**Expected Outcome**: All tests should pass, demonstrating that logging is working correctly.

### 5. Performance Tests

**File**: `tests/test-performance.js`

**Purpose**: Verify that the fixes don't impact performance and can handle concurrent streaming requests.

**Tests**:
- Concurrent streaming requests performance
- Memory usage doesn't increase significantly
- Response manager performance overhead
- Coordinated termination performance
- High-frequency operations performance
- Stress test with mixed operations

**Expected Outcome**: All tests should pass, demonstrating that performance is not significantly impacted.

### 6. Manual Test Script

**File**: `tests/manual-test-script.js`

**Purpose**: Make actual HTTP requests to test the server in real-world conditions.

**Tests**:
- Basic streaming request
- Concurrent streaming requests
- Client disconnection during streaming
- Rapid successive requests
- Non-streaming request
- Health check

**Expected Outcome**: All tests should pass with no header errors detected.

## Test Utilities

**File**: `tests/test-utils.js`

Contains utility classes for:
- Creating mock request/response objects
- Creating mock qolaba clients
- Tracking async operations
- Asserting no header errors
- Collecting test results

## Running Tests

### Prerequisites

1. Node.js installed
2. Server dependencies installed (`npm install`)

### Running Individual Test Files

Each test file can be run directly:

```bash
node tests/test-original-error-scenarios.js
node tests/test-fixed-response-management.js
node tests/test-edge-cases.js
node tests/test-logging-functionality.js
node tests/test-performance.js
node tests/manual-test-script.js
```

### Running with the Test Runner

The test runner provides a unified interface for running tests:

```bash
# Run all tests
node tests/test-runner.js all

# Run specific test suite
node tests/test-runner.js suite "Test Suite Name"

# Run manual tests
node tests/test-runner.js manual

# List available test suites
node tests/test-runner.js list
```

## Interpreting Results

### Success Indicators

- ✅ **PASSED** - Test completed successfully
- **No header errors detected** - The primary goal of the fix
- **Success Rate: 100%** - All tests passed

### Failure Indicators

- ❌ **FAILED** - Test failed
- **Header errors detected** - The fix may not be working properly
- **Cannot set headers after they are sent to the client** - The original error is still occurring

### Performance Metrics

Performance tests provide metrics on:
- Operations per second
- Memory usage
- Performance overhead
- Concurrency handling

## Troubleshooting

### Tests Fail with Header Errors

If tests fail with "Cannot set headers after they are sent to the client" errors:

1. Check if the server code includes all the fixes from `src/utils/responseManager.js`
2. Verify that the response manager is properly initialized in `src/index.js`
3. Ensure that all streaming endpoints use the response manager

### Manual Tests Fail

If manual tests fail:

1. Ensure the server is running (`npm start`)
2. Check the server URL (default: `http://localhost:3000`)
3. Verify the server is accessible from the test script

### Performance Tests Fail

If performance tests fail:

1. Check system resources (memory, CPU)
2. Close other applications that might be using resources
3. Run tests with fewer concurrent operations

## Expected Behavior

With the fix properly implemented:

1. **No header errors** should occur under any circumstances
2. **Streaming requests** should handle disconnections gracefully
3. **Concurrent requests** should not interfere with each other
4. **Error responses** should be sent properly without header conflicts
5. **Performance** should not be significantly impacted
6. **Logging** should provide detailed information about request/response flow

## Continuous Integration

These tests can be integrated into a CI/CD pipeline:

```bash
# Run all tests and exit with appropriate code
node tests/test-runner.js all
```

The test runner will exit with code 0 if all tests pass, or code 1 if any tests fail.

## Contributing

When adding new tests:

1. Follow the existing test patterns in the test files
2. Use the test utilities in `test-utils.js` for consistency
3. Update this README with information about new tests
4. Ensure tests cover both success and failure scenarios
5. Verify that tests don't introduce flaky behavior

## Conclusion

This comprehensive test suite verifies that the "Cannot set headers after they are sent to the client" error has been properly fixed. The tests cover a wide range of scenarios, from basic functionality to edge cases and performance under stress.

If all tests pass, you can be confident that the fix is working correctly and the server will handle all types of requests without header errors.