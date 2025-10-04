import type { Env } from '../index';

export const kvService = {
  async get(kv: KVNamespace, key: string): Promise<any | null> {
    try {
      const value = await kv.get(key, 'json');
      return value;
    } catch (error) {
      console.error(`Failed to get KV key ${key}:`, error);
      return null;
    }
  },
  
  async set(
    kv: KVNamespace,
    key: string,
    value: any,
    ttlSeconds?: number
  ): Promise<void> {
    try {
      const options: KVNamespacePutOptions = {};
      
      if (ttlSeconds && ttlSeconds > 0) {
        options.expirationTtl = ttlSeconds;
      }
      
      await kv.put(key, JSON.stringify(value), options);
    } catch (error) {
      console.error(`Failed to set KV key ${key}:`, error);
      throw error;
    }
  },
  
  async delete(kv: KVNamespace, key: string): Promise<void> {
    try {
      await kv.delete(key);
    } catch (error) {
      console.error(`Failed to delete KV key ${key}:`, error);
      throw error;
    }
  },
  
  async list(
    kv: KVNamespace,
    prefix?: string,
    limit: number = 1000
  ): Promise<KVNamespaceListResult<unknown>> {
    try {
      const options: KVNamespaceListOptions = { limit };
      
      if (prefix) {
        options.prefix = prefix;
      }
      
      return await kv.list(options);
    } catch (error) {
      console.error(`Failed to list KV keys:`, error);
      throw error;
    }
  },
  
  async getMetadata(kv: KVNamespace, key: string): Promise<any | null> {
    try {
      const { metadata } = await kv.getWithMetadata(key, 'json');
      return metadata;
    } catch (error) {
      console.error(`Failed to get metadata for KV key ${key}:`, error);
      return null;
    }
  },
  
  async setWithMetadata(
    kv: KVNamespace,
    key: string,
    value: any,
    metadata: any,
    ttlSeconds?: number
  ): Promise<void> {
    try {
      const options: KVNamespacePutOptions = {
        metadata,
      };
      
      if (ttlSeconds && ttlSeconds > 0) {
        options.expirationTtl = ttlSeconds;
      }
      
      await kv.put(key, JSON.stringify(value), options);
    } catch (error) {
      console.error(`Failed to set KV key ${key} with metadata:`, error);
      throw error;
    }
  },
  
  async increment(
    kv: KVNamespace,
    key: string,
    delta: number = 1
  ): Promise<number> {
    let retries = 3;
    
    while (retries > 0) {
      try {
        const current = await kv.get(key);
        const value = current ? parseInt(current) : 0;
        const newValue = value + delta;
        
        await kv.put(key, newValue.toString(), {
          expirationTtl: 3600,
        });
        
        return newValue;
      } catch (error) {
        retries--;
        
        if (retries === 0) {
          console.error(`Failed to increment KV key ${key}:`, error);
          throw error;
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return 0;
  },
  
  async batch(
    kv: KVNamespace,
    operations: Array<{
      type: 'get' | 'set' | 'delete';
      key: string;
      value?: any;
      ttl?: number;
    }>
  ): Promise<any[]> {
    const results = [];
    
    for (const op of operations) {
      try {
        switch (op.type) {
          case 'get':
            results.push(await kvService.get(kv, op.key));
            break;
          case 'set':
            await kvService.set(kv, op.key, op.value, op.ttl);
            results.push(true);
            break;
          case 'delete':
            await kvService.delete(kv, op.key);
            results.push(true);
            break;
        }
      } catch (error) {
        results.push(null);
      }
    }
    
    return results;
  },
  
  async expire(kv: KVNamespace, key: string, ttlSeconds: number): Promise<void> {
    const value = await kv.get(key, 'json');
    
    if (value !== null) {
      await kv.put(key, JSON.stringify(value), {
        expirationTtl: ttlSeconds,
      });
    }
  },
  
  async exists(kv: KVNamespace, key: string): Promise<boolean> {
    const value = await kv.get(key);
    return value !== null;
  },
  
  async clear(kv: KVNamespace, prefix: string): Promise<number> {
    let deleted = 0;
    let cursor: string | undefined;
    
    do {
      const result = await kv.list({
        prefix,
        limit: 1000,
        cursor,
      });
      
      const deletePromises = result.keys.map(key => kv.delete(key.name));
      await Promise.all(deletePromises);
      
      deleted += result.keys.length;
      cursor = result.list_complete ? undefined : result.cursor;
    } while (cursor);
    
    return deleted;
  },
  
  createCache<T>(
    kv: KVNamespace,
    prefix: string,
    defaultTtl: number = 300
  ) {
    return {
      async get(key: string): Promise<T | null> {
        return kvService.get(kv, `${prefix}:${key}`);
      },
      
      async set(key: string, value: T, ttl?: number): Promise<void> {
        return kvService.set(kv, `${prefix}:${key}`, value, ttl || defaultTtl);
      },
      
      async delete(key: string): Promise<void> {
        return kvService.delete(kv, `${prefix}:${key}`);
      },
      
      async clear(): Promise<number> {
        return kvService.clear(kv, `${prefix}:`);
      },
      
      async memoize<R>(
        key: string,
        fn: () => Promise<R>,
        ttl?: number
      ): Promise<R> {
        const cached = await this.get(key);
        
        if (cached !== null) {
          return cached as unknown as R;
        }
        
        const result = await fn();
        await this.set(key, result as unknown as T, ttl);
        
        return result;
      },
    };
  },
};