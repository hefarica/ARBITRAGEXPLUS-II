import type { Env } from '../index';

interface MetricData {
  type: string;
  [key: string]: any;
}

interface MetricOptions {
  timeframe: string;
  groupBy: string;
  filters?: Record<string, any>;
}

export async function recordMetric(
  analytics: AnalyticsEngineDataset,
  data: MetricData
): Promise<void> {
  try {
    analytics.writeDataPoint({
      blobs: [data.type],
      doubles: extractNumbers(data),
      indexes: [data.type],
    });
  } catch (error) {
    console.error('Failed to record metric:', error);
  }
}

export async function getMetrics(
  analytics: AnalyticsEngineDataset,
  options: MetricOptions
): Promise<any> {
  const metrics = {
    requests: 0,
    errors: 0,
    latency: [],
    successRate: 0,
    errorRate: 0,
    p50Latency: 0,
    p95Latency: 0,
    p99Latency: 0,
  };
  
  return metrics;
}

function extractNumbers(data: any): number[] {
  const numbers: number[] = [];
  
  for (const value of Object.values(data)) {
    if (typeof value === 'number') {
      numbers.push(value);
    }
  }
  
  return numbers;
}

export class MetricsCollector {
  private buffer: MetricData[] = [];
  private flushInterval: number = 5000;
  private maxBufferSize: number = 100;
  private timer: any = null;
  
  constructor(
    private analytics: AnalyticsEngineDataset,
    options?: {
      flushInterval?: number;
      maxBufferSize?: number;
    }
  ) {
    if (options?.flushInterval) {
      this.flushInterval = options.flushInterval;
    }
    if (options?.maxBufferSize) {
      this.maxBufferSize = options.maxBufferSize;
    }
    
    this.startTimer();
  }
  
  record(data: MetricData): void {
    this.buffer.push({
      ...data,
      timestamp: Date.now(),
    });
    
    if (this.buffer.length >= this.maxBufferSize) {
      this.flush();
    }
  }
  
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }
    
    const batch = [...this.buffer];
    this.buffer = [];
    
    for (const metric of batch) {
      await recordMetric(this.analytics, metric);
    }
  }
  
  private startTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    
    this.timer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }
  
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    
    this.flush();
  }
}

export class PerformanceMonitor {
  private startTime: number;
  private marks: Map<string, number> = new Map();
  private measures: Map<string, number> = new Map();
  
  constructor() {
    this.startTime = Date.now();
  }
  
  mark(name: string): void {
    this.marks.set(name, Date.now());
  }
  
  measure(name: string, startMark: string, endMark?: string): number {
    const start = this.marks.get(startMark);
    const end = endMark ? this.marks.get(endMark) : Date.now();
    
    if (!start) {
      throw new Error(`Start mark '${startMark}' not found`);
    }
    
    if (endMark && !end) {
      throw new Error(`End mark '${endMark}' not found`);
    }
    
    const duration = (end || Date.now()) - start;
    this.measures.set(name, duration);
    
    return duration;
  }
  
  getElapsedTime(): number {
    return Date.now() - this.startTime;
  }
  
  getMeasures(): Record<string, number> {
    const result: Record<string, number> = {};
    
    this.measures.forEach((value, key) => {
      result[key] = value;
    });
    
    return result;
  }
  
  reset(): void {
    this.startTime = Date.now();
    this.marks.clear();
    this.measures.clear();
  }
}

export class ErrorTracker {
  private errors: Array<{
    error: Error;
    context: any;
    timestamp: number;
  }> = [];
  
  private maxErrors: number = 100;
  
  track(error: Error, context?: any): void {
    this.errors.push({
      error,
      context,
      timestamp: Date.now(),
    });
    
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }
  }
  
  getErrors(since?: number): any[] {
    if (since) {
      return this.errors.filter(e => e.timestamp >= since);
    }
    
    return this.errors;
  }
  
  getErrorRate(windowMs: number = 60000): number {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    const errorsInWindow = this.errors.filter(
      e => e.timestamp >= windowStart
    );
    
    return errorsInWindow.length;
  }
  
  clear(): void {
    this.errors = [];
  }
  
  getStatistics(): any {
    const errorTypes: Record<string, number> = {};
    
    this.errors.forEach(({ error }) => {
      const type = error.name || 'Unknown';
      errorTypes[type] = (errorTypes[type] || 0) + 1;
    });
    
    return {
      total: this.errors.length,
      types: errorTypes,
      rate: this.getErrorRate(),
    };
  }
}

export async function trackApiCall(
  env: Env,
  endpoint: string,
  method: string,
  fn: () => Promise<any>
): Promise<any> {
  const monitor = new PerformanceMonitor();
  monitor.mark('start');
  
  try {
    const result = await fn();
    
    monitor.mark('end');
    const duration = monitor.measure('duration', 'start', 'end');
    
    await recordMetric(env.METRICS, {
      type: 'api_call',
      endpoint,
      method,
      status: 'success',
      duration,
    });
    
    return result;
  } catch (error) {
    monitor.mark('error');
    const duration = monitor.measure('duration', 'start', 'error');
    
    await recordMetric(env.METRICS, {
      type: 'api_call',
      endpoint,
      method,
      status: 'error',
      duration,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    throw error;
  }
}

export function createLogger(context: string) {
  return {
    debug(message: string, data?: any) {
      console.log(`[DEBUG] [${context}] ${message}`, data || '');
    },
    
    info(message: string, data?: any) {
      console.log(`[INFO] [${context}] ${message}`, data || '');
    },
    
    warn(message: string, data?: any) {
      console.warn(`[WARN] [${context}] ${message}`, data || '');
    },
    
    error(message: string, error?: Error | any) {
      console.error(`[ERROR] [${context}] ${message}`, error || '');
    },
  };
}

export class HealthChecker {
  private checks: Map<string, () => Promise<boolean>> = new Map();
  
  register(name: string, check: () => Promise<boolean>): void {
    this.checks.set(name, check);
  }
  
  async checkAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    
    for (const [name, check] of this.checks) {
      try {
        results[name] = await check();
      } catch {
        results[name] = false;
      }
    }
    
    return results;
  }
  
  async isHealthy(): Promise<boolean> {
    const results = await this.checkAll();
    return Object.values(results).every(v => v === true);
  }
}