import axios from 'axios';

const CHAIN_NAME_MAP: Record<number, string> = {
  1: 'ethereum',
  56: 'bsc',
  137: 'polygon',
  8453: 'base',
  42161: 'arbitrum',
  10: 'optimism',
  43114: 'avalanche',
  250: 'fantom',
  25: 'cronos',
  100: 'gnosis',
  534352: 'scroll',
  80094: 'berachain'
};

const DEXSCREENER_CHAIN_MAP: Record<number, string> = {
  1: 'ethereum',
  56: 'bsc',
  137: 'polygon',
  8453: 'base',
  42161: 'arbitrum',
  10: 'optimism',
  43114: 'avalanche',
  250: 'fantom',
  25: 'cronos',
  100: 'gnosis',
  534352: 'scroll'
};

export interface PoolValidationResult {
  isValid: boolean;
  poolAddress?: string;
  dexId?: string;
  liquidity?: number;
  volume24h?: number;
  baseToken?: string;
  quoteToken?: string;
  error?: string;
  source?: 'dexscreener' | 'geckoterminal' | 'cache';
  warnings?: string[];
}

class PoolValidatorService {
  private cache: Map<string, PoolValidationResult> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000;

  private getCacheKey(chainId: number, poolAddress: string): string {
    return `${chainId}:${poolAddress.toLowerCase()}`;
  }

  async validatePoolAddress(
    chainId: number,
    poolAddress: string,
    baseTokenAddress?: string,
    quoteTokenAddress?: string
  ): Promise<PoolValidationResult> {
    const cacheKey = this.getCacheKey(chainId, poolAddress);
    
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - (cached as any).timestamp < this.CACHE_TTL) {
      return { ...cached, source: 'cache' };
    }

    const warnings: string[] = [];

    const dexScreenerResult = await this.validateWithDexScreener(chainId, poolAddress, baseTokenAddress, quoteTokenAddress);
    if (dexScreenerResult.isValid) {
      if (dexScreenerResult.liquidity && dexScreenerResult.liquidity < 1000) {
        warnings.push(`⚠️ Low liquidity: $${dexScreenerResult.liquidity.toLocaleString()}`);
      }
      if (dexScreenerResult.volume24h !== undefined && dexScreenerResult.volume24h < 100) {
        warnings.push(`⚠️ Low 24h volume: $${dexScreenerResult.volume24h.toLocaleString()}`);
      }
      
      const result = { ...dexScreenerResult, warnings, source: 'dexscreener' as const };
      (result as any).timestamp = Date.now();
      this.cache.set(cacheKey, result);
      return result;
    }

    const geckoResult = await this.validateWithGeckoTerminal(chainId, poolAddress);
    if (geckoResult.isValid) {
      const result = { ...geckoResult, warnings, source: 'geckoterminal' as const };
      (result as any).timestamp = Date.now();
      this.cache.set(cacheKey, result);
      return result;
    }

    return {
      isValid: false,
      error: 'Pool address not found in DexScreener or GeckoTerminal APIs',
      warnings: ['❌ Pool no verificado en ninguna API externa - PELIGRO']
    };
  }

  private async validateWithDexScreener(
    chainId: number,
    poolAddress: string,
    baseTokenAddress?: string,
    quoteTokenAddress?: string
  ): Promise<PoolValidationResult> {
    try {
      const chainName = DEXSCREENER_CHAIN_MAP[chainId];
      if (!chainName) {
        return { isValid: false, error: `Chain ${chainId} not supported by DexScreener` };
      }

      const url = `https://api.dexscreener.com/latest/dex/pairs/${chainName}/${poolAddress}`;
      const response = await axios.get(url, { timeout: 10000 });

      if (response.data && response.data.pairs && response.data.pairs.length > 0) {
        const pair = response.data.pairs[0];

        if (baseTokenAddress && quoteTokenAddress) {
          const baseMatch = pair.baseToken?.address?.toLowerCase() === baseTokenAddress.toLowerCase();
          const quoteMatch = pair.quoteToken?.address?.toLowerCase() === quoteTokenAddress.toLowerCase();
          
          if (!baseMatch || !quoteMatch) {
            return {
              isValid: false,
              error: `Token mismatch: Expected ${baseTokenAddress}/${quoteTokenAddress}, got ${pair.baseToken?.address}/${pair.quoteToken?.address}`
            };
          }
        }

        return {
          isValid: true,
          poolAddress: pair.pairAddress,
          dexId: pair.dexId,
          liquidity: pair.liquidity?.usd,
          volume24h: pair.volume?.h24,
          baseToken: pair.baseToken?.symbol,
          quoteToken: pair.quoteToken?.symbol
        };
      }

      return { isValid: false, error: 'Pool not found in DexScreener' };
    } catch (error: any) {
      return { isValid: false, error: `DexScreener API error: ${error.message}` };
    }
  }

  private async validateWithGeckoTerminal(chainId: number, poolAddress: string): Promise<PoolValidationResult> {
    try {
      const networkId = CHAIN_NAME_MAP[chainId];
      if (!networkId) {
        return { isValid: false, error: `Chain ${chainId} not supported by GeckoTerminal` };
      }

      const url = `https://api.geckoterminal.com/api/v2/networks/${networkId}/pools/${poolAddress}`;
      const response = await axios.get(url, { 
        headers: { 'accept': 'application/json' },
        timeout: 10000
      });

      if (response.status === 200 && response.data?.data) {
        const pool = response.data.data;
        const attrs = pool.attributes;

        return {
          isValid: true,
          poolAddress: attrs.address,
          dexId: attrs.dex_id || 'unknown',
          liquidity: parseFloat(attrs.reserve_in_usd || '0'),
          volume24h: parseFloat(attrs.volume_usd?.h24 || '0'),
          baseToken: attrs.name?.split('/')[0]?.trim(),
          quoteToken: attrs.name?.split('/')[1]?.trim()
        };
      }

      return { isValid: false, error: 'Pool not found in GeckoTerminal' };
    } catch (error: any) {
      if (error.response?.status === 404) {
        return { isValid: false, error: 'Pool not found (404)' };
      }
      return { isValid: false, error: `GeckoTerminal API error: ${error.message}` };
    }
  }

  async findCorrectPoolAddress(
    chainId: number,
    baseTokenAddress: string,
    quoteTokenAddress: string,
    minLiquidity: number = 1000
  ): Promise<PoolValidationResult[]> {
    try {
      const chainName = DEXSCREENER_CHAIN_MAP[chainId];
      if (!chainName) {
        return [];
      }

      const url = `https://api.dexscreener.com/latest/dex/tokens/${baseTokenAddress}`;
      const response = await axios.get(url, { timeout: 10000 });

      if (response.data?.pairs) {
        const matchingPairs = response.data.pairs
          .filter((pair: any) => 
            pair.chainId === chainName &&
            pair.quoteToken?.address?.toLowerCase() === quoteTokenAddress.toLowerCase() &&
            (pair.liquidity?.usd || 0) >= minLiquidity
          )
          .sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))
          .slice(0, 5)
          .map((pair: any) => ({
            isValid: true,
            poolAddress: pair.pairAddress,
            dexId: pair.dexId,
            liquidity: pair.liquidity?.usd,
            volume24h: pair.volume?.h24,
            baseToken: pair.baseToken?.symbol,
            quoteToken: pair.quoteToken?.symbol,
            source: 'dexscreener' as const
          }));

        return matchingPairs;
      }

      return [];
    } catch (error: any) {
      console.error('Error finding pools:', error.message);
      return [];
    }
  }

  clearCache() {
    this.cache.clear();
  }
}

export const poolValidator = new PoolValidatorService();
