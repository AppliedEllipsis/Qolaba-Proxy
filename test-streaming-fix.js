
import { createServer } from 'http'
import { createReadStream } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Simple test to verify streaming without header conflicts
async function testStreamingFix() {
  console.log('🧪 Testing streaming fix...')
  
  // Test payload for streaming request
  const testPayload = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'user', content: 'Hello! This is a test message.' }
    ],
    stream: true,
    temperature: 0.7
  }

  try {
    const response = await fetch('http://localhost:3000/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-key'
      },
      body: JSON.stringify(testPayload)
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    console.log('✅ Streaming request initiated successfully')
    console.log('📡 Response headers:', Object.fromEntries(response.headers))

    // Read the streaming response
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let chunkCount = 0
    let fullResponse = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        
        if (done) {
          console.log('✅ Stream completed successfully')
          break
        }

        const chunk = decoder.decode(value, { stream: true })
        fullResponse += chunk
        chunkCount++

        // Log every 10th chunk to avoid spam
        if (chunkCount % 10 === 0) {
          console.log(`📊 Received ${chunkCount} chunks`)
        }

        // Check for error patterns in the stream
        if (chunk.includes('Cannot set headers') || chunk.includes('headers after they are sent')) {
          console.error('❌ Header error detected in stream!')
          return false
        }
      }

      console.log(`📈 Total chunks received: ${chunkCount}`)
      console.log(`📝 Total response length: ${fullResponse.length} characters`)
      
      // Verify the stream contains expected SSE format
      if (fullResponse.includes('data: ') && fullResponse.includes('chat.completion.chunk')) {
        console.log('✅ Stream format is correct (SSE with OpenAI chunks)')
      } else {
        console.log('⚠️  Stream format may not be as
      // Verify the stream contains expected SSE format
      if (fullResponse.includes('data: ') && fullResponse.includes('chat.completion.chunk')) {
        console.log('✅ Stream format is correct (SSE with OpenAI chunks)')
      } else {
        console.log('⚠️  Stream format may not be as
expected')\n      }\n\n
      // Check for proper