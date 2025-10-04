// Test script to verify 5-minute timeout for advanced models
async function testAdvancedModelTimeout() {
  console.log('Testing advanced model timeout configuration...')
  
  const baseUrl = 'http://localhost:3000'
  
  // Test cases for different models
  const testCases = [
    {
      name: 'o4-mini model (should get 5-minute timeout)',
      model: 'o4-mini-2025-04-16',
      expectedTimeout: 300000
    },
    {
      name: 'o1 model (should get 5-minute timeout)',
      model: 'o1',
      expectedTimeout: 300000
    },
    {
      name: 'o3 model (should get 5-minute timeout)',
      model: 'o3',
      expectedTimeout: 300000
    },
    {
      name: 'gpt-4 model (should get default 30-second timeout)',
      model: 'gpt-4',
      expectedTimeout: 30000
    }
  ]
  
  for (const testCase of testCases) {
    console.log(`\nTesting: ${testCase.name}`)
    
    try {
      const payload = {
        model: testCase.model,
        messages: [
          {
            role: 'user',
            content: 'This is a test message to verify timeout configuration.'
          }
        ],
        stream: false,
        temperature: 0.7,
        max_tokens: 100
      }
      
      const startTime = Date.now()
      
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-key'
        },
        body: JSON.stringify(payload)
      })
      
      const responseTime = Date.now() - startTime
      
      console.log(`✅ Response received in ${responseTime}ms`)
      console.log(`   Status: ${response.status}`)
      
      if (response.ok) {
        const data = await response.json()
        console.log(`   Model used: ${data.model || 'unknown'}`)
        console.log(`   Response ID: ${data.id || 'unknown'}`)
      } else {
        const errorData = await response.text()
        console.log(`   Error: ${errorData}`)
      }
      
    } catch (error) {
      console.log(`❌ Request failed: ${error.message}`)
    }
  }
  
  console.log('\nTest completed!')
  console.log('Check the server logs to see if advanced models received 5-minute timeouts.')
}

// Run the test
testAdvancedModelTimeout().catch(console.error)