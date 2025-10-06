import { arbitrageSimulator } from './arbitrage-simulator';
import { getWebSocketServer } from './websocket-instance';
import { dryRunProcessor } from './dry-run-processor';

class ArbitrageScanner {
  private intervalId: NodeJS.Timeout | null = null;
  private isScanning = false;
  private readonly SCAN_INTERVAL_MS = 5000;
  private lastOpportunities: any[] = [];

  start() {
    if (this.intervalId) {
      console.log('⚠️  Arbitrage scanner already running');
      return;
    }

    console.log('🔍 Starting arbitrage scanner (every 5 seconds)...');
    
    this.scan();
    
    this.intervalId = setInterval(() => {
      this.scan();
    }, this.SCAN_INTERVAL_MS);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isScanning = false;
      console.log('🛑 Arbitrage scanner stopped');
    }
  }

  private async scan() {
    if (this.isScanning) {
      console.log('⏭️  Skipping scan (previous scan still running)');
      return;
    }

    this.isScanning = true;
    const startTime = Date.now();

    try {
      const opportunities = await arbitrageSimulator.findOpportunities();
      const scanDuration = Date.now() - startTime;

      if (opportunities.length > 0) {
        console.log(`✅ Found ${opportunities.length} arbitrage opportunities (scan took ${scanDuration}ms)`);
        
        const topOpportunities = opportunities.slice(0, 5);
        topOpportunities.forEach((opp, index) => {
          console.log(`  ${index + 1}. Chain ${opp.chain_id}: ${opp.net_pnl_bps} bps profit (${opp.legs} legs, ${opp.reason})`);
        });

        this.lastOpportunities = opportunities;
        this.broadcastOpportunities(opportunities);
        
        // Process each opportunity with dry-run simulator if enabled
        // ONLY process opportunities with complete real data - NO fallbacks
        for (const opp of opportunities) {
          // Validate that ALL required fields have real data
          if (!opp.chain_id || !opp.dex_in || !opp.dex_out || 
              !opp.base_token || !opp.quote_token || !opp.amount_in ||
              opp.profit_usd === undefined || opp.profit_usd === null ||
              opp.gas_usd === undefined || opp.gas_usd === null) {
            // Skip opportunity with missing real data - do not invent anything
            continue;
          }

          try {
            // Parse and validate numeric values with Number.isFinite to reject NaN
            const profitUsd = parseFloat(opp.profit_usd);
            const gasUsd = parseFloat(opp.gas_usd);
            
            if (!Number.isFinite(profitUsd) || !Number.isFinite(gasUsd)) {
              // Skip if parsed values are NaN or Infinity
              continue;
            }

            await dryRunProcessor.processOpportunity({
              id: `${opp.chain_id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              chainId: opp.chain_id,
              dexIn: opp.dex_in,
              dexOut: opp.dex_out,
              baseToken: opp.base_token,
              quoteToken: opp.quote_token,
              amountIn: opp.amount_in.toString(),
              estProfitUsd: profitUsd,
              gasUsd: gasUsd,
              ts: Date.now(),
            });
          } catch (error) {
            console.error('Error processing opportunity with dry-run:', error);
          }
        }
      } else {
        if (this.lastOpportunities.length > 0) {
          console.log(`ℹ️  No arbitrage opportunities found (scan took ${scanDuration}ms)`);
          this.lastOpportunities = [];
          this.broadcastOpportunities([]);
        }
      }
    } catch (error) {
      console.error('❌ Error during arbitrage scan:', error);
    } finally {
      this.isScanning = false;
    }
  }

  private broadcastOpportunities(opportunities: any[]) {
    const wsServer = getWebSocketServer();
    if (!wsServer) {
      return;
    }

    try {
      wsServer.broadcast({
        type: 'arbitrage.opportunities',
        data: {
          count: opportunities.length,
          opportunities: opportunities.slice(0, 10),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Error broadcasting arbitrage opportunities:', error);
    }
  }

  getLastOpportunities() {
    return this.lastOpportunities;
  }

  isRunning() {
    return this.intervalId !== null;
  }
}

export const arbitrageScanner = new ArbitrageScanner();
