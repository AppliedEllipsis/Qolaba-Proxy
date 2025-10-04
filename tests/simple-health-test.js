import { describe, it, expect } from '@jest/globals';

describe('Qoloba Proxy Health Check', () => {
  it('should return health status via direct HTTP request', async () => {
    const response = await fetch('http://localhost:3000/health');
    
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    
    const body = await response.json();
    expect(body.status).toBe('healthy');
    expect(body.service).toBe('qoloba-proxy');
    expect(body.version).toBe('1.0.0');
  });
});