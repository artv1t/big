import { Connection } from '@solana/web3.js';
import { LiquidityPoolKeysV4, Token, TokenAmount } from '@raydium-io/raydium-sdk';
import { getMetadataAccountDataSerializer } from '@metaplex-foundation/mpl-token-metadata';
import { BurnFilter } from './burn.filter';
import { MutableFilter } from './mutable.filter';
import { RenouncedFreezeFilter } from './renounced.filter';
import { PoolSizeFilter } from './pool-size.filter';
import { QualityFilter } from './quality.filter';
import { RouteGateFilter } from './route-gate.filter';
import { OnChainFilter } from './on-chain.filter';
import { DexScreenerFilter } from './dexscreener.filter';
import { LPProtectionFilter } from './lp-protection.filter';
import { CHECK_IF_BURNED, CHECK_IF_FREEZABLE, CHECK_IF_MINT_IS_RENOUNCED, CHECK_IF_MUTABLE, CHECK_IF_SOCIALS, logger } from '../helpers';
import { SessionLogger } from '../analysis-logger';

export interface Filter {
  execute(poolKeysV4: LiquidityPoolKeysV4): Promise<FilterResult>;
}

export interface FilterResult {
  ok: boolean;
  message?: string;
}

export interface PoolFilterArgs {
  minPoolSize: TokenAmount;
  maxPoolSize: TokenAmount;
  quoteToken: Token;
}

export class PoolFilters {
  private readonly filters: Filter[] = [];

  constructor(
    readonly connection: Connection,
    readonly args: PoolFilterArgs,
    private readonly sessionLogger?: SessionLogger,
  ) {
    this.filters.push(new RouteGateFilter(connection, 100000, 1000)); // 0.0001 SOL, 10% max impact

    if (CHECK_IF_BURNED) {
      this.filters.push(new BurnFilter(connection));
    }

    if (CHECK_IF_MINT_IS_RENOUNCED || CHECK_IF_FREEZABLE) {
      this.filters.push(new RenouncedFreezeFilter(connection, CHECK_IF_MINT_IS_RENOUNCED, CHECK_IF_FREEZABLE));
    }

    if (CHECK_IF_MUTABLE || CHECK_IF_SOCIALS) {
      this.filters.push(new MutableFilter(connection, getMetadataAccountDataSerializer(), CHECK_IF_MUTABLE, CHECK_IF_SOCIALS));
    }

    if (!args.minPoolSize.isZero() || !args.maxPoolSize.isZero()) {
      this.filters.push(new PoolSizeFilter(connection, args.quoteToken, args.minPoolSize, args.maxPoolSize));
    }

    this.filters.push(new OnChainFilter(connection));
    this.filters.push(new LPProtectionFilter(connection));
    this.filters.push(new QualityFilter(connection));
    this.filters.push(new DexScreenerFilter(connection, true, true));
  }

  public async execute(poolKeys: LiquidityPoolKeysV4): Promise<boolean> {
    if (this.filters.length === 0) {
      return true;
    }

    const tokenAddress = poolKeys.baseMint.toString();
    const result = await Promise.all(this.filters.map((f) => f.execute(poolKeys)));
    const pass = result.every((r) => r.ok);

    if (this.sessionLogger) {
      result.forEach((r, index) => {
        const filterName = this.getFilterName(index);
        this.sessionLogger!.logFilterResult(filterName, r.ok, tokenAddress, r.message);
      });
    }

    if (pass) {
      return true;
    }

    for (const filterResult of result.filter((r) => !r.ok)) {
      logger.trace(filterResult.message);
    }

    return false;
  }

  private getFilterName(index: number): string {
    const filterNames = [
      'route_gate', 'burn', 'renounced', 'mutable', 'poolSize', 
      'on_chain', 'lp_protection', 'quality', 'dexscreener'
    ];
    return filterNames[index] || `filter${index}`;
  }
}
