import { spawn } from "child_process";
import { db } from "./db";
import { opportunities } from "@shared/schema";
import { randomUUID } from "crypto";

interface OpportunityMatch {
  chain: string;
  route: string;
  pair: string;
  baseToken?: string;
  quoteToken?: string;
  profit: string;
  roi: string;
}

export class MEVScanner {
  private isRunning = false;
  private process: any = null;
  private lastScanTime: number = 0;
  private scanCount: number = 0;

  async start() {
    if (this.isRunning) {
      console.log("⚠️  MEV Scanner already running");
      return;
    }

    this.isRunning = true;
    console.log("🚀 Starting MEV Scanner...");

    this.runContinuous();
  }

  private async runContinuous() {
    while (this.isRunning) {
      await this.runScan();
      await new Promise((resolve) => setTimeout(resolve, 10000)); // 10 seconds - TIEMPO REAL
    }
  }

  private async runScan(): Promise<void> {
    this.lastScanTime = Date.now();
    this.scanCount++;
    
    return new Promise((resolve) => {
      const proc = spawn("./binaries/mev-engine", [], {
        cwd: process.cwd(),
      });

      let output = "";
      let errorOutput = "";

      proc.stdout.on("data", (data: Buffer) => {
        const text = data.toString();
        output += text;
        console.log(text.trim());
      });

      proc.stderr.on("data", (data: Buffer) => {
        errorOutput += data.toString();
      });

      proc.on("close", async (code, signal) => {
        if (code === 0 || code === 124 || signal === "SIGTERM" || signal === "SIGKILL") {
          // 124 = timeout, expected
          // SIGTERM/SIGKILL = killed by timeout, also expected
          await this.parseAndSaveOpportunities(output);
        } else if (code !== null) {
          // Only log if there's an actual error code and error output
          if (errorOutput.trim()) {
            console.error(`❌ MEV Engine error (code ${code}):`, errorOutput);
          } else {
            console.error(`⚠️  MEV Engine exited with code ${code} (no error output)`);
          }
        }
        resolve();
      });

      // Kill after 35 seconds (5s buffer)
      setTimeout(() => {
        proc.kill("SIGTERM");
      }, 35000);
    });
  }

  private async parseAndSaveOpportunities(output: string) {
    const lines = output.split("\n");
    const foundOpportunities: OpportunityMatch[] = [];

    let currentOpp: Partial<OpportunityMatch> = {};

    for (const line of lines) {
      if (line.includes("Chain:")) {
        currentOpp.chain = line.split("Chain:")[1]?.trim() || "";
      } else if (line.includes("Route:")) {
        currentOpp.route = line.split("Route:")[1]?.trim() || "";
      } else if (line.includes("Pair:")) {
        currentOpp.pair = line.split("Pair:")[1]?.trim() || "";
      } else if (line.includes("BaseToken:")) {
        currentOpp.baseToken = line.split("BaseToken:")[1]?.trim() || "";
      } else if (line.includes("QuoteToken:")) {
        currentOpp.quoteToken = line.split("QuoteToken:")[1]?.trim() || "";
      } else if (line.includes("Profit:")) {
        currentOpp.profit = line.split("Profit:")[1]?.trim() || "";
      } else if (line.includes("ROI:")) {
        currentOpp.roi = line.split("ROI:")[1]?.trim() || "";

        if (
          currentOpp.chain &&
          currentOpp.route &&
          currentOpp.pair &&
          currentOpp.profit
        ) {
          foundOpportunities.push(currentOpp as OpportunityMatch);
          currentOpp = {};
        }
      }
    }

    // Save to database
    for (const opp of foundOpportunities) {
      try {
        const [dexIn, dexOut] = opp.route.split("→").map((s) => s.trim());
        const profitUsd = parseFloat(
          opp.profit.replace("$", "").replace(" USD", "")
        );

        await db.insert(opportunities).values({
          id: randomUUID(),
          chainId: parseInt(opp.chain),
          dexIn: dexIn || "unknown",
          dexOut: dexOut || "unknown",
          baseToken: opp.baseToken || opp.pair.split("/")[0] || "unknown",
          quoteToken: opp.quoteToken || opp.pair.split("/")[1] || "unknown",
          amountIn: "1000.0",
          estProfitUsd: profitUsd,
          gasUsd: 15.0,
          ts: Date.now(),
          isTestnet: false,
        });

        console.log(`✅ Saved opportunity: ${opp.pair} on chain ${opp.chain}`);
      } catch (error) {
        console.error("Error saving opportunity:", error);
      }
    }

    if (foundOpportunities.length > 0) {
      console.log(`💾 Saved ${foundOpportunities.length} opportunities to database`);
    }
  }

  stop() {
    this.isRunning = false;
    if (this.process) {
      this.process.kill();
    }
    console.log("🛑 MEV Scanner stopped");
  }

  getStatus() {
    return {
      isActive: this.isRunning,
      lastScanTime: this.lastScanTime,
      scanCount: this.scanCount,
    };
  }
}

export const mevScanner = new MEVScanner();
