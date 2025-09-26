import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from './helpers';

export interface SessionCounters {
  sessionId: string;
  startTime: number;
  tokensDetected: number;
  route_gateFilterPassed: number;
  route_gateFilterFailed: number;
  burnFilterPassed: number;
  burnFilterFailed: number;
  mutableFilterPassed: number;
  mutableFilterFailed: number;
  renouncedFilterPassed: number;
  renouncedFilterFailed: number;
  poolSizeFilterPassed: number;
  poolSizeFilterFailed: number;
  on_chainFilterPassed: number;
  on_chainFilterFailed: number;
  lp_protectionFilterPassed: number;
  lp_protectionFilterFailed: number;
  qualityFilterPassed: number;
  qualityFilterFailed: number;
  dexscreenerFilterPassed: number;
  dexscreenerFilterFailed: number;
  tradingAttempts: number;
  tradingSuccesses: number;
  errors: number;
}

export class SessionLogger {
  private sessionId: string;
  private logDir: string;
  private counters!: SessionCounters;
  private filterLogs: Map<string, string[]> = new Map();

  constructor() {
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.logDir = join('./logs', this.sessionId);
    this.ensureLogDirectory();
    this.initCounters();
    
    logger.info(`🔍 Analysis session started: ${this.sessionId}`);
  }

  private ensureLogDirectory() {
    if (!existsSync('./logs')) {
      mkdirSync('./logs', { recursive: true });
    }
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
  }

  private initCounters() {
    this.counters = {
      sessionId: this.sessionId,
      startTime: Date.now(),
      tokensDetected: 0,
      route_gateFilterPassed: 0,
      route_gateFilterFailed: 0,
      burnFilterPassed: 0,
      burnFilterFailed: 0,
      mutableFilterPassed: 0,
      mutableFilterFailed: 0,
      renouncedFilterPassed: 0,
      renouncedFilterFailed: 0,
      poolSizeFilterPassed: 0,
      poolSizeFilterFailed: 0,
      on_chainFilterPassed: 0,
      on_chainFilterFailed: 0,
      lp_protectionFilterPassed: 0,
      lp_protectionFilterFailed: 0,
      qualityFilterPassed: 0,
      qualityFilterFailed: 0,
      dexscreenerFilterPassed: 0,
      dexscreenerFilterFailed: 0,
      tradingAttempts: 0,
      tradingSuccesses: 0,
      errors: 0,
    };
  }

  public logTokenDetected(tokenAddress: string) {
    this.counters.tokensDetected++;
    const logEntry = `${new Date().toISOString()} - Token detected: ${tokenAddress}`;
    this.appendToFilterLog('token_detection', logEntry);
    logger.debug(`📊 Token detected: ${tokenAddress} (Total: ${this.counters.tokensDetected})`);
  }

  public logFilterResult(filterName: string, passed: boolean, tokenAddress: string, reason?: string) {
    const counterKey = `${filterName}${passed ? 'Passed' : 'Failed'}` as keyof SessionCounters;
    if (typeof this.counters[counterKey] === 'number') {
      (this.counters[counterKey] as number)++;
    }

    const status = passed ? 'PASSED' : 'FAILED';
    const logEntry = `${new Date().toISOString()} - ${status}: ${tokenAddress}${reason ? ` - ${reason}` : ''}`;
    this.appendToFilterLog(`${filterName}_filter`, logEntry);
    
    logger.debug(`🔍 ${filterName} filter ${status}: ${tokenAddress}${reason ? ` - ${reason}` : ''}`);
  }

  public  logTradingAttempt(tokenAddress: string, result: string, amount: number) {
    this.counters.tradingAttempts++;
    if (result.includes('SUCCESS')) {
      this.counters.tradingSuccesses++;
    }

    const logEntry = `${new Date().toISOString()} - ${result}: ${tokenAddress} - Amount: ${amount}`;
    this.appendToFilterLog('trading', logEntry);
    
    logger.info(`💰 Trading ${result}: ${tokenAddress} - Amount: ${amount}`);
  }

  public logError(error: string, context?: string) {
    this.counters.errors++;
    const logEntry = `${new Date().toISOString()} - ERROR: ${error}${context ? ` - Context: ${context}` : ''}`;
    this.appendToFilterLog('errors', logEntry);
    
    logger.error(`❌ Error logged: ${error}`);
  }

  private appendToFilterLog(filterName: string, logEntry: string) {
    if (!this.filterLogs.has(filterName)) {
      this.filterLogs.set(filterName, []);
    }
    this.filterLogs.get(filterName)!.push(logEntry);
  }

  public printStats() {
    const runtime = Math.floor((Date.now() - this.counters.startTime) / 1000);
    const tokensPerSecond = this.counters.tokensDetected / Math.max(runtime, 1);
    
    logger.info(`📊 === SESSION STATISTICS (${runtime}s runtime) ===`);
    logger.info(`🔍 Tokens Detected: ${this.counters.tokensDetected} (${tokensPerSecond.toFixed(2)}/sec)`);
    
    if (this.counters.tokensDetected > 0) {
      const routeGatePassRate = ((this.counters.route_gateFilterPassed / (this.counters.route_gateFilterPassed + this.counters.route_gateFilterFailed)) * 100).toFixed(1);
      const burnPassRate = ((this.counters.burnFilterPassed / (this.counters.burnFilterPassed + this.counters.burnFilterFailed)) * 100).toFixed(1);
      const mutablePassRate = ((this.counters.mutableFilterPassed / (this.counters.mutableFilterPassed + this.counters.mutableFilterFailed)) * 100).toFixed(1);
      const renouncedPassRate = ((this.counters.renouncedFilterPassed / (this.counters.renouncedFilterPassed + this.counters.renouncedFilterFailed)) * 100).toFixed(1);
      const poolSizePassRate = ((this.counters.poolSizeFilterPassed / (this.counters.poolSizeFilterPassed + this.counters.poolSizeFilterFailed)) * 100).toFixed(1);
      const onChainPassRate = ((this.counters.on_chainFilterPassed / (this.counters.on_chainFilterPassed + this.counters.on_chainFilterFailed)) * 100).toFixed(1);
      const lpProtectionPassRate = ((this.counters.lp_protectionFilterPassed / (this.counters.lp_protectionFilterPassed + this.counters.lp_protectionFilterFailed)) * 100).toFixed(1);
      const qualityPassRate = ((this.counters.qualityFilterPassed / (this.counters.qualityFilterPassed + this.counters.qualityFilterFailed)) * 100).toFixed(1);
      const dexscreenerPassRate = ((this.counters.dexscreenerFilterPassed / (this.counters.dexscreenerFilterPassed + this.counters.dexscreenerFilterFailed)) * 100).toFixed(1);
      
      logger.info(`🚪 Route Gate Filter: ${this.counters.route_gateFilterPassed} passed, ${this.counters.route_gateFilterFailed} failed (${routeGatePassRate}% pass rate)`);
      logger.info(`🔥 Burn Filter: ${this.counters.burnFilterPassed} passed, ${this.counters.burnFilterFailed} failed (${burnPassRate}% pass rate)`);
      logger.info(`🔧 Mutable Filter: ${this.counters.mutableFilterPassed} passed, ${this.counters.mutableFilterFailed} failed (${mutablePassRate}% pass rate)`);
      logger.info(`👑 Renounced Filter: ${this.counters.renouncedFilterPassed} passed, ${this.counters.renouncedFilterFailed} failed (${renouncedPassRate}% pass rate)`);
      logger.info(`💧 Pool Size Filter: ${this.counters.poolSizeFilterPassed} passed, ${this.counters.poolSizeFilterFailed} failed (${poolSizePassRate}% pass rate)`);
      logger.info(`⛓️ On-Chain Filter: ${this.counters.on_chainFilterPassed} passed, ${this.counters.on_chainFilterFailed} failed (${onChainPassRate}% pass rate)`);
      logger.info(`🔒 LP Protection Filter: ${this.counters.lp_protectionFilterPassed} passed, ${this.counters.lp_protectionFilterFailed} failed (${lpProtectionPassRate}% pass rate)`);
      logger.info(`⭐ Quality Filter: ${this.counters.qualityFilterPassed} passed, ${this.counters.qualityFilterFailed} failed (${qualityPassRate}% pass rate)`);
      logger.info(`📊 DexScreener Filter: ${this.counters.dexscreenerFilterPassed} passed, ${this.counters.dexscreenerFilterFailed} failed (${dexscreenerPassRate}% pass rate)`);
    }
    
    logger.info(`💰 Trading: ${this.counters.tradingSuccesses}/${this.counters.tradingAttempts} successful (${this.counters.tradingAttempts > 0 ? ((this.counters.tradingSuccesses / this.counters.tradingAttempts) * 100).toFixed(1) : '0'}% success rate)`);
    logger.info(`❌ Errors: ${this.counters.errors}`);
    logger.info(`📁 Session ID: ${this.sessionId}`);
  }

  public saveSession() {
    try {
      for (const [filterName, logs] of this.filterLogs.entries()) {
        const filePath = join(this.logDir, `${filterName}.log`);
        writeFileSync(filePath, logs.join('\n'));
      }

      const summaryPath = join(this.logDir, 'session_summary.json');
      const summary = {
        ...this.counters,
        endTime: Date.now(),
        runtime: Math.floor((Date.now() - this.counters.startTime) / 1000),
        tokensPerSecond: this.counters.tokensDetected / Math.max((Date.now() - this.counters.startTime) / 1000, 1),
      };
      writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
      
      logger.info(`💾 Session data saved to: ${this.logDir}`);
    } catch (error) {
      logger.error(`Failed to save session data: ${error}`);
    }
  }
}
