import type { Env } from '../index';

interface RequestConfig {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

class CircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private readonly threshold: number = 5;
  private readonly timeout: number = 60000;
  private readonly resetTimeout: number = 30000;
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }
    
    try {
      const result = await fn();
      
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failures = 0;
      }
      
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();
      
      if (this.failures >= this.threshold) {
        this.state = 'open';
      }
      
      throw error;
    }
  }
  
  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

const circuitBreaker = new CircuitBreaker();

export const rustApiService = {
  async fetchOpportunities(baseUrl: string, params: any): Promise<any[]> {
    return circuitBreaker.execute(async () => {
      const url = new URL(`${baseUrl}/api/opportunities`);
      
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
      
      const response = await fetchWithRetry(url.toString(), {
        timeout: 10000,
        retries: 3,
      });
      
      return response.opportunities || [];
    });
  },
  
  async getExecutionDetails(baseUrl: string, id: string): Promise<any> {
    return circuitBreaker.execute(async () => {
      const response = await fetchWithRetry(
        `${baseUrl}/api/executions/${id}`,
        { timeout: 5000, retries: 2 }
      );
      
      return response;
    });
  },
  
  async submitExecution(baseUrl: string, execution: any): Promise<any> {
    return circuitBreaker.execute(async () => {
      const response = await fetchWithRetry(
        `${baseUrl}/api/executions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(execution),
          timeout: 15000,
          retries: 1,
        }
      );
      
      return response;
    });
  },
  
  async checkTokenLiquidity(baseUrl: string, addresses: string[], chainId?: number): Promise<any> {
    return circuitBreaker.execute(async () => {
      const response = await fetchWithRetry(
        `${baseUrl}/api/tokens/liquidity`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addresses, chainId }),
          timeout: 8000,
          retries: 2,
        }
      );
      
      return response;
    });
  },
  
  async checkContractVerification(baseUrl: string, addresses: string[], chainId?: number): Promise<any> {
    return circuitBreaker.execute(async () => {
      const response = await fetchWithRetry(
        `${baseUrl}/api/tokens/verification`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addresses, chainId }),
          timeout: 5000,
          retries: 2,
        }
      );
      
      return response;
    });
  },
  
  async checkHolderDistribution(baseUrl: string, addresses: string[], chainId?: number): Promise<any> {
    return circuitBreaker.execute(async () => {
      const response = await fetchWithRetry(
        `${baseUrl}/api/tokens/holders`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addresses, chainId }),
          timeout: 8000,
          retries: 2,
        }
      );
      
      return response;
    });
  },
  
  async checkTradingVolume(baseUrl: string, addresses: string[], chainId?: number): Promise<any> {
    return circuitBreaker.execute(async () => {
      const response = await fetchWithRetry(
        `${baseUrl}/api/tokens/volume`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addresses, chainId }),
          timeout: 8000,
          retries: 2,
        }
      );
      
      return response;
    });
  },
  
  async checkRugPullIndicators(baseUrl: string, addresses: string[], chainId?: number): Promise<any> {
    return circuitBreaker.execute(async () => {
      const response = await fetchWithRetry(
        `${baseUrl}/api/tokens/rugpull-check`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addresses, chainId }),
          timeout: 10000,
          retries: 2,
        }
      );
      
      return response;
    });
  },
  
  async healthCheck(baseUrl: string): Promise<boolean> {
    try {
      const response = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      
      return response.ok;
    } catch {
      return false;
    }
  },
  
  getCircuitBreakerStatus() {
    return circuitBreaker.getState();
  },
};

async function fetchWithRetry(
  url: string,
  options: RequestInit & RequestConfig = {}
): Promise<any> {
  const { timeout = 10000, retries = 3, retryDelay = 1000, ...fetchOptions } = options;
  
  let lastError: Error | null = null;
  
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
        headers: {
          'User-Agent': 'ArbitrageX-CF-Worker/3.6.0',
          ...fetchOptions.headers,
        },
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json();
      }
      
      return await response.text();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      if (i < retries) {
        const delay = retryDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Failed after retries');
}