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
  'Optimism': 10,
  'Cronos': 25,
  'Rootstock': 30,
  'Telos': 40,
  'LUKSO': 42,
  'Darwinia': 46,
  'XDC': 50,
  'BNB Smart Chain': 56,
  'BSC': 56,
  'Syscoin': 57,
  'EOS': 59,
  'GoChain': 60,
  'Ethereum Classic': 61,
  'OKXChain': 66,
  'OKC': 66,
  'Meter': 82,
  'Viction': 88,
  'Gnosis': 100,
  'Velas': 106,
  'ThunderCore': 108,
  'Fuse': 122,
  'Huobi ECO Chain': 128,
  'HECO': 128,
  'Polygon': 137,
  'Sonic': 146,
  'ShimmerEVM': 148,
  'Shimmer': 148,
  'Manta Pacific': 169,
  'Manta': 169,
  'Fantom': 250,
  'Boba': 288,
  'zkSync Era': 324,
  'zkSync': 324,
  'Theta': 361,
  'PulseChain': 369,
  'Metis': 1088,
  'Polygon zkEVM': 1101,
  'Core': 1116,
  'Moonbeam': 1284,
  'Moonriver': 1285,
  'Kava': 2222,
  'Mantle': 5000,
  'opBNB': 204,
  'OPBNB': 204,
  'Canto': 7700,
  'Base': 8453,
  'Gnosis Chiado': 10200,
  'Haqq': 11235,
  'EOS EVM': 17777,
  'Celo': 42220,
  'Avalanche': 43114,
  'Avax': 43114,
  'ZKFair': 42766,
  'Arbitrum': 42161,
  'Arbitrum One': 42161,
  'Arbitrum Nova': 42170,
  'Celo Alfajores': 44787,
  'REI': 47805,
  'Rei Network': 47805,
  'Linea': 59144,
  'Linea Mainnet': 59144,
  'Polygon Amoy': 80002,
  'Berachain': 80084,
  'Blast': 81457,
  'Taiko': 167000,
  'Taiko Mainnet': 167000,
  'X Layer': 196,
  'Mode': 34443,
  'Fraxtal': 252,
  'Kroma': 255,
  'Scroll': 534352,
  'Merlin': 4200,
  'BOB': 60808,
  'Zora': 7777777,
  'Aurora': 1313161554,
  'Harmony': 1666600000,
  'Palm': 11297108109,
  'Thundercore': 18,
  'BitTorrent': 199,
  'IoTeX': 4689,
  'Energy Web': 246,
  'Oasis Emerald': 42262,
  'Oasis Sapphire': 23294,
  'Ronin': 2020,
  'DFK': 53935,
  'Swimmer': 73772,
  'Klaytn': 8217,
  'Evmos': 9001,
  'SKALE': 1351057110,
  'Wemix': 1111,
  'Astar': 592,
  'Shiden': 336,
  'Oasis': 42262,
  'Milkomeda': 2001,
  'Conflux': 1030,
  'Ethernity': 183,
  'Redlight': 2611,
  'Vision': 888888888,
  'Neon EVM': 245022934,
  'Bittorrent Chain': 199,
  'Alvey': 3797,
  'Crystaleum': 103090,
  'Goerli': 5,
  'Sepolia': 11155111,
};

const POPULAR_PAIRS: Record<string, Array<{name: string, token0: string, token1: string, pairAddress: string}>> = {
  'Ethereum': [
    { name: 'WETH/USDC', token0: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', token1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', pairAddress: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640' },
    { name: 'WETH/USDT', token0: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', token1: '0xdAC17F958D2ee523a2206206994597C13D831ec7', pairAddress: '0x4e68ccd3e89f51c3074ca5072bbac773960dfa36' },
    { name: 'WBTC/USDC', token0: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', token1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', pairAddress: '0x99ac8ca7087fa4a2a1fb6357269965a2014abc35' },
  ],
  'BSC': [
    { name: 'WBNB/USDT', token0: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', token1: '0x55d398326f99059fF775485246999027B3197955', pairAddress: '0x16b9a82891338f9ba80e2d6970fdda79d1eb0dae' },
    { name: 'WBNB/BUSD', token0: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', token1: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', pairAddress: '0x58f876857a02d6762e0101bb5c46a8c1ed44dc16' },
  ],
  'Polygon': [
    { name: 'WMATIC/USDC', token0: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', token1: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', pairAddress: '0xa374094527e1673a86de625aa59517c5de346d32' },
    { name: 'WETH/USDC', token0: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', token1: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', pairAddress: '0x45dda9cb7c25131df268515131f647d726f50608' },
  ],
  'Arbitrum': [
    { name: 'WETH/USDC', token0: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', token1: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', pairAddress: '0xc31e54c7a869b9fcbecc14363cf510d1c41fa443' },
    { name: 'WETH/USDT', token0: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', token1: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', pairAddress: '0xcda53b1f66614552f834ceef361a8d12a0b8dad8' },
  ],
  'Optimism': [
    { name: 'WETH/USDC', token0: '0x4200000000000000000000000000000000000006', token1: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607', pairAddress: '0x85149247691df622eaf1a8bd0cafd40bc45154a9' },
  ],
  'Base': [
    { name: 'WETH/USDC', token0: '0x4200000000000000000000000000000000000006', token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', pairAddress: '0xd0b53d9277642d899df5c87a3966a349a798f224' },
  ],
  'Avalanche': [
    { name: 'WAVAX/USDC', token0: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', token1: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', pairAddress: '0xf4003f4efbe8691b60249e6afbd307abe7758adb' },
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
      p.category === 'Dexs' && p.tvl > 1000000
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
        { name: 'Generic/USDC', token0: '0x0000000000000000000000000000000000000000', token1: '0x0000000000000000000000000000000000000000', pairAddress: '0x0000000000000000000000000000000000000000' }
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
