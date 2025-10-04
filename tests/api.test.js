import request from 'supertest';
import { describe, it, expect } from '@jest/globals';

describe('Qoloba Proxy API', () => {
  const agent = request('http://localhost:3000');

  describe('Health Checks', () => {
    it('should return health status', async () => {
      const response = await agent.get('/health').expect(200);
      expect(response.body.status).toBe('healthy');
    });
  });
});