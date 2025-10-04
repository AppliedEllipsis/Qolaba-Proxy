import { describe, it, expect } from '@jest/globals';
import http from 'http';

describe('Qoloba Proxy Health Check', () => {
  it('should return health status via direct HTTP request', async () => {
    const response = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port: 3000,
        path: '/health',
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      }, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const parsedData = JSON.parse(data);
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: parsedData
            });
          } catch (error) {
            reject(error);
          }
        });
      });
      
      req.on('error', reject);
      req.end();
    });
    
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body.status).toBe('healthy');
    expect(response.body.service).toBe('qoloba-proxy');
    expect(response.body.version).toBe('1.0.0');
  });
});