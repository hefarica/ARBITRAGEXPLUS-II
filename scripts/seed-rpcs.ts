import { db } from "../server/db";
import { rpcHealth } from "../shared/schema";

const rpcData = [
  // Ethereum Mainnet
  { url: "https://cloudflare-eth.com", chainId: 1, status: "healthy", healthScore: 95, latencyP50: 45, latencyP95: 120, errorRate: 0.01, totalRequests: 1523000, failedRequests: 15230 },
  { url: "https://eth.llamarpc.com", chainId: 1, status: "healthy", healthScore: 92, latencyP50: 52, latencyP95: 145, errorRate: 0.02, totalRequests: 987654, failedRequests: 19753 },
  { url: "https://ethereum.publicnode.com", chainId: 1, status: "healthy", healthScore: 88, latencyP50: 61, latencyP95: 180, errorRate: 0.03, totalRequests: 654321, failedRequests: 19630 },
  { url: "https://1rpc.io/eth", chainId: 1, status: "healthy", healthScore: 90, latencyP50: 58, latencyP95: 165, errorRate: 0.025, totalRequests: 432100, failedRequests: 10802 },
  { url: "https://rpc.ankr.com/eth", chainId: 1, status: "healthy", healthScore: 93, latencyP50: 48, latencyP95: 135, errorRate: 0.015, totalRequests: 2100000, failedRequests: 31500 },
  
  // Arbitrum
  { url: "https://arb1.arbitrum.io/rpc", chainId: 42161, status: "healthy", healthScore: 91, latencyP50: 42, latencyP95: 110, errorRate: 0.018, totalRequests: 876543, failedRequests: 15777 },
  { url: "https://rpc.ankr.com/arbitrum", chainId: 42161, status: "healthy", healthScore: 94, latencyP50: 38, latencyP95: 95, errorRate: 0.012, totalRequests: 1234567, failedRequests: 14814 },
  { url: "https://arbitrum.llamarpc.com", chainId: 42161, status: "degraded", healthScore: 72, latencyP50: 85, latencyP95: 250, errorRate: 0.08, totalRequests: 543210, failedRequests: 43456 },
  { url: "https://arbitrum-one.publicnode.com", chainId: 42161, status: "healthy", healthScore: 89, latencyP50: 55, latencyP95: 160, errorRate: 0.03, totalRequests: 321098, failedRequests: 9633 },
  
  // Optimism
  { url: "https://mainnet.optimism.io", chainId: 10, status: "healthy", healthScore: 90, latencyP50: 50, latencyP95: 140, errorRate: 0.025, totalRequests: 765432, failedRequests: 19135 },
  { url: "https://optimism.llamarpc.com", chainId: 10, status: "healthy", healthScore: 87, latencyP50: 62, latencyP95: 175, errorRate: 0.04, totalRequests: 432109, failedRequests: 17284 },
  { url: "https://rpc.ankr.com/optimism", chainId: 10, status: "healthy", healthScore: 93, latencyP50: 44, latencyP95: 125, errorRate: 0.017, totalRequests: 987600, failedRequests: 16789 },
  { url: "https://optimism.publicnode.com", chainId: 10, status: "quarantined", healthScore: 45, latencyP50: 150, latencyP95: 500, errorRate: 0.15, totalRequests: 234567, failedRequests: 35185 },
  
  // Base
  { url: "https://mainnet.base.org", chainId: 8453, status: "healthy", healthScore: 96, latencyP50: 35, latencyP95: 85, errorRate: 0.008, totalRequests: 1500000, failedRequests: 12000 },
  { url: "https://base.llamarpc.com", chainId: 8453, status: "healthy", healthScore: 91, latencyP50: 48, latencyP95: 130, errorRate: 0.02, totalRequests: 876000, failedRequests: 17520 },
  { url: "https://rpc.ankr.com/base", chainId: 8453, status: "healthy", healthScore: 89, latencyP50: 56, latencyP95: 155, errorRate: 0.03, totalRequests: 654000, failedRequests: 19620 },
  { url: "https://base.publicnode.com", chainId: 8453, status: "degraded", healthScore: 68, latencyP50: 95, latencyP95: 280, errorRate: 0.09, totalRequests: 432000, failedRequests: 38880 },
  
  // Polygon
  { url: "https://polygon-rpc.com", chainId: 137, status: "healthy", healthScore: 88, latencyP50: 65, latencyP95: 190, errorRate: 0.035, totalRequests: 765432, failedRequests: 26790 },
  { url: "https://rpc.ankr.com/polygon", chainId: 137, status: "healthy", healthScore: 92, latencyP50: 52, latencyP95: 145, errorRate: 0.022, totalRequests: 1234000, failedRequests: 27148 },
  { url: "https://polygon.llamarpc.com", chainId: 137, status: "healthy", healthScore: 85, latencyP50: 72, latencyP95: 210, errorRate: 0.045, totalRequests: 543000, failedRequests: 24435 },
  { url: "https://polygon-mainnet.public.blastapi.io", chainId: 137, status: "quarantined", healthScore: 35, latencyP50: 200, latencyP95: 600, errorRate: 0.25, totalRequests: 123456, failedRequests: 30864 },
  
  // BSC
  { url: "https://bsc-dataseed.binance.org", chainId: 56, status: "healthy", healthScore: 87, latencyP50: 68, latencyP95: 195, errorRate: 0.04, totalRequests: 654321, failedRequests: 26172 },
  { url: "https://bsc.publicnode.com", chainId: 56, status: "healthy", healthScore: 83, latencyP50: 78, latencyP95: 220, errorRate: 0.05, totalRequests: 432100, failedRequests: 21605 },
  { url: "https://rpc.ankr.com/bsc", chainId: 56, status: "degraded", healthScore: 71, latencyP50: 110, latencyP95: 320, errorRate: 0.11, totalRequests: 321000, failedRequests: 35310 },
];

async function seedRPCs() {
  console.log("Seeding RPC health data...");
  
  const now = Date.now();
  
  for (const rpc of rpcData) {
    await db.insert(rpcHealth).values({
      ...rpc,
      lastCheck: now,
      updatedAt: now,
    }).onConflictDoNothing();
  }
  
  console.log(`✅ Seeded ${rpcData.length} RPC entries`);
}

seedRPCs().catch((err) => {
  console.error("Error seeding RPCs:", err);
  process.exit(1);
});