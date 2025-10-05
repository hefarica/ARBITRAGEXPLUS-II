#!/usr/bin/env tsx

import axios from 'axios';
import WebSocket from 'ws';

const API_BASE = process.env.API_BASE || 'http://localhost:5000';
const WS_URL = process.env.WS_URL || 'ws://localhost:5000/ws/alerts';

interface TestResult {
  step: string;
  passed: boolean;
  message: string;
  duration: number;
}

const results: TestResult[] = [];

function logStep(step: string, passed: boolean, message: string, duration: number) {
  const emoji = passed ? '✅' : '❌';
  console.log(`${emoji} ${step}: ${message} (${duration}ms)`);
  results.push({ step, passed, message, duration });
}

async function test(name: string, fn: () => Promise<void>): Promise<boolean> {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    logStep(name, true, 'PASSED', duration);
    return true;
  } catch (error: any) {
    const duration = Date.now() - start;
    logStep(name, false, error?.message || 'FAILED', duration);
    return false;
  }
}

async function waitForEvent(ws: WebSocket, eventType: string, timeout = 10000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for ${eventType} event`));
    }, timeout);

    const handler = (data: any) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === eventType) {
          clearTimeout(timer);
          ws.off('message', handler);
          resolve(message);
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };

    ws.on('message', handler);
  });
}

async function main() {
  console.log('\n🧪 E2E Test: Config Flow (upsert → reload → apply → WS emit)\n');
  console.log(`API: ${API_BASE}`);
  console.log(`WebSocket: ${WS_URL}\n`);

  let ws: WebSocket | null = null;
  let wsConnected = false;

  try {
    await test('Step 1: Connect to WebSocket', async () => {
      ws = new WebSocket(WS_URL);
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
        
        ws!.on('open', () => {
          clearTimeout(timeout);
          wsConnected = true;
          resolve();
        });
        
        ws!.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
      
      const connectionMsg = await waitForEvent(ws!, 'connection', 3000);
      if (connectionMsg.status !== 'connected') {
        throw new Error('WebSocket connection status not confirmed');
      }
    });

    await test('Step 2: Dry-run validation (no changes)', async () => {
      const response = await axios.post(`${API_BASE}/cf/engine/config/export`, {
        dryRun: true
      });
      
      if (!response.data.success || !response.data.dryRun) {
        throw new Error('Dry-run validation failed');
      }
      
      if (response.data.stats.totalChains < 1) {
        throw new Error('No chains in config');
      }
    });

    await test('Step 3: Upsert test asset', async () => {
      const testAsset = {
        chainId: 56,
        address: '0x0000000000000000000000000000000000000001',
        symbol: 'TEST',
        decimals: 18,
        name: 'Test Token E2E'
      };
      
      const response = await axios.post(`${API_BASE}/cf/engine/assets/upsert`, {
        assets: [testAsset]
      });
      
      if (!response.data.success) {
        throw new Error('Asset upsert failed');
      }
    });

    await test('Step 4: Wait for config.applied WebSocket event', async () => {
      if (!ws || !wsConnected) {
        throw new Error('WebSocket not connected');
      }
      
      const event = await waitForEvent(ws, 'config.applied', 15000);
      
      if (!event.version || !event.summary) {
        throw new Error('config.applied event missing required fields');
      }
      
      if (event.summary.chains < 1) {
        throw new Error('config.applied summary shows 0 chains');
      }
    });

    await test('Step 5: Validate config endpoint', async () => {
      const response = await axios.post(`${API_BASE}/cf/engine/config/validate`);
      
      if (!response.data.valid) {
        throw new Error(`Config validation failed: ${response.data.errors?.join(', ')}`);
      }
    });

    await test('Step 6: Get active config', async () => {
      const response = await axios.get(`${API_BASE}/cf/engine/config/active`);
      
      if (!response.data || !response.data.version) {
        throw new Error('No active config found');
      }
    });

    await test('Step 7: Get config snapshots', async () => {
      const response = await axios.get(`${API_BASE}/cf/engine/config/snapshots`);
      
      if (!Array.isArray(response.data) || response.data.length === 0) {
        throw new Error('No config snapshots found');
      }
    });

    await test('Step 8: Get engine state', async () => {
      const response = await axios.get(`${API_BASE}/cf/engine/state`);
      
      if (!response.data.chains || !Array.isArray(response.data.chains)) {
        throw new Error('Invalid engine state response');
      }
      
      if (response.data.chains.length === 0) {
        throw new Error('Engine state has 0 chains');
      }
    });

    await test('Step 9: Trigger full export', async () => {
      const response = await axios.post(`${API_BASE}/cf/engine/config/export`, {
        dryRun: false
      });
      
      if (!response.data.success) {
        throw new Error('Config export failed');
      }
      
      if (!response.data.version) {
        throw new Error('Config export missing version');
      }
    });

    await test('Step 10: Wait for second config.applied event', async () => {
      if (!ws || !wsConnected) {
        throw new Error('WebSocket not connected');
      }
      
      const event = await waitForEvent(ws, 'config.applied', 15000);
      
      if (!event.version) {
        throw new Error('Second config.applied event missing version');
      }
    });

  } catch (error: any) {
    console.error('\n❌ Test suite failed:', error.message);
  } finally {
    if (ws) {
      ws.close();
    }
  }

  console.log('\n📊 Test Results Summary:\n');
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const percentage = total > 0 ? ((passed / total) * 100).toFixed(1) : '0';
  
  console.log(`✅ Passed: ${passed}/${total} (${percentage}%)`);
  console.log(`❌ Failed: ${total - passed}/${total}`);
  console.log(`⏱️  Total duration: ${results.reduce((sum, r) => sum + r.duration, 0)}ms\n`);
  
  if (passed === total) {
    console.log('🎉 All tests passed! System is working correctly.\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Check the logs above for details.\n');
    process.exit(1);
  }
}

main().catch(console.error);
