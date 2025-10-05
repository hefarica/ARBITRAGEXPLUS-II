import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

interface DeFiLlamaProtocol {
  id: string;
  name: string;
  symbol: string;
  chains: string[];
  tvl: number;
  category: string;
}

interface ChainInfo {
  name: string;
  chainId: number;
  tvl: number;
}

interface DexInfo {
  name: string;
  tvl: number;
  category: string;
}

interface ScanConfig {
  chains: Array<{
    name: string;
    chainId: number;
    dexs: string[];
    topPairs: Array<{
      name: string;
      token0: string;
      token1: string;
    }>;
  }>;
  totalChains: number;
  totalDexs: number;
  lastUpdated: number;
}

const CHAIN_ID_MAP: Record<string, number> = {
  'Ethereum': 1,
  'BSC': 56,
  'Polygon': 137,
  'Avalanche': 43114,
  'Arbitrum': 42161,
  'Optimism': 10,
  'Fantom': 250,
  'Base': 8453,
  'Cronos': 25,
  'Gnosis': 100,
  'Celo': 42220,
  'Moonbeam': 1284,
  'Moonriver': 1285,
  'Harmony': 1666600000,
  'Aurora': 1313161554,
  'Metis': 1088,
  'Boba': 288,
  'Fuse': 122,
  'Kava': 2222,
  'opBNB': 204,
  'Scroll': 534352,
  'Linea': 59144,
  'zkSync Era': 324,
  'Polygon zkEVM': 1101,
  'Mantle': 5000,
  'Manta': 169,
  'Blast': 81457,
  'Mode': 34443,
  'Fraxtal': 252,
  'Taiko': 167000,
  'Zora': 7777777,
  'Canto': 7700,
  'Kroma': 255,
  'Core': 1116,
  'Telos': 40,
  'Rootstock': 30,
  'Merlin': 4200,
  'BOB': 60808,
};

const POPULAR_PAIRS: Record<string, Array<{name: string, token0: string, token1: string}>> = {
  'Ethereum': [
    { name: 'WETH/USDC', token0: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', token1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
    { name: 'WETH/USDT', token0: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', token1: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
    { name: 'WBTC/USDC', token0: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', token1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
  ],
  'BSC': [
    { name: 'WBNB/USDT', token0: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', token1: '0x55d398326f99059fF775485246999027B3197955' },
    { name: 'WBNB/BUSD', token0: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', token1: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56' },
  ],
  'Polygon': [
    { name: 'WMATIC/USDC', token0: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', token1: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' },
    { name: 'WETH/USDC', token0: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', token1: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' },
  ],
  'Arbitrum': [
    { name: 'WETH/USDC', token0: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', token1: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8' },
    { name: 'WETH/USDT', token0: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', token1: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' },
  ],
  'Optimism': [
    { name: 'WETH/USDC', token0: '0x4200000000000000000000000000000000000006', token1: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607' },
  ],
  'Base': [
    { name: 'WETH/USDC', token0: '0x4200000000000000000000000000000000000006', token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
  ],
  'Avalanche': [
    { name: 'WAVAX/USDC', token0: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', token1: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E' },
  ],
};

export class ChainDexFetcher {
  private configPath = path.join(process.cwd(), 'mev-scan-config.json');

  async fetchProtocols(): Promise<DeFiLlamaProtocol[]> {
    try {
      const response = await axios.get('https://api.llama.fi/protocols', {
        timeout: 10000,
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching DeFi Llama protocols:', error);
      return [];
    }
  }

  async generateScanConfig(minChains: number = 100): Promise<ScanConfig> {
    console.log('🔍 Fetching protocols from DeFi Llama...');
    const protocols = await this.fetchProtocols();

    const dexProtocols = protocols.filter(p => 
      p.category === 'Dexes' && p.tvl > 1000000
    );

    console.log(`📊 Found ${dexProtocols.length} DEX protocols with TVL > $1M`);

    const chainTvlMap = new Map<string, number>();
    const chainDexsMap = new Map<string, DexInfo[]>();

    dexProtocols.forEach(protocol => {
      protocol.chains.forEach(chain => {
        const currentTvl = chainTvlMap.get(chain) || 0;
        chainTvlMap.set(chain, currentTvl + protocol.tvl / protocol.chains.length);

        if (!chainDexsMap.has(chain)) {
          chainDexsMap.set(chain, []);
        }
        chainDexsMap.get(chain)!.push({
          name: protocol.name,
          tvl: protocol.tvl / protocol.chains.length,
          category: protocol.category,
        });
      });
    });

    const sortedChains = Array.from(chainTvlMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, minChains);

    console.log(`🔗 Processing top ${sortedChains.length} chains...`);

    const scanConfig: ScanConfig = {
      chains: [],
      totalChains: 0,
      totalDexs: 0,
      lastUpdated: Date.now(),
    };

    for (const [chainName, chainTvl] of sortedChains) {
      const chainId = CHAIN_ID_MAP[chainName];
      if (!chainId) {
        console.log(`⚠️  Skipping ${chainName} - no chain ID mapping`);
        continue;
      }

      const dexs = chainDexsMap.get(chainName) || [];
      const top5Dexs = dexs
        .sort((a, b) => b.tvl - a.tvl)
        .slice(0, 5)
        .map(d => d.name);

      const pairs = POPULAR_PAIRS[chainName] || [
        { name: 'Generic/USDC', token0: '0x0000000000000000000000000000000000000000', token1: '0x0000000000000000000000000000000000000000' }
      ];

      scanConfig.chains.push({
        name: chainName,
        chainId,
        dexs: top5Dexs,
        topPairs: pairs,
      });

      scanConfig.totalDexs += top5Dexs.length;
    }

    scanConfig.totalChains = scanConfig.chains.length;

    console.log(`✅ Generated config: ${scanConfig.totalChains} chains, ${scanConfig.totalDexs} DEXs`);

    await fs.writeFile(this.configPath, JSON.stringify(scanConfig, null, 2));
    console.log(`💾 Config saved to ${this.configPath}`);

    return scanConfig;
  }

  async loadConfig(): Promise<ScanConfig | null> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async getOrGenerateConfig(minChains: number = 100): Promise<ScanConfig> {
    const existingConfig = await this.loadConfig();
    
    if (existingConfig && (Date.now() - existingConfig.lastUpdated) < 24 * 60 * 60 * 1000) {
      console.log('📋 Using cached scan config');
      return existingConfig;
    }

    console.log('🔄 Generating fresh scan config...');
    return await this.generateScanConfig(minChains);
  }
}
