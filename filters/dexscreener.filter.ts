import { Connection } from '@solana/web3.js';
import { LiquidityPoolKeysV4 } from '@raydium-io/raydium-sdk';
import { Filter, FilterResult } from './index';
import { logger } from '../helpers';
import axios from 'axios';

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd: string;
  txns: {
    m5: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h24: { buys: number; sells: number };
  };
  volume: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  priceChange: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  liquidity: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv: number;
  pairCreatedAt: number;
  info: {
    imageUrl?: string;
    websites?: Array<{ label: string; url: string }>;
    socials?: Array<{ type: string; url: string }>;
  };
}

interface DexScreenerResponse {
  schemaVersion: string;
  pairs: DexScreenerPair[];
}

export class DexScreenerFilter implements Filter {
  private readonly socialWhitelist = ['twitter', 'telegram', 'discord', 'x.com'];
  private readonly maxPollDurationMs: number = 15 * 60 * 1000; // 15 minutes
  private readonly pollIntervalMs: number = 25 * 1000; // 25 seconds

  constructor(
    private readonly connection: Connection,
    private readonly requireLogo: boolean = true,
    private readonly requireSocials: boolean = true,
  ) {}

  async execute(poolKeys: LiquidityPoolKeysV4): Promise<FilterResult> {
    const tokenAddress = poolKeys.baseMint.toString();
    
    try {
      const result = await this.pollDexScreenerData(tokenAddress);
      return result;
    } catch (error) {
      logger.error(`DexScreener filter error for ${tokenAddress}: ${error}`);
      return { 
        ok: false, 
        message: `DexScreener -> Error: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  private async pollDexScreenerData(tokenAddress: string): Promise<FilterResult> {
    const startTime = Date.now();
    let attempts = 0;

    while (Date.now() - startTime < this.maxPollDurationMs) {
      attempts++;
      
      try {
        const data = await this.getDexScreenerData(tokenAddress);
        
        if (data) {
          const validationResult = this.validateDexScreenerData(data, tokenAddress);
          if (validationResult.ok) {
            logger.debug(`DexScreener filter passed for ${tokenAddress} after ${attempts} attempts`);
            return validationResult;
          }
        }

        logger.debug(`DexScreener attempt ${attempts} for ${tokenAddress}: waiting for data...`);
        
        await new Promise(resolve => setTimeout(resolve, this.pollIntervalMs));
        
      } catch (error) {
        logger.debug(`DexScreener poll error for ${tokenAddress}: ${error}`);
      }
    }

    return { 
      ok: false, 
      message: `DexScreener -> Timeout: No valid data after ${this.maxPollDurationMs / 1000}s` 
    };
  }

  private async getDexScreenerData(tokenAddress: string): Promise<DexScreenerPair | null> {
    try {
      const response = await axios.get<DexScreenerResponse>(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
        { timeout: 10000 }
      );

      if (!response.data?.pairs || response.data.pairs.length === 0) {
        return null;
      }

      const bestPair = response.data.pairs.reduce((best, current) => {
        const currentLiq = current.liquidity?.usd || 0;
        const bestLiq = best.liquidity?.usd || 0;
        return currentLiq > bestLiq ? current : best;
      });

      return bestPair;
      
    } catch (error) {
      logger.debug(`Failed to fetch DexScreener data for ${tokenAddress}: ${error}`);
      return null;
    }
  }

  private validateDexScreenerData(pair: DexScreenerPair, tokenAddress: string): FilterResult {
    if (this.requireLogo && !pair.info?.imageUrl) {
      return { 
        ok: false, 
        message: `DexScreener -> No logo found` 
      };
    }

    if (this.requireSocials) {
      const socials = pair.info?.socials || [];
      const websites = pair.info?.websites || [];
      
      const hasSocial = socials.some(social => 
        this.socialWhitelist.some(platform => 
          social.type.toLowerCase().includes(platform) || 
          social.url.toLowerCase().includes(platform)
        )
      ) || websites.some(website => 
        this.socialWhitelist.some(platform => 
          website.url.toLowerCase().includes(platform)
        )
      );

      if (!hasSocial) {
        return { 
          ok: false, 
          message: `DexScreener -> No whitelisted social media found` 
        };
      }
    }

    const socialCount = (pair.info?.socials?.length || 0) + (pair.info?.websites?.length || 0);
    logger.debug(`DexScreener validation passed for ${tokenAddress}: Logo=${!!pair.info?.imageUrl}, Socials=${socialCount}`);

    return { ok: true };
  }
}
