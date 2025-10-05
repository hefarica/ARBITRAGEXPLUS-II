import { engineConfigService } from './engine-config-service';
import { priceFeedService } from './price-feed-service';

interface Pool {
  chainId: number;
  dexId: string;
  pairAddress: string;
  token0: string;
  token1: string;
  feeBps: number;
  reserve0?: string;
  reserve1?: string;
  liquidity?: string;
  realPrice?: number;
}

interface ArbitrageRoute {
  ok: boolean;
  chain_id: number;
  route: string[];
  legs: number;
  input_token: string;
  amount_in: number;
  amount_out: number;
  net_pnl: number;
  net_pnl_bps: number;
  gas_cost_eth: number;
  reason: string;
  atomic_safe: boolean;
  execution?: string;
}

export class ArbitrageSimulator {
  private readonly MIN_PNL_BPS = 5;
  private readonly MAX_GAS_COST_ETH = 0.0005;
  private readonly GAS_PRICE_GWEI = 20;
  private readonly ETH_PRICE_USD = 3500;

  async findOpportunities(chainId?: number): Promise<ArbitrageRoute[]> {
    const opportunities: ArbitrageRoute[] = [];
    
    const config = await engineConfigService.exportToJson();
    const targetChains = chainId 
      ? config.chains.filter(c => c.chainId === chainId)
      : config.chains;

    for (const chain of targetChains) {
      const chainPools = this.getChainPools(chain);
      
      const twoLegOpps = await this.find2LegOpportunities(chain.chainId, chainPools);
      opportunities.push(...twoLegOpps);

      const threeLegOpps = await this.find3LegOpportunities(chain.chainId, chainPools);
      opportunities.push(...threeLegOpps);
    }

    return opportunities
      .filter(opp => 
        opp.net_pnl_bps > this.MIN_PNL_BPS && 
        opp.gas_cost_eth < this.MAX_GAS_COST_ETH &&
        opp.atomic_safe
      )
      .sort((a, b) => b.net_pnl_bps - a.net_pnl_bps);
  }

  private getChainPools(chain: any): Pool[] {
    if (!chain.pools || chain.pools.length === 0) {
      return [];
    }

    return chain.pools.map((p: any) => ({
      chainId: chain.chainId,
      dexId: p.dexId || 'unknown',
      pairAddress: p.pairAddress,
      token0: p.base || '',
      token1: p.quote || '',
      feeBps: p.feeBps || 30,
    }));
  }

  private async find2LegOpportunities(chainId: number, pools: Pool[]): Promise<ArbitrageRoute[]> {
    const opportunities: ArbitrageRoute[] = [];
    const tokenPairs = new Map<string, Pool[]>();

    const pairAddresses = pools.map(p => p.pairAddress);
    let pricesMap: Map<string, any>;
    
    try {
      pricesMap = await priceFeedService.getPoolPrices(chainId, pairAddresses);
      
      for (const pool of pools) {
        const priceData = pricesMap.get(pool.pairAddress.toLowerCase());
        if (priceData) {
          pool.realPrice = priceData.baseToQuotePrice;
        }
      }
    } catch (error) {
      console.error(`[ArbitrageSimulator] Failed to fetch prices for chain ${chainId}:`, error);
      return [];
    }

    for (const pool of pools) {
      if (!pool.realPrice) continue;
      
      const key = this.getTokenPairKey(pool.token0, pool.token1);
      if (!tokenPairs.has(key)) {
        tokenPairs.set(key, []);
      }
      tokenPairs.get(key)!.push(pool);
    }

    for (const [pairKey, poolsForPair] of tokenPairs) {
      if (poolsForPair.length < 2) continue;

      for (let i = 0; i < poolsForPair.length; i++) {
        for (let j = i + 1; j < poolsForPair.length; j++) {
          const pool1 = poolsForPair[i];
          const pool2 = poolsForPair[j];

          if (pool1.dexId === pool2.dexId) continue;
          if (!pool1.realPrice || !pool2.realPrice) continue;

          const opportunity = await this.simulate2LegRoute(chainId, pool1, pool2);
          if (opportunity) {
            opportunities.push(opportunity);
          }
        }
      }
    }

    return opportunities;
  }

  private async simulate2LegRoute(
    chainId: number,
    pool1: Pool,
    pool2: Pool
  ): Promise<ArbitrageRoute | null> {
    if (!pool1.realPrice || !pool2.realPrice) {
      return null;
    }

    const price1 = pool1.realPrice;
    const price2 = pool2.realPrice;
    
    const priceDiffBps = Math.abs((price1 - price2) / Math.min(price1, price2)) * 10000;
    
    if (priceDiffBps < 1) {
      return null;
    }

    const testAmounts = [0.01, 0.05, 0.1, 0.5, 1.0];
    let bestResult: ArbitrageRoute | null = null;

    for (const amountIn of testAmounts) {
      const result = this.calculate2LegRoute(pool1, pool2, amountIn, chainId);
      
      if (result && (!bestResult || result.net_pnl_bps > bestResult.net_pnl_bps)) {
        bestResult = result;
      }
    }

    return bestResult;
  }

  private calculate2LegRoute(
    pool1: Pool,
    pool2: Pool,
    amountIn: number,
    chainId: number
  ): ArbitrageRoute | null {
    if (!pool1.realPrice || !pool2.realPrice) {
      return null;
    }

    const fee1 = 1 - (pool1.feeBps / 10000);
    const fee2 = 1 - (pool2.feeBps / 10000);
    const slippage = 1 - (amountIn * 0.0001);

    const afterFirstSwap = amountIn * pool1.realPrice * fee1 * slippage;
    const afterSecondSwap = afterFirstSwap / pool2.realPrice * fee2 * slippage;

    const gasCost = this.estimateGasCost(2, chainId);
    const netPnl = afterSecondSwap - amountIn - gasCost;
    const netPnlBps = (netPnl / amountIn) * 10000;

    if (netPnlBps <= this.MIN_PNL_BPS) {
      return null;
    }

    const route = [
      `${pool1.dexId}:${pool1.pairAddress.substring(0, 8)}/${pool1.feeBps}`,
      `${pool2.dexId}:${pool2.pairAddress.substring(0, 8)}/${pool2.feeBps}`,
    ];

    return {
      ok: true,
      chain_id: chainId,
      route,
      legs: 2,
      input_token: 'WBNB',
      amount_in: amountIn,
      amount_out: afterSecondSwap,
      net_pnl: netPnl,
      net_pnl_bps: Math.round(netPnlBps),
      gas_cost_eth: gasCost,
      reason: 'INTER-DEX',
      atomic_safe: true,
      execution: 'flashloan',
    };
  }

  private async find3LegOpportunities(chainId: number, pools: Pool[]): Promise<ArbitrageRoute[]> {
    const opportunities: ArbitrageRoute[] = [];
    
    const pairAddresses = pools.map(p => p.pairAddress);
    
    try {
      const pricesMap = await priceFeedService.getPoolPrices(chainId, pairAddresses);
      
      for (const pool of pools) {
        const priceData = pricesMap.get(pool.pairAddress.toLowerCase());
        if (priceData) {
          pool.realPrice = priceData.baseToQuotePrice;
        }
      }
    } catch (error) {
      console.error(`[ArbitrageSimulator] Failed to fetch prices for 3-leg on chain ${chainId}:`, error);
      return [];
    }
    
    const poolsWithPrices = pools.filter(p => p.realPrice);
    const tokenGraph = this.buildTokenGraph(poolsWithPrices);
    
    for (const startToken of tokenGraph.keys()) {
      const routes = this.findCircularRoutes(startToken, tokenGraph, 3);
      
      for (const route of routes) {
        const routePools = this.getPoolsForRoute(route, poolsWithPrices);
        if (routePools.length !== 3) continue;
        if (routePools.some(p => !p.realPrice)) continue;

        const testAmounts = [0.01, 0.05, 0.1];
        for (const amountIn of testAmounts) {
          const result = this.calculateRoute(routePools, amountIn, chainId);
          
          if (result && result.net_pnl > 0.0005) {
            opportunities.push(result);
          }
        }
      }
    }

    return opportunities;
  }

  private calculateRoute(
    pools: Pool[],
    amountIn: number,
    chainId: number
  ): ArbitrageRoute | null {
    let currentAmount = amountIn;
    const route: string[] = [];
    let inputToken = '';

    for (let i = 0; i < pools.length; i++) {
      const pool = pools[i];
      
      if (i === 0) {
        inputToken = this.getTokenSymbol(pool.token0);
      }

      const amountOut = this.simulateSwap(currentAmount, pool);
      currentAmount = amountOut;
      
      route.push(`${pool.dexId}:${pool.pairAddress.substring(0, 8)}/${pool.feeBps}`);
    }

    const gasCost = this.estimateGasCost(pools.length, chainId);
    const netPnl = currentAmount - amountIn - gasCost;
    const netPnlBps = (netPnl / amountIn) * 10000;

    if (netPnlBps <= this.MIN_PNL_BPS) {
      return null;
    }

    const reason = this.determineReason(pools);
    
    return {
      ok: true,
      chain_id: chainId,
      route,
      legs: pools.length,
      input_token: inputToken,
      amount_in: amountIn,
      amount_out: currentAmount,
      net_pnl: netPnl,
      net_pnl_bps: Math.round(netPnlBps),
      gas_cost_eth: gasCost,
      reason,
      atomic_safe: true,
      execution: pools.length === 2 ? 'flashloan' : 'atomic_multicall',
    };
  }

  private simulateSwap(amountIn: number, pool: Pool): number {
    if (!pool.realPrice || pool.realPrice <= 0) {
      return 0;
    }

    const feeMultiplier = 1 - (pool.feeBps / 10000);
    
    const slippageFactor = 1 - (amountIn * 0.0001);
    
    const amountOut = amountIn * pool.realPrice * feeMultiplier * slippageFactor;
    
    return amountOut;
  }

  private estimateGasCost(legs: number, chainId: number): number {
    const baseGas = 21000;
    const swapGas = legs === 2 ? 120000 : 100000;
    const flashloanGas = legs > 1 ? 30000 : 0;
    
    const totalGas = baseGas + (swapGas * legs) + flashloanGas;
    
    const gasPriceGwei = this.getChainGasPrice(chainId);
    const gasCostEth = (totalGas * gasPriceGwei) / 1e9;
    
    return Math.min(gasCostEth, this.MAX_GAS_COST_ETH * 0.8);
  }

  private getChainGasPrice(chainId: number): number {
    const gasPrices: Record<number, number> = {
      1: 15,
      56: 3,
      137: 30,
      42161: 0.1,
      8453: 0.05,
      10: 0.1,
      25: 3,
      100: 1,
      534352: 0.05,
    };
    
    return gasPrices[chainId] || 10;
  }

  private determineReason(pools: Pool[]): string {
    const reasons: string[] = [];
    
    const dexSet = new Set(pools.map(p => p.dexId));
    if (dexSet.size > 1) {
      reasons.push('INTER-DEX');
    }

    const feeVariance = Math.max(...pools.map(p => p.feeBps)) - Math.min(...pools.map(p => p.feeBps));
    if (feeVariance > 20) {
      reasons.push('FEE_ARBITRAGE');
    }

    if (pools.some(p => p.dexId.includes('v3') || p.dexId.includes('aerodrome'))) {
      reasons.push('TWAP_DELAY');
    }

    return reasons.length > 0 ? reasons.join(' + ') : 'PRICE_INEFFICIENCY';
  }

  private getTokenSymbol(address: string): string {
    const commonTokens: Record<string, string> = {
      '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'WETH',
      '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c': 'WBNB',
      '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270': 'WMATIC',
      '0x4200000000000000000000000000000000000006': 'WETH',
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
      '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT',
    };
    
    return commonTokens[address.toLowerCase()] || 'WETH';
  }

  private getTokenPairKey(token0: string, token1: string): string {
    return [token0, token1].sort().join('-');
  }

  private buildTokenGraph(pools: Pool[]): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();
    
    for (const pool of pools) {
      if (!graph.has(pool.token0)) {
        graph.set(pool.token0, new Set());
      }
      if (!graph.has(pool.token1)) {
        graph.set(pool.token1, new Set());
      }
      
      graph.get(pool.token0)!.add(pool.token1);
      graph.get(pool.token1)!.add(pool.token0);
    }
    
    return graph;
  }

  private findCircularRoutes(
    startToken: string,
    graph: Map<string, Set<string>>,
    maxLegs: number
  ): string[][] {
    const routes: string[][] = [];
    
    const dfs = (current: string, path: string[], visited: Set<string>) => {
      if (path.length === maxLegs) {
        const neighbors = graph.get(current) || new Set();
        if (neighbors.has(startToken)) {
          routes.push([...path, startToken]);
        }
        return;
      }
      
      const neighbors = graph.get(current) || new Set();
      for (const next of neighbors) {
        if (!visited.has(next)) {
          visited.add(next);
          dfs(next, [...path, next], visited);
          visited.delete(next);
        }
      }
    };
    
    dfs(startToken, [startToken], new Set([startToken]));
    return routes.slice(0, 10);
  }

  private getPoolsForRoute(route: string[], pools: Pool[]): Pool[] {
    const routePools: Pool[] = [];
    
    for (let i = 0; i < route.length - 1; i++) {
      const token0 = route[i];
      const token1 = route[i + 1];
      
      const pool = pools.find(p => 
        (p.token0 === token0 && p.token1 === token1) ||
        (p.token0 === token1 && p.token1 === token0)
      );
      
      if (pool) {
        routePools.push(pool);
      }
    }
    
    return routePools;
  }
}

export const arbitrageSimulator = new ArbitrageSimulator();
