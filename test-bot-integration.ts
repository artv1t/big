/**
 * Test file for Solana Trading Bot - Cursor Integration
 * 
 * This file provides test functions and utilities for the bot that can be used
 * by Cursor AI or other development tools for testing and modifications.
 * 
 * Usage:
 * - Run individual filter tests: npm run test:filters
 * - Test complete pipeline: npm run test:pipeline  
 * - Test trading functions: npm run test:trading
 */

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { LiquidityPoolKeysV4 } from '@raydium-io/raydium-sdk';
import { SessionLogger } from './analysis-logger';
import { PoolFilters } from './filters/pool-filters';
import { RouteGateFilter } from './filters/route-gate.filter';
import { OnChainFilter } from './filters/on-chain.filter';
import { DexScreenerFilter } from './filters/dexscreener.filter';
import { TPSLTTLManager } from './trading/tp-sl-ttl.manager';
import { logger } from './helpers';

const TEST_CONFIG = {
  RPC_URL: 'https://rpc.ankr.com/solana',
  TEST_TOKEN_MINT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC for testing
  TEST_AMOUNT: 100000, // 0.0001 SOL in lamports
  TIMEOUT_MS: 30000,
};

export class BotTester {
  private connection: Connection;
  private sessionLogger: SessionLogger;

  constructor() {
    this.connection = new Connection(TEST_CONFIG.RPC_URL, 'confirmed');
    this.sessionLogger = new SessionLogger();
  }

  /**
   * Test individual filters with a known token
   */
  async testFilters(): Promise<void> {
    logger.info('🧪 Testing individual filters...');

    const testMint = new PublicKey(TEST_CONFIG.TEST_TOKEN_MINT);
    const mockPoolKeys = this.createMockPoolKeys(testMint);

    await this.testRouteGateFilter(mockPoolKeys);

    await this.testOnChainFilter(mockPoolKeys);

    await this.testDexScreenerFilter(mockPoolKeys);

    logger.info('✅ Filter tests completed');
  }

  /**
   * Test the complete filter pipeline
   */
  async testFilterPipeline(): Promise<void> {
    logger.info('🧪 Testing complete filter pipeline...');

    const testMint = new PublicKey(TEST_CONFIG.TEST_TOKEN_MINT);
    const mockPoolKeys = this.createMockPoolKeys(testMint);

    const { Token, TokenAmount } = require('@raydium-io/raydium-sdk');
    const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
    
    const quoteToken = new Token(TOKEN_PROGRAM_ID, new PublicKey('So11111111111111111111111111111111111111112'), 9, 'WSOL', 'Wrapped SOL');
    const minPoolSize = new TokenAmount(quoteToken, '1000000000', false); // 1 SOL
    const maxPoolSize = new TokenAmount(quoteToken, '100000000000', false); // 100 SOL

    const poolFilters = new PoolFilters(
      this.connection,
      {
        minPoolSize,
        maxPoolSize,
        quoteToken,
      },
      this.sessionLogger
    );

    try {
      const result = await poolFilters.execute(mockPoolKeys);
      logger.info(`Pipeline result: ${result ? 'PASSED' : 'FAILED'}`);
    } catch (error) {
      logger.error(`Pipeline test error: ${error}`);
    }

    logger.info('✅ Pipeline test completed');
  }

  /**
   * Test TP/SL/TTL manager
   */
  async testTradingManager(): Promise<void> {
    logger.info('🧪 Testing TP/SL/TTL manager...');

    const tpslManager = new TPSLTTLManager(this.connection, this.sessionLogger, 1000);
    const testMint = new PublicKey(TEST_CONFIG.TEST_TOKEN_MINT);

    tpslManager.addPosition(testMint, 1.0, 0.0001, 20, 10, 30000); // 30 second TTL

    const positions = tpslManager.getActivePositions();
    logger.info(`Active positions: ${positions.length}`);

    setTimeout(() => {
      tpslManager.stop();
      logger.info('✅ Trading manager test completed');
    }, 5000);
  }

  /**
   * Test pool detection simulation
   */
  async testPoolDetection(): Promise<void> {
    logger.info('🧪 Testing pool detection simulation...');

    for (let i = 0; i < 5; i++) {
      const randomMint = Keypair.generate().publicKey;
      logger.info(`🔍 Pool detected: ${randomMint.toString()}`);
      
      this.sessionLogger.logTokenDetected(randomMint.toString());
      
      this.sessionLogger.logFilterResult('route_gate', Math.random() > 0.5, randomMint.toString(), 'Test result');
      this.sessionLogger.logFilterResult('on_chain', Math.random() > 0.3, randomMint.toString(), 'Test result');
      this.sessionLogger.logFilterResult('dexscreener', Math.random() > 0.7, randomMint.toString(), 'Test result');
    }

    this.sessionLogger.printStats();
    logger.info('✅ Pool detection test completed');
  }

  /**
   * Test session logging functionality
   */
  async testSessionLogging(): Promise<void> {
    logger.info('🧪 Testing session logging...');

    this.sessionLogger.logTokenDetected('test-token-1');
    this.sessionLogger.logTokenDetected('test-token-2');
    
    this.sessionLogger.logFilterResult('burn', true, 'test-token-1', 'Passed burn check');
    this.sessionLogger.logFilterResult('burn', false, 'test-token-2', 'Failed burn check');
    
    this.sessionLogger.logTradingAttempt('test-token-1', 'BUY_SUCCESS', 0.0001);
    this.sessionLogger.logError('Test error message');

    this.sessionLogger.printStats();
    await this.sessionLogger.saveSession();

    logger.info('✅ Session logging test completed');
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<void> {
    logger.info('🚀 Starting comprehensive bot tests...');

    try {
      await this.testSessionLogging();
      await this.testPoolDetection();
      await this.testFilters();
      await this.testFilterPipeline();
      await this.testTradingManager();

      logger.info('🎉 All tests completed successfully!');
    } catch (error) {
      logger.error(`Test suite failed: ${error}`);
    }
  }

  private async testRouteGateFilter(poolKeys: LiquidityPoolKeysV4): Promise<void> {
    const filter = new RouteGateFilter(this.connection);
    try {
      const result = await Promise.race([
        filter.execute(poolKeys),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Timeout')), TEST_CONFIG.TIMEOUT_MS))
      ]);
      logger.info(`Route Gate Filter: ${result.ok ? 'PASSED' : 'FAILED'} - ${result.message || 'No message'}`);
    } catch (error) {
      logger.error(`Route Gate Filter error: ${error}`);
    }
  }

  private async testOnChainFilter(poolKeys: LiquidityPoolKeysV4): Promise<void> {
    const filter = new OnChainFilter(this.connection);
    try {
      const result = await Promise.race([
        filter.execute(poolKeys),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Timeout')), TEST_CONFIG.TIMEOUT_MS))
      ]);
      logger.info(`On-Chain Filter: ${result.ok ? 'PASSED' : 'FAILED'} - ${result.message || 'No message'}`);
    } catch (error) {
      logger.error(`On-Chain Filter error: ${error}`);
    }
  }

  private async testDexScreenerFilter(poolKeys: LiquidityPoolKeysV4): Promise<void> {
    const filter = new DexScreenerFilter(this.connection);
    try {
      const result = await Promise.race([
        filter.execute(poolKeys),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Timeout')), TEST_CONFIG.TIMEOUT_MS))
      ]);
      logger.info(`DexScreener Filter: ${result.ok ? 'PASSED' : 'FAILED'} - ${result.message || 'No message'}`);
    } catch (error) {
      logger.error(`DexScreener Filter error: ${error}`);
    }
  }

  private createMockPoolKeys(baseMint: PublicKey): LiquidityPoolKeysV4 {
    return {
      id: Keypair.generate().publicKey,
      baseMint,
      quoteMint: new PublicKey('So11111111111111111111111111111111111111112'), // WSOL
      lpMint: Keypair.generate().publicKey,
      baseDecimals: 9,
      quoteDecimals: 9,
      lpDecimals: 9,
      version: 4,
      programId: Keypair.generate().publicKey,
      authority: Keypair.generate().publicKey,
      openOrders: Keypair.generate().publicKey,
      targetOrders: Keypair.generate().publicKey,
      baseVault: Keypair.generate().publicKey,
      quoteVault: Keypair.generate().publicKey,
      withdrawQueue: Keypair.generate().publicKey,
      lpVault: Keypair.generate().publicKey,
      marketVersion: 3,
      marketProgramId: Keypair.generate().publicKey,
      marketId: Keypair.generate().publicKey,
      marketAuthority: Keypair.generate().publicKey,
      marketBaseVault: Keypair.generate().publicKey,
      marketQuoteVault: Keypair.generate().publicKey,
      marketBids: Keypair.generate().publicKey,
      marketAsks: Keypair.generate().publicKey,
      marketEventQueue: Keypair.generate().publicKey,
    } as LiquidityPoolKeysV4;
  }
}

export async function runBotTests(): Promise<void> {
  const tester = new BotTester();
  await tester.runAllTests();
}

if (require.main === module) {
  runBotTests().catch(console.error);
}
