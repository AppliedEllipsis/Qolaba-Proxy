import request from 'supertest';
import app from '../src/index.js';

describe('GET /v1/models', () => {
  it('should return a 200 status and a non-empty models list', async () => {
    const res = await request(app).get('/v1/models');
    expect(res.status).toBe(200);
    // Expect the OpenAI-style response structure
    expect(res.body).toBeTruthy();
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('should return the correct response structure', async () => {
    const res = await request(app).get('/v1/models');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('object', 'list');
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('should return models with the correct structure', async () => {
    const res = await request(app).get('/v1/models');
    expect(res.status).toBe(200);
    
    if (res.body.data.length > 0) {
      const model = res.body.data[0];
      expect(model).toHaveProperty('id');
      expect(model).toHaveProperty('object', 'model');
      expect(model).toHaveProperty('created');
      expect(model).toHaveProperty('owned_by');
      expect(model).toHaveProperty('permission');
      expect(model).toHaveProperty('root');
      expect(model).toHaveProperty('parent');
      expect(Array.isArray(model.permission)).toBe(true);
    }
  });

  it('should include OpenAI models', async () => {
    const res = await request(app).get('/v1/models');
    expect(res.status).toBe(200);
    
    const openaiModels = res.body.data.filter(model => model.owned_by === 'openai');
    expect(openaiModels.length).toBeGreaterThan(0);
    
    const modelIds = openaiModels.map(model => model.id);
    expect(modelIds).toContain('gpt-4.1-mini-2025-04-14');
    expect(modelIds).toContain('gpt-4.1-2025-04-14');
    expect(modelIds).toContain('gpt-4o-mini');
    expect(modelIds).toContain('gpt-4o');
  });

  it('should include ClaudeAI models', async () => {
    const res = await request(app).get('/v1/models');
    expect(res.status).toBe(200);
    
    const claudeModels = res.body.data.filter(model => model.owned_by === 'claudeai');
    expect(claudeModels.length).toBeGreaterThan(0);
    
    const modelIds = claudeModels.map(model => model.id);
    expect(modelIds).toContain('claude-3-7-sonnet-latest');
    expect(modelIds).toContain('claude-opus-4-20250514');
    expect(modelIds).toContain('claude-sonnet-4-20250514');
  });

  it('should include GeminiAI models', async () => {
    const res = await request(app).get('/v1/models');
    expect(res.status).toBe(200);
    
    const geminiModels = res.body.data.filter(model => model.owned_by === 'geminiai');
    expect(geminiModels.length).toBeGreaterThan(0);
    
    const modelIds = geminiModels.map(model => model.id);
    expect(modelIds).toContain('gemini-2.5-pro');
    expect(modelIds).toContain('gemini-2.5-flash');
  });

  it('should include OpenRouterAI models', async () => {
    const res = await request(app).get('/v1/models');
    expect(res.status).toBe(200);
    
    const openrouterModels = res.body.data.filter(model => model.owned_by === 'openrouterai');
    expect(openrouterModels.length).toBeGreaterThan(0);
    
    const modelIds = openrouterModels.map(model => model.id);
    expect(modelIds).toContain('x-ai/grok-3-beta');
    expect(modelIds).toContain('x-ai/grok-3-mini-beta');
    expect(modelIds).toContain('perplexity/sonar-pro');
    expect(modelIds).toContain('deepseek/deepseek-chat');
  });

  it('should return the correct number of models', async () => {
    const res = await request(app).get('/v1/models');
    expect(res.status).toBe(200);
    
    // We expect 21 models in total (8 OpenAI + 3 ClaudeAI + 2 GeminiAI + 8 OpenRouterAI)
    expect(res.body.data.length).toBe(21);
  });
});