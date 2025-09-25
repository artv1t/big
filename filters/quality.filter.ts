import { Connection } from '@solana/web3.js';
import { LiquidityPoolKeysV4 } from '@raydium-io/raydium-sdk';
import { Filter, FilterResult } from './index';
import { logger } from '../helpers';
import axios from 'axios';

interface DexScreenerData {
  volume24h: number;
  liquidity: number;
  pairCreatedAt: number;
  priceChange24h: number;
}

export class QualityFilter implements Filter {
  constructor(
    private readonly connection: Connection,
    private readonly minVolumeUSD: number = 1000,
    private readonly minLiquidityUSD: number = 10000,
    private readonly minAgeMinutes: number = 30,
  ) {}

  async execute(poolKeys: LiquidityPoolKeysV4): Promise<FilterResult> {
    try {
      const tokenAddress = poolKeys.baseMint.toString();
      
      const dexData = await this.getDexScreenerData(tokenAddress);
      
      if (!dexData) {
        return { 
          ok: false, 
          message: `Quality -> No DexScreener data found for ${tokenAddress}` 
        };
      }

      if (dexData.volume24h < this.minVolumeUSD) {
        return { 
          ok: false, 
          message: `Quality -> Volume $${dexData.volume24h.toFixed(0)} < $${this.minVolumeUSD}` 
        };
      }

      if (dexData.liquidity < this.minLiquidityUSD) {
        return { 
          ok: false, 
          message: `Quality -> Liquidity $${dexData.liquidity.toFixed(0)} < $${this.minLiquidityUSD}` 
        };
      }

      const ageMinutes = (Date.now() - dexData.pairCreatedAt) / (1000 * 60);
      if (ageMinutes < this.minAgeMinutes) {
        return { 
          ok: false, 
          message: `Quality -> Age ${ageMinutes.toFixed(1)}min < ${this.minAgeMinutes}min` 
        };
      }

      if (Math.abs(dexData.priceChange24h) > 90) {
        return { 
          ok: false, 
          message: `Quality -> Extreme volatility ${dexData.priceChange24h.toFixed(1)}%` 
        };
      }

      logger.debug(`Quality filter passed for ${tokenAddress}: Vol=$${dexData.volume24h.toFixed(0)}, Liq=$${dexData.liquidity.toFixed(0)}, Age=${ageMinutes.toFixed(1)}min`);
      
      return { ok: true };
      
    } catch (error) {
      logger.error(`Quality filter error for ${poolKeys.baseMint.toString()}: ${error}`);
      return { 
        ok: false, 
        message: `Quality -> API error: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  private async getDexScreenerData(tokenAddress: string): Promise<DexScreenerData | null> {
    try {
      const response = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
        { timeout: 5000 }
      );

      if (!response.data?.pairs || response.data.pairs.length === 0) {
        return null;
      }

      const pairs = response.data.pairs;
      const bestPair = pairs.reduce((best: any, current: any) => {
        const currentLiq = parseFloat(current.liquidity?.usd || '0');
        const bestLiq = parseFloat(best.liquidity?.usd || '0');
        return currentLiq > bestLiq ? current : best;
      });

      return {
        volume24h: parseFloat(bestPair.volume?.h24 || '0'),
        liquidity: parseFloat(bestPair.liquidity?.usd || '0'),
        pairCreatedAt: new Date(bestPair.pairCreatedAt || Date.now()).getTime(),
        priceChange24h: parseFloat(bestPair.priceChange?.h24 || '0'),
      };
      
    } catch (error) {
      logger.debug(`Failed to fetch DexScreener data for ${tokenAddress}: ${error}`);
      return null;
    }
  }
}
