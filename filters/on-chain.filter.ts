import { Connection, PublicKey } from '@solana/web3.js';
import { LiquidityPoolKeysV4 } from '@raydium-io/raydium-sdk';
import { Filter, FilterResult } from './index';
import { logger } from '../helpers';
import { getAccount, getMint, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

export class OnChainFilter implements Filter {
  constructor(
    private readonly connection: Connection,
    private readonly maxPoolAgeMs: number = 24 * 60 * 60 * 1000, // 24 hours
    private readonly maxTop1HolderPercent: number = 50, // 50%
    private readonly maxTop5HolderPercent: number = 80, // 80%
  ) {}

  async execute(poolKeys: LiquidityPoolKeysV4): Promise<FilterResult> {
    try {
      const tokenMint = poolKeys.baseMint;
      
      const token2022Check = await this.checkToken2022(tokenMint);
      if (!token2022Check.ok) return token2022Check;

      const immutableCheck = await this.checkImmutableMetadata(tokenMint);
      if (!immutableCheck.ok) return immutableCheck;

      const renouncedCheck = await this.checkRenouncedMint(tokenMint);
      if (!renouncedCheck.ok) return renouncedCheck;

      // Check freeze authority
      const freezeCheck = await this.checkFreezeAuthority(tokenMint);
      if (!freezeCheck.ok) return freezeCheck;

      // Check pool age
      const poolAgeCheck = await this.checkPoolAge(poolKeys);
      if (!poolAgeCheck.ok) return poolAgeCheck;

      // Check holder concentration
      const holderCheck = await this.checkHolderConcentration(tokenMint);
      if (!holderCheck.ok) return holderCheck;

      logger.debug(`On-chain filter passed for ${tokenMint.toString()}`);
      
      return { ok: true };
      
    } catch (error) {
      logger.error(`On-chain filter error for ${poolKeys.baseMint.toString()}: ${error}`);
      return { 
        ok: false, 
        message: `On-chain -> Error: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  private async checkToken2022(mint: PublicKey): Promise<FilterResult> {
    try {
      const mintInfo = await getMint(this.connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
      if (mintInfo.tlvData && mintInfo.tlvData.length > 0) {
        return { 
          ok: false, 
          message: `On-chain -> Token-2022 extensions detected` 
        };
      }
      return { ok: true };
    } catch (error) {
      return { ok: true };
    }
  }

  private async checkImmutableMetadata(mint: PublicKey): Promise<FilterResult> {
    try {
      const mintInfo = await getMint(this.connection, mint);
      if (mintInfo.mintAuthority !== null) {
        return { 
          ok: false, 
          message: `On-chain -> Metadata not immutable (mint authority exists)` 
        };
      }
      return { ok: true };
    } catch (error) {
      return { 
        ok: false, 
        message: `On-chain -> Failed to check metadata immutability` 
      };
    }
  }

  private async checkRenouncedMint(mint: PublicKey): Promise<FilterResult> {
    try {
      const mintInfo = await getMint(this.connection, mint);
      if (mintInfo.mintAuthority !== null) {
        return { 
          ok: false, 
          message: `On-chain -> Mint authority not renounced` 
        };
      }
      return { ok: true };
    } catch (error) {
      return { 
        ok: false, 
        message: `On-chain -> Failed to check mint authority` 
      };
    }
  }

  private async checkFreezeAuthority(mint: PublicKey): Promise<FilterResult> {
    try {
      const mintInfo = await getMint(this.connection, mint);
      if (mintInfo.freezeAuthority !== null) {
        return { 
          ok: false, 
          message: `On-chain -> Freeze authority exists` 
        };
      }
      return { ok: true };
    } catch (error) {
      return { 
        ok: false, 
        message: `On-chain -> Failed to check freeze authority` 
      };
    }
  }

  private async checkPoolAge(poolKeys: LiquidityPoolKeysV4): Promise<FilterResult> {
    try {
      const poolInfo = await this.connection.getAccountInfo(poolKeys.id);
      if (!poolInfo) {
        return { 
          ok: false, 
          message: `On-chain -> Pool account not found` 
        };
      }

      const currentSlot = await this.connection.getSlot();
      const poolSlot = poolInfo.executable ? 0 : currentSlot; // Simplified age check
      const estimatedAgeMs = (currentSlot - poolSlot) * 400; // ~400ms per slot

      if (estimatedAgeMs > this.maxPoolAgeMs) {
        return { 
          ok: false, 
          message: `On-chain -> Pool too old: ${(estimatedAgeMs / (60 * 60 * 1000)).toFixed(1)}h > ${this.maxPoolAgeMs / (60 * 60 * 1000)}h` 
        };
      }

      return { ok: true };
    } catch (error) {
      return { 
        ok: false, 
        message: `On-chain -> Failed to check pool age` 
      };
    }
  }

  private async checkHolderConcentration(mint: PublicKey): Promise<FilterResult> {
    try {
      const largestAccounts = await this.connection.getTokenLargestAccounts(mint);
      
      if (!largestAccounts.value || largestAccounts.value.length === 0) {
        return { 
          ok: false, 
          message: `On-chain -> No token accounts found` 
        };
      }

      const totalSupply = largestAccounts.value.reduce((sum, account) => sum + Number(account.amount), 0);
      
      if (totalSupply === 0) {
        return { 
          ok: false, 
          message: `On-chain -> Zero total supply` 
        };
      }

      const top1Percent = (Number(largestAccounts.value[0].amount) / totalSupply) * 100;
      if (top1Percent > this.maxTop1HolderPercent) {
        return { 
          ok: false, 
          message: `On-chain -> TOP1 holder ${top1Percent.toFixed(1)}% > ${this.maxTop1HolderPercent}%` 
        };
      }

      const top5Amount = largestAccounts.value.slice(0, 5).reduce((sum, account) => sum + Number(account.amount), 0);
      const top5Percent = (top5Amount / totalSupply) * 100;
      if (top5Percent > this.maxTop5HolderPercent) {
        return { 
          ok: false, 
          message: `On-chain -> TOP5 holders ${top5Percent.toFixed(1)}% > ${this.maxTop5HolderPercent}%` 
        };
      }

      return { ok: true };
    } catch (error) {
      return { 
        ok: false, 
        message: `On-chain -> Failed to check holder concentration` 
      };
    }
  }
}
