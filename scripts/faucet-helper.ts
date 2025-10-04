#!/usr/bin/env tsx

/**
 * ArbitrageX Supreme V3.6 - Testnet Faucet Helper
 * 
 * This script helps users get testnet tokens for testing the MEV system
 * without risking real money.
 */

import { ethers } from "ethers";

interface FaucetInfo {
  name: string;
  chainId: number;
  url: string;
  description: string;
  amount: string;
  frequency: string;
  requirements?: string[];
  instructions: string[];
}

const FAUCETS: FaucetInfo[] = [
  {
    name: "Ethereum Sepolia",
    chainId: 11155111,
    url: "https://sepoliafaucet.com",
    description: "Main Ethereum testnet for development",
    amount: "0.5 ETH",
    frequency: "Once per day",
    requirements: [
      "GitHub account (optional but recommended)",
      "Valid wallet address"
    ],
    instructions: [
      "1. Go to https://sepoliafaucet.com",
      "2. Connect your wallet or paste your address",
      "3. Complete the captcha",
      "4. Click 'Send Me ETH'",
      "5. Wait for transaction confirmation (1-2 minutes)",
      "Alternative: Use Alchemy faucet at https://sepoliafaucet.com"
    ]
  },
  {
    name: "Polygon Mumbai",
    chainId: 80001,
    url: "https://faucet.polygon.technology/",
    description: "Polygon's testnet for Layer 2 testing",
    amount: "0.5 MATIC",
    frequency: "Once per day",
    requirements: [
      "Alchemy or Discord account"
    ],
    instructions: [
      "1. Visit https://faucet.polygon.technology/",
      "2. Select 'Mumbai Testnet'",
      "3. Enter your wallet address",
      "4. Complete verification",
      "5. Click 'Submit'",
      "6. Tokens arrive in ~30 seconds"
    ]
  },
  {
    name: "Arbitrum Goerli",
    chainId: 421613,
    url: "https://faucet.arbitrum.io",
    description: "Arbitrum's Layer 2 testnet",
    amount: "0.1 ETH",
    frequency: "Once per day",
    requirements: [
      "Twitter account (for higher amounts)",
      "Valid wallet address"
    ],
    instructions: [
      "1. Navigate to https://faucet.arbitrum.io",
      "2. Connect your wallet",
      "3. Select 'Arbitrum Goerli'",
      "4. Complete social verification (optional for more tokens)",
      "5. Click 'Request Tokens'",
      "6. Bridge tokens if needed using https://bridge.arbitrum.io"
    ]
  },
  {
    name: "Optimism Goerli",
    chainId: 420,
    url: "https://optimismfaucet.xyz",
    description: "Optimism's Layer 2 testnet",
    amount: "0.05 ETH",
    frequency: "Once per day",
    instructions: [
      "1. Visit https://optimismfaucet.xyz",
      "2. Enter your wallet address",
      "3. Complete the captcha",
      "4. Click 'Send ETH'",
      "Alternative: Use Paradigm faucet at https://faucet.paradigm.xyz"
    ]
  },
  {
    name: "BSC Testnet",
    chainId: 97,
    url: "https://testnet.bnbchain.org/faucet-smart",
    description: "Binance Smart Chain testnet",
    amount: "0.2 BNB",
    frequency: "Once per day",
    requirements: [
      "BNB Chain wallet"
    ],
    instructions: [
      "1. Go to https://testnet.bnbchain.org/faucet-smart",
      "2. Enter your wallet address",
      "3. Complete the reCAPTCHA",
      "4. Click 'Give me BNB'",
      "5. Check transaction on https://testnet.bscscan.com"
    ]
  },
  {
    name: "Base Goerli",
    chainId: 84531,
    url: "https://faucet.quicknode.com/base/goerli",
    description: "Base (Coinbase L2) testnet",
    amount: "0.1 ETH",
    frequency: "Once per day",
    requirements: [
      "QuickNode account (free tier available)"
    ],
    instructions: [
      "1. Visit https://faucet.quicknode.com/base/goerli",
      "2. Sign up for free QuickNode account",
      "3. Enter your wallet address",
      "4. Click 'Request'",
      "5. Tokens arrive in ~1 minute"
    ]
  }
];

const TESTNET_TOKENS = {
  sepolia: {
    WETH: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
    USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    USDT: "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0",
    DAI: "0x3e622317f8C93f7328350cF0B56d9eD4C620C5d6",
    UNI: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984"
  },
  mumbai: {
    WMATIC: "0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889",
    USDC: "0x0FA8781a83E46826621b3BC094Ea2A0212e71B23",
    USDT: "0xA02f6adc7926efeBBd59Fd43A84f4E0c0c91e832",
    DAI: "0x001B3B4d0F3714Ca98ba10F6042DaEbF0B1B7b6F"
  },
  arbitrum_goerli: {
    WETH: "0xe39Ab88f8A4777030A534146A9Ca3B52bd5D43A3",
    USDC: "0x8FB1E3fC51F3b789dED7557E680551d93Ea9d892",
    USDT: "0x533046F316590C19d99c74eE661c6d541b64471C"
  }
};

class FaucetHelper {
  /**
   * Display all available faucets
   */
  static listFaucets(): void {
    console.log("\n🚰 ArbitrageX Supreme - Testnet Faucets\n");
    console.log("=" .repeat(60));
    
    FAUCETS.forEach((faucet, index) => {
      console.log(`\n${index + 1}. ${faucet.name} (Chain ID: ${faucet.chainId})`);
      console.log(`   📍 URL: ${faucet.url}`);
      console.log(`   💰 Amount: ${faucet.amount}`);
      console.log(`   ⏰ Frequency: ${faucet.frequency}`);
      console.log(`   📝 ${faucet.description}`);
      
      if (faucet.requirements && faucet.requirements.length > 0) {
        console.log("\n   Requirements:");
        faucet.requirements.forEach(req => {
          console.log(`   • ${req}`);
        });
      }
      
      console.log("\n   Instructions:");
      faucet.instructions.forEach(instruction => {
        console.log(`   ${instruction}`);
      });
      
      console.log("\n" + "-".repeat(60));
    });
  }

  /**
   * Generate a new test wallet
   */
  static generateTestWallet(): void {
    console.log("\n🔑 Generating Test Wallet\n");
    console.log("=" .repeat(60));
    
    const wallet = ethers.Wallet.createRandom();
    
    console.log("📋 Wallet Address:", wallet.address);
    console.log("🔐 Private Key:", wallet.privateKey);
    console.log("📝 Mnemonic Phrase:", wallet.mnemonic?.phrase);
    
    console.log("\n⚠️  IMPORTANT SECURITY NOTES:");
    console.log("• This is a TESTNET wallet - DO NOT use for real funds!");
    console.log("• Save these credentials securely");
    console.log("• Never share your private key or mnemonic");
    console.log("• Use this wallet only for testing ArbitrageX");
    
    console.log("\n✅ Next Steps:");
    console.log("1. Save the wallet credentials in a secure location");
    console.log("2. Add the private key to your .env.local file:");
    console.log("   TEST_PRIVATE_KEY=\"" + wallet.privateKey + "\"");
    console.log("3. Use the faucets above to get testnet tokens");
    console.log("4. Start testing ArbitrageX in testnet mode!");
  }

  /**
   * Check balance for a given address on multiple testnets
   */
  static async checkBalances(address: string): Promise<void> {
    console.log("\n💰 Checking Testnet Balances\n");
    console.log("=" .repeat(60));
    console.log("Address:", address);
    console.log("\n");

    const networks = [
      { name: "Sepolia", rpc: "https://rpc.sepolia.org", symbol: "ETH" },
      { name: "Mumbai", rpc: "https://rpc-mumbai.maticvigil.com", symbol: "MATIC" },
      { name: "Arbitrum Goerli", rpc: "https://goerli-rollup.arbitrum.io/rpc", symbol: "ETH" },
      { name: "BSC Testnet", rpc: "https://data-seed-prebsc-1-s1.binance.org:8545", symbol: "BNB" },
      { name: "Base Goerli", rpc: "https://goerli.base.org", symbol: "ETH" }
    ];

    for (const network of networks) {
      try {
        const provider = new ethers.JsonRpcProvider(network.rpc);
        const balance = await provider.getBalance(address);
        const formatted = ethers.formatEther(balance);
        
        console.log(`${network.name}: ${formatted} ${network.symbol}`);
        
        if (parseFloat(formatted) === 0) {
          const faucet = FAUCETS.find(f => f.name.includes(network.name.split(" ")[0]));
          if (faucet) {
            console.log(`  ↳ Get tokens at: ${faucet.url}`);
          }
        }
      } catch (error) {
        console.log(`${network.name}: Error checking balance`);
      }
    }
  }

  /**
   * Display wallet setup guide
   */
  static showSetupGuide(): void {
    console.log("\n📚 Testnet Wallet Setup Guide\n");
    console.log("=" .repeat(60));
    
    console.log("\n1️⃣  METAMASK SETUP\n");
    console.log("   a) Install MetaMask from https://metamask.io");
    console.log("   b) Create or import a wallet");
    console.log("   c) Switch to a testnet network");
    console.log("   d) Add custom RPCs if needed:\n");
    
    console.log("   Sepolia:");
    console.log("   • Network Name: Sepolia");
    console.log("   • RPC URL: https://rpc.sepolia.org");
    console.log("   • Chain ID: 11155111");
    console.log("   • Symbol: ETH\n");
    
    console.log("   Mumbai:");
    console.log("   • Network Name: Mumbai");
    console.log("   • RPC URL: https://rpc-mumbai.maticvigil.com");
    console.log("   • Chain ID: 80001");
    console.log("   • Symbol: MATIC\n");
    
    console.log("2️⃣  ENVIRONMENT SETUP\n");
    console.log("   Create a .env.local file with:");
    console.log("   ```");
    console.log("   NETWORK_MODE=testnet");
    console.log("   ENABLE_REAL_TRADING=false");
    console.log("   TEST_PRIVATE_KEY=your_test_private_key_here");
    console.log("   ```\n");
    
    console.log("3️⃣  GETTING TESTNET TOKENS\n");
    console.log("   a) Use the faucets listed above");
    console.log("   b) Request tokens for each network you want to test");
    console.log("   c) Wait for confirmations (usually 1-2 minutes)\n");
    
    console.log("4️⃣  TESTING ARBITRAGEX\n");
    console.log("   a) Start the application in testnet mode");
    console.log("   b) Navigate to /testnet-guide for the full guide");
    console.log("   c) Monitor test transactions in the dashboard");
    console.log("   d) Practice strategies without risk!\n");
    
    console.log("=" .repeat(60));
  }

  /**
   * Display testnet token addresses
   */
  static showTestTokens(): void {
    console.log("\n🪙 Testnet Token Addresses\n");
    console.log("=" .repeat(60));
    
    Object.entries(TESTNET_TOKENS).forEach(([network, tokens]) => {
      console.log(`\n${network.toUpperCase()}:`);
      Object.entries(tokens).forEach(([symbol, address]) => {
        console.log(`  ${symbol}: ${address}`);
      });
    });
    
    console.log("\n📝 Note: Import these tokens in your wallet to see balances");
  }
}

// Main CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  console.clear();
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║          ArbitrageX Supreme V3.6 - Faucet Helper         ║");
  console.log("║              Test Without Risk on Testnets!              ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  
  switch (command) {
    case "list":
    case "faucets":
      FaucetHelper.listFaucets();
      break;
      
    case "generate":
    case "wallet":
      FaucetHelper.generateTestWallet();
      break;
      
    case "balance":
      if (args[1]) {
        await FaucetHelper.checkBalances(args[1]);
      } else {
        console.log("\n❌ Error: Please provide an address");
        console.log("Usage: tsx faucet-helper.ts balance <address>");
      }
      break;
      
    case "setup":
    case "guide":
      FaucetHelper.showSetupGuide();
      break;
      
    case "tokens":
      FaucetHelper.showTestTokens();
      break;
      
    default:
      console.log("\n📋 Available Commands:\n");
      console.log("  list     - Show all available testnet faucets");
      console.log("  generate - Generate a new test wallet");
      console.log("  balance  - Check balances across all testnets");
      console.log("  setup    - Display wallet setup guide");
      console.log("  tokens   - Show testnet token addresses");
      console.log("\n💡 Examples:");
      console.log("  tsx scripts/faucet-helper.ts list");
      console.log("  tsx scripts/faucet-helper.ts generate");
      console.log("  tsx scripts/faucet-helper.ts balance 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb");
      console.log("  tsx scripts/faucet-helper.ts setup");
      console.log("  tsx scripts/faucet-helper.ts tokens");
  }
  
  console.log("\n");
}

// Run the CLI
if (require.main === module) {
  main().catch(console.error);
}

export { FaucetHelper, FAUCETS, TESTNET_TOKENS };