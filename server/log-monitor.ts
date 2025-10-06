import { EventEmitter } from 'events';

interface SkipWarning {
  type: 'incomplete_data' | 'invalid_chain' | 'invalid_amount';
  timestamp: number;
  details: string;
}

interface MonitorStats {
  totalSkips: number;
  skipsByType: Record<string, number>;
  recentWarnings: SkipWarning[];
  lastAlert: number | null;
}

export class LogMonitor extends EventEmitter {
  private stats: MonitorStats = {
    totalSkips: 0,
    skipsByType: {},
    recentWarnings: [],
    lastAlert: null,
  };

  private readonly ALERT_THRESHOLD = 10; // Alert after 10 skips in window
  private readonly TIME_WINDOW = 60000; // 1 minute window
  private readonly MAX_RECENT_WARNINGS = 50;

  constructor() {
    super();
    this.startMonitoring();
  }

  /**
   * Record a skip warning from the dry-run processor
   */
  recordSkip(type: SkipWarning['type'], details: string): void {
    const warning: SkipWarning = {
      type,
      timestamp: Date.now(),
      details,
    };

    // Update stats
    this.stats.totalSkips++;
    this.stats.skipsByType[type] = (this.stats.skipsByType[type] || 0) + 1;

    // Add to recent warnings (keep last N)
    this.stats.recentWarnings.unshift(warning);
    if (this.stats.recentWarnings.length > this.MAX_RECENT_WARNINGS) {
      this.stats.recentWarnings.pop();
    }

    // Check if we should alert
    this.checkThreshold();
  }

  /**
   * Check if skip rate exceeds threshold and emit alert
   */
  private checkThreshold(): void {
    const now = Date.now();
    const windowStart = now - this.TIME_WINDOW;

    // Count skips in current time window
    const recentSkips = this.stats.recentWarnings.filter(
      (w) => w.timestamp >= windowStart
    );

    if (recentSkips.length >= this.ALERT_THRESHOLD) {
      // Don't spam alerts - only alert once per window
      if (!this.stats.lastAlert || now - this.stats.lastAlert > this.TIME_WINDOW) {
        this.emitAlert(recentSkips);
        this.stats.lastAlert = now;
      }
    }
  }

  /**
   * Emit high skip rate alert
   */
  private emitAlert(recentSkips: SkipWarning[]): void {
    const skipsByType: Record<string, number> = {};
    recentSkips.forEach((skip) => {
      skipsByType[skip.type] = (skipsByType[skip.type] || 0) + 1;
    });

    const alert = {
      severity: 'high',
      message: `High skip rate detected: ${recentSkips.length} skips in last minute`,
      skipsByType,
      timestamp: Date.now(),
    };

    console.warn('🚨 LOG MONITOR ALERT:', JSON.stringify(alert, null, 2));
    this.emit('high_skip_rate', alert);
  }

  /**
   * Get current monitoring statistics
   */
  getStats(): MonitorStats {
    return { ...this.stats };
  }

  /**
   * Get skips in the last N minutes
   */
  getRecentSkips(minutes: number = 5): SkipWarning[] {
    const windowStart = Date.now() - minutes * 60000;
    return this.stats.recentWarnings.filter(
      (w) => w.timestamp >= windowStart
    );
  }

  /**
   * Reset statistics
   */
  reset(): void {
    this.stats = {
      totalSkips: 0,
      skipsByType: {},
      recentWarnings: [],
      lastAlert: null,
    };
  }

  /**
   * Start periodic monitoring reports
   */
  private startMonitoring(): void {
    // Log summary every 5 minutes
    setInterval(() => {
      const recent = this.getRecentSkips(5);
      if (recent.length > 0) {
        console.log('📊 Skip Monitor Summary (last 5 min):', {
          totalSkips: recent.length,
          byType: recent.reduce((acc, skip) => {
            acc[skip.type] = (acc[skip.type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
        });
      }
    }, 5 * 60000);
  }
}

// Export singleton instance
export const logMonitor = new LogMonitor();
