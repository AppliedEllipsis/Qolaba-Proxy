import axios from 'axios'

// Test script to validate the debug fixes
const API_BASE_URL = 'http://localhost:3000'
const TEST_API_KEY = 'your-test-api-key-here'

async function testStreamingRequest() {
  console.log('Testing streaming request with debug fixes...')
  
  try {
    const response = await axios.post(`${API_BASE_URL}/v1/chat/completions`, {
      model: 'claude-sonnet-4-20250514',
      messages: [
        { role: 'user', content: 'Say "Hello, debug test!" and nothing else.' }
      ],
      stream: true
    }, {
      responseType: 'stream',
      headers: {
        'Authorization': `Bearer ${TEST_API_KEY}`,
        'Content-Type': 'application/json'
      }
    })

    console.log('Streaming response started...')
    
    let chunks = []
    response.data.on('data', (chunk) => {
      chunks.push(chunk.toString())
      process.stdout.write('.')
    })

    response.data.on('end', () => {
      console.log('\nStreaming response completed')
      console.log(`Received ${chunks.length} chunks`)
      
      // Check for error patterns in the response
      const fullResponse = chunks.join('')
      const hasErrors = fullResponse.includes('error') || fullResponse.includes('Error')
      
      if (hasErrors) {
        console.log('⚠️  Errors detected in streaming response')
      } else {
        console.log('✅ Streaming response completed without errors')
      }
    })

    response.data.on('error', (error) => {
      console.error('❌ Stream error:', error.message)
    })

  } catch (error) {
    console.error('❌ Request failed:', error.message)
    if (error.response) {
      console.error('Response status:', error.response.status)
      console.error('Response data:', error.response.data)
    }
  }
}

async function testNonStreamingRequest() {
  console.log('\nTesting non-streaming request...')
  
  try {
    const response = await axios.post(`${API_BASE_URL}/v1/chat/completions`, {
      model: 'claude-sonnet-4-20250514',
      messages: [
        { role: 'user', content: 'Say "Hello, non-streaming test!"' }
      ],
      stream: false
    }, {
      headers: {
        'Authorization': `Bearer ${TEST_API_KEY}`,
        'Content-Type': 'application/json'
      }
    })

    console.log('✅ Non-streaming response completed successfully')
    console.log('Response:', response.data.choices[0].message.content)

  } catch (error) {
    console.error('❌ Non-streaming request failed:', error.message)
    if (error.response) {
      console.error('Response status:', error.response.status)
      console.error('Response data:', error.response.data)
    }
  }
}

async function testHealthEndpoint() {
  console.log('\nTesting health endpoint...')
  
  try {
    const response = await axios.get(`${API_BASE_URL}/health`)
    console.log('✅ Health endpoint working')
    console.log('Health status:', response.data.status)
  } catch (error) {
    console.error('❌ Health endpoint failed:', error.message)
  }
}

async function runTests() {
  console.log('🔧 Running debug validation tests...\n')
  
  // Test health endpoint first
  await testHealthEndpoint()
  
  // Test non-streaming request
  await testNonStreamingRequest()
  
  // Test streaming request
  await testStreamingRequest()
  
  console.log('\n🏁 Debug validation tests completed')
  console.log('Check the server logs for enhanced debugging information')
}

// Run the tests
runTests().catch(console.error)