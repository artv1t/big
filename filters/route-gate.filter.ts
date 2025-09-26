import { Connection, PublicKey } from '@solana/web3.js';
import { LiquidityPoolKeysV4 } from '@raydium-io/raydium-sdk';
import { Filter, FilterResult } from './index';
import { logger } from '../helpers';
import axios from 'axios';

interface JupiterQuoteResponse {
  data: Array<{
    inAmount: string;
    outAmount: string;
    priceImpactPct: number;
    otherAmountThreshold: string;
    swapMode: string;
    slippageBps: number;
    platformFee: null | any;
    contextSlot: number;
    timeTaken: number;
  }>;
  timeTaken: number;
}

export class RouteGateFilter implements Filter {
  constructor(
    private readonly connection: Connection,
    private readonly quoteAmount: number = 10000, // 0.0001 SOL in lamports
    private readonly maxPriceImpactBps: number = 1000, // 10% max price impact
  ) {}

  async execute(poolKeys: LiquidityPoolKeysV4): Promise<FilterResult> {
    try {
      const inputMint = 'So11111111111111111111111111111111111111112'; // WSOL
      const outputMint = poolKeys.baseMint.toString();
      
      const quote = await this.getJupiterQuote(inputMint, outputMint, this.quoteAmount);
      
      if (!quote) {
        return { 
          ok: false, 
          message: `Route Gate -> No Jupiter route found for ${outputMint}` 
        };
      }

      if (quote.priceImpactPct > this.maxPriceImpactBps / 100) {
        return { 
          ok: false, 
          message: `Route Gate -> Price impact ${quote.priceImpactPct.toFixed(2)}% > ${this.maxPriceImpactBps / 100}%` 
        };
      }

      logger.debug(`Route Gate filter passed for ${outputMint}: Price impact ${quote.priceImpactPct.toFixed(2)}%`);
      
      return { ok: true };
      
    } catch (error) {
      logger.error(`Route Gate filter error for ${poolKeys.baseMint.toString()}: ${error}`);
      return { 
        ok: false, 
        message: `Route Gate -> API error: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  private async getJupiterQuote(inputMint: string, outputMint: string, amount: number): Promise<any | null> {
    try {
      const response = await axios.get(
        `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`,
        { timeout: 5000 }
      );

      if (!response.data) {
        return null;
      }

      return {
        priceImpactPct: parseFloat(response.data.priceImpactPct || '0'),
        inAmount: response.data.inAmount,
        outAmount: response.data.outAmount,
      };
      
    } catch (error) {
      logger.debug(`Failed to fetch Jupiter quote for ${outputMint}: ${error}`);
      return null;
    }
  }
}
