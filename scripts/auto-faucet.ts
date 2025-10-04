#!/usr/bin/env tsx
import axios from 'axios';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const WALLET_ADDRESS = process.env.TEST_WALLET_ADDRESS || '0xDbd95EBC41393780067E4624Eb457b26a2dee537';

interface FaucetConfig {
  name: string;
  network: string;
  url: string;
  method: 'POST' | 'GET';
  headers?: Record<string, string>;
  data?: any;
  requiresAuth?: boolean;
  amount: string;
  cooldown: string;
}

const FAUCETS: FaucetConfig[] = [
  {
    name: 'Mumbai (Polygon)',
    network: 'mumbai',
    url: 'https://api.faucet.matic.network/sendTokens',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://faucet.polygon.technology',
      'Referer': 'https://faucet.polygon.technology/'
    },
    data: {
      network: 'mumbai',
      address: WALLET_ADDRESS,
      token: 'maticToken'
    },
    amount: '0.5 MATIC',
    cooldown: '24h'
  },
  {
    name: 'Goerli (Alchemy)',
    network: 'goerli',
    url: `https://goerlifaucet.com/api/faucet`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    data: {
      address: WALLET_ADDRESS
    },
    amount: '0.25 ETH',
    cooldown: '24h',
    requiresAuth: false
  },
  {
    name: 'Arbitrum Sepolia',
    network: 'arbitrum-sepolia',
    url: 'https://faucet.quicknode.com/arbitrum/sepolia',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    data: {
      address: WALLET_ADDRESS,
      token: 'ETH'
    },
    amount: '0.001 ETH',
    cooldown: '12h',
    requiresAuth: false
  }
];

const RPCS: Record<string, string> = {
  mumbai: 'https://rpc-mumbai.maticvigil.com',
  goerli: 'https://ethereum-goerli.publicnode.com',
  'arbitrum-sepolia': 'https://sepolia-rollup.arbitrum.io/rpc',
  sepolia: 'https://ethereum-sepolia.publicnode.com',
  'bsc-testnet': 'https://data-seed-prebsc-1-s1.bnbchain.org:8545',
  'optimism-goerli': 'https://goerli.optimism.io'
};

class AutoFaucet {
  private successCount = 0;
  private failCount = 0;
  private results: Array<{network: string, status: string, amount?: string, error?: string}> = [];

  async requestTokens(faucet: FaucetConfig): Promise<void> {
    console.log(`\n🔄 Requesting from ${faucet.name}...`);
    
    try {
      if (faucet.requiresAuth) {
        console.log(`⚠️  ${faucet.name} requires authentication - skipping`);
        this.results.push({
          network: faucet.network,
          status: 'skipped',
          error: 'Requires authentication'
        });
        return;
      }

      const response = await axios({
        method: faucet.method,
        url: faucet.url,
        headers: faucet.headers,
        data: faucet.data,
        timeout: 15000,
        validateStatus: () => true
      });

      if (response.status === 200 || response.status === 201) {
        console.log(`✅ Success! Requested ${faucet.amount} from ${faucet.name}`);
        this.successCount++;
        this.results.push({
          network: faucet.network,
          status: 'success',
          amount: faucet.amount
        });
      } else {
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
      }
    } catch (error: any) {
      console.log(`❌ Failed: ${faucet.name}`);
      console.log(`   Error: ${error.message?.substring(0, 100)}`);
      this.failCount++;
      this.results.push({
        network: faucet.network,
        status: 'failed',
        error: error.message
      });
    }
  }

  async checkBalance(network: string, address: string): Promise<string> {
    try {
      const rpcUrl = RPCS[network];
      if (!rpcUrl) return 'N/A';

      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const balance = await provider.getBalance(address);
      return ethers.formatEther(balance);
    } catch {
      return 'Error';
    }
  }

  async checkAllBalances(): Promise<void> {
    console.log('\n💰 Checking balances...\n');
    console.log('Network          | Balance');
    console.log('-----------------|------------------');
    
    for (const [network, rpcUrl] of Object.entries(RPCS)) {
      const balance = await this.checkBalance(network, WALLET_ADDRESS);
      const formattedNetwork = network.padEnd(16);
      console.log(`${formattedNetwork} | ${balance} ETH/MATIC/BNB`);
    }
  }

  async saveResults(): Promise<void> {
    const timestamp = new Date().toISOString();
    const logFile = path.join(process.cwd(), 'faucet-log.json');
    
    const logEntry = {
      timestamp,
      wallet: WALLET_ADDRESS,
      success: this.successCount,
      failed: this.failCount,
      results: this.results
    };

    let logs = [];
    if (fs.existsSync(logFile)) {
      const existing = fs.readFileSync(logFile, 'utf-8');
      logs = JSON.parse(existing);
    }
    
    logs.push(logEntry);
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
  }

  async run(): Promise<void> {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║         ArbitrageX Auto-Faucet - Get Free Tokens        ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');
    
    console.log(`📋 Wallet: ${WALLET_ADDRESS}`);
    console.log(`🎯 Target Faucets: ${FAUCETS.length}\n`);

    // Request from all faucets
    for (const faucet of FAUCETS) {
      await this.requestTokens(faucet);
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successful: ${this.successCount}`);
    console.log(`❌ Failed: ${this.failCount}`);
    console.log(`⏭️  Skipped: ${FAUCETS.length - this.successCount - this.failCount}`);

    // Check balances after 5 seconds
    console.log('\n⏳ Waiting 5 seconds for transactions to process...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    await this.checkAllBalances();

    // Save results
    await this.saveResults();
    console.log('\n📝 Results saved to faucet-log.json');

    // Next steps
    console.log('\n' + '='.repeat(60));
    console.log('🎯 NEXT STEPS:');
    console.log('='.repeat(60));
    console.log('1. Check your balances in 1-2 minutes');
    console.log('2. If balance is 0, try manual faucets:');
    console.log('   - Mumbai: https://faucet.polygon.technology/');
    console.log('   - Alchemy: https://www.alchemy.com/faucets');
    console.log('3. Once you have tokens, run the MEV bot in testnet mode!');
    
    if (this.successCount > 0) {
      console.log('\n🎉 Tokens requested successfully! Check balances in 1-2 minutes.');
    } else {
      console.log('\n⚠️  No automatic faucets worked. Please use manual faucets above.');
    }
  }
}

// Alternative: Direct Mumbai faucet request
async function requestMumbaiDirect(): Promise<void> {
  console.log('\n🟣 Trying Mumbai Polygon Faucet (Direct Method)...\n');
  
  try {
    // Mumbai faucet alternative endpoint
    const response = await axios.post(
      'https://api.faucet.matic.network/sendTokens',
      {
        network: 'mumbai',
        address: WALLET_ADDRESS,
        token: 'maticToken'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'https://faucet.polygon.technology',
          'Referer': 'https://faucet.polygon.technology/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 20000
      }
    );

    if (response.data.success || response.status === 200) {
      console.log('✅ Mumbai faucet request successful!');
      console.log('Transaction hash:', response.data.txHash || 'Pending...');
      console.log('\n💡 Check your balance in 30-60 seconds at:');
      console.log(`https://mumbai.polygonscan.com/address/${WALLET_ADDRESS}`);
      return;
    }
  } catch (error: any) {
    console.log('❌ Mumbai direct request failed');
    console.log('Error:', error.response?.data?.message || error.message);
  }

  // Try alternative method
  console.log('\n🔄 Trying alternative method...\n');
  
  try {
    const altResponse = await axios.get(
      `https://api.faucet.matic.network/getLimits?address=${WALLET_ADDRESS}&network=mumbai`,
      {
        headers: {
          'Accept': 'application/json',
          'Referer': 'https://faucet.polygon.technology/'
        }
      }
    );
    
    console.log('Faucet status:', altResponse.data);
    
    if (altResponse.data.limitExceeded) {
      console.log('⚠️  Daily limit reached. Try again in 24 hours.');
    } else {
      console.log('✅ Eligible for tokens. Visit: https://faucet.polygon.technology/');
    }
  } catch {
    console.log('⚠️  Could not check faucet status');
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--mumbai-only')) {
    await requestMumbaiDirect();
  } else if (args.includes('--check-balance')) {
    const faucet = new AutoFaucet();
    await faucet.checkAllBalances();
  } else {
    const faucet = new AutoFaucet();
    await faucet.run();
  }
}

main().catch(console.error);