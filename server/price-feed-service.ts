import axios from 'axios';

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: {
    address: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd?: string;
  liquidity: {
    usd: number;
    base: number;
    quote: number;
  };
  volume: {
    h24: number;
  };
  priceChange: {
    h24: number;
  };
}

interface DexScreenerResponse {
  schemaVersion: string;
  pairs: DexScreenerPair[];
}

interface PoolPrice {
  pairAddress: string;
  baseToQuotePrice: number;
  quoteToBasePrice: number;
  liquidityUsd: number;
  volume24h: number;
  lastUpdate: number;
}

export class PriceFeedService {
  private cache: Map<string, PoolPrice> = new Map();
  private readonly CACHE_TTL_MS = 30000;
  private readonly BASE_URL = 'https://api.dexscreener.com';
  private readonly MAX_BATCH_SIZE = 30;
  
  private chainIdToNetwork: Record<number, string> = {
    1: 'ethereum',
    56: 'bsc',
    137: 'polygon',
    42161: 'arbitrum',
    8453: 'base',
    10: 'optimism',
    25: 'cronos',
    100: 'gnosis',
    534352: 'scroll',
  };

  async getPoolPrices(chainId: number, pairAddresses: string[]): Promise<Map<string, PoolPrice>> {
    const network = this.chainIdToNetwork[chainId];
    if (!network) {
      throw new Error(`Unsupported chainId: ${chainId}`);
    }

    const uncachedAddresses: string[] = [];
    const result = new Map<string, PoolPrice>();
    const now = Date.now();

    for (const address of pairAddresses) {
      const cacheKey = `${chainId}:${address.toLowerCase()}`;
      const cached = this.cache.get(cacheKey);
      
      if (cached && (now - cached.lastUpdate) < this.CACHE_TTL_MS) {
        result.set(address, cached);
      } else {
        uncachedAddresses.push(address);
      }
    }

    if (uncachedAddresses.length === 0) {
      return result;
    }

    const batches = this.createBatches(uncachedAddresses, this.MAX_BATCH_SIZE);
    
    for (const batch of batches) {
      try {
        const prices = await this.fetchBatchPrices(network, batch);
        
        for (const [address, price] of prices.entries()) {
          const cacheKey = `${chainId}:${address.toLowerCase()}`;
          this.cache.set(cacheKey, price);
          result.set(address, price);
        }
        
        if (batches.length > 1) {
          await this.delay(200);
        }
      } catch (error) {
        console.error(`[PriceFeed] Failed to fetch batch for ${network}:`, error);
      }
    }

    return result;
  }

  private async fetchBatchPrices(network: string, addresses: string[]): Promise<Map<string, PoolPrice>> {
    const addressesStr = addresses.join(',');
    const url = `${this.BASE_URL}/latest/dex/pairs/${network}/${addressesStr}`;
    
    try {
      const response = await axios.get<DexScreenerResponse>(url, {
        timeout: 10000,
        headers: {
          'Accept': 'application/json',
        },
      });

      const result = new Map<string, PoolPrice>();
      
      if (!response.data.pairs || response.data.pairs.length === 0) {
        console.warn(`[PriceFeed] No pairs found for ${network}: ${addressesStr}`);
        return result;
      }

      for (const pair of response.data.pairs) {
        if (!pair.priceNative || !pair.liquidity) {
          continue;
        }

        const baseToQuotePrice = parseFloat(pair.priceNative);
        
        if (isNaN(baseToQuotePrice) || baseToQuotePrice <= 0) {
          continue;
        }

        const poolPrice: PoolPrice = {
          pairAddress: pair.pairAddress.toLowerCase(),
          baseToQuotePrice: baseToQuotePrice,
          quoteToBasePrice: 1 / baseToQuotePrice,
          liquidityUsd: pair.liquidity.usd || 0,
          volume24h: pair.volume?.h24 || 0,
          lastUpdate: Date.now(),
        };

        result.set(pair.pairAddress.toLowerCase(), poolPrice);
      }

      return result;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`[PriceFeed] API error for ${network}:`, {
          status: error.response?.status,
          message: error.message,
        });
      } else {
        console.error(`[PriceFeed] Unexpected error:`, error);
      }
      
      return new Map();
    }
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const priceFeedService = new PriceFeedService();
