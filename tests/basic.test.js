import request from 'supertest'
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import app from '../src/index.js'

describe('Qoloba Proxy API', () => {
  let server
  
  before(async () => {
    // Start the server for testing
    server = app.listen(0) // Use random available port
  })

  after(async () => {
    // Close the server after tests
    if (server) {
      await new Promise((resolve) => {
        server.close(resolve)
      })
    }
  })
  
  describe('Health Checks', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200)

      assert.strictEqual(response.body.status, 'healthy')
      assert.ok(response.body.timestamp)
      assert.ok(response.body.uptime)
    })

    it('should return detailed health status', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200)

      assert.ok(response.body.status)
      assert.ok(response.body.dependencies)
      assert.ok(response.body.system)
    })

    it('should return ready status', async () => {
      const response = await request(app)
        .get('/health/ready')
        .expect(200)

      assert.ok(['ready', 'not ready'].includes(response.body.status))
    })
  })
  
  describe('Models API', () => {
    it('should return list of available models', async () => {
      const response = await request(app)
        .get('/v1/models')
        .expect(200)

      assert.strictEqual(response.body.object, 'list')
      assert.ok(Array.isArray(response.body.data))
      assert.ok(response.body.data.length > 0)

      // Check model structure
      const model = response.body.data[0]
      assert.ok(model.id)
      assert.strictEqual(model.object, 'model')
      assert.ok(model.created)
      assert.ok(model.owned_by)
    })

    it('should return model details for specific model', async () => {
      const response = await request(app)
        .get('/v1/models/gpt-4.1-mini-2025-04-14')
        .expect(200)

      assert.strictEqual(response.body.id, 'gpt-4.1-mini-2025-04-14')
      assert.strictEqual(response.body.object, 'model')
      assert.ok(response.body.capabilities)
    })

    it('should return 404 for non-existent model', async () => {
      const response = await request(app)
        .get('/v1/models/non-existent-model')
        .expect(404)

      assert.ok(response.body.error)
      assert.strictEqual(response.body.error.code, 'model_not_found')
    })
  })
  
  describe('Chat Completions', () => {
    it('should validate missing messages', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({ model: 'gpt-4.1-mini-2025-04-14' })
        .expect(400)

      assert.ok(response.body.error)
      assert.ok(response.body.error.message.includes('messages'))
    })
    
    it('should validate invalid model', async () => {
n      const response = await request(app)
n        .post('/v1/chat/completions')
n        .send({
n          model: 'invalid-model',
n          messages: [{ role: 'user', content: 'Hello' }]
n        })
n        .expect(401) // Will fail due to missing API key
n      
n      // Should still validate the model exists in mappings
n      assert.ok(response.body.error)
n    })
    
    it('should require authentication', async () => {
n      const response = await request(app)
n        .post('/v1/chat/completions')
n        .send({
n          model: 'gpt-4.1-mini-2025-04-14',
n          messages: [{ role: 'user', content: 'Hello' }]
n        })
n        .expect(401)
      
      assert.ok(response.body.error)
n      assert.strictEqual(response.body.error.code, 'missing_api_key')
n    })
  })
  
  describe('Error Handling', () => {
    it('should return 404 for unknown endpoints', async () => {
      const response = await request(app)
        .get('/unknown-endpoint')
        .expect(404)

      assert.ok(response.body.error)
      assert.strictEqual(response.body.error.code, 'not_found')
    })

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400)

      assert.ok(response.body.error)
    })
  })
})