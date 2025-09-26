import { Connection, PublicKey } from '@solana/web3.js';
import { LiquidityPoolKeysV4 } from '@raydium-io/raydium-sdk';
import { Filter, FilterResult } from './index';
import { logger } from '../helpers';

export class LPProtectionFilter implements Filter {
  private readonly lpLockWhitelist = [
    'FLXSQ6RpG1hoBdgBFjjAYNc8eHFXs3BoWWzTJ3NxJV1P', // Fluxbeam
    'UcUrKQB3yeMqG8scHQHSBJGmSyNurbPkg5Y3x4Y6XD2', // Team Finance
  ];

  constructor(
    private readonly connection: Connection,
    private readonly lpLockDeadlineMs: number = 30 * 60 * 1000, // 30 minutes
    private readonly minBurnPercentage: number = 80, // 80% LP burn required
  ) {}

  async execute(poolKeys: LiquidityPoolKeysV4): Promise<FilterResult> {
    try {
      const lpMint = poolKeys.lpMint;
      
      const lockerCheck = await this.checkLPInLocker(lpMint);
      if (lockerCheck.ok) {
        return lockerCheck;
      }

      logger.debug(`LP not in known locker, waiting ${this.lpLockDeadlineMs / 1000}s for burn check...`);
      
      await new Promise(resolve => setTimeout(resolve, this.lpLockDeadlineMs));
      
      const burnCheck = await this.checkLPBurnPercentage(lpMint);
      return burnCheck;
      
    } catch (error) {
      logger.error(`LP Protection filter error for ${poolKeys.baseMint.toString()}: ${error}`);
      return { 
        ok: false, 
        message: `LP Protection -> Error: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  private async checkLPInLocker(lpMint: PublicKey): Promise<FilterResult> {
    try {
      const largestAccounts = await this.connection.getTokenLargestAccounts(lpMint);
      
      if (!largestAccounts.value || largestAccounts.value.length === 0) {
        return { 
          ok: false, 
          message: `LP Protection -> No LP accounts found` 
        };
      }

      for (const account of largestAccounts.value) {
        const accountInfo = await this.connection.getAccountInfo(account.address);
        if (accountInfo?.owner) {
          const ownerString = accountInfo.owner.toString();
          if (this.lpLockWhitelist.includes(ownerString)) {
            logger.debug(`LP found in whitelisted locker: ${ownerString}`);
            return { ok: true };
          }
        }
      }

      return { 
        ok: false, 
        message: `LP Protection -> Not in whitelisted locker` 
      };
      
    } catch (error) {
      return { 
        ok: false, 
        message: `LP Protection -> Failed to check locker status` 
      };
    }
  }

  private async checkLPBurnPercentage(lpMint: PublicKey): Promise<FilterResult> {
    try {
      const mintInfo = await this.connection.getParsedAccountInfo(lpMint);
      
      if (!mintInfo.value?.data || typeof mintInfo.value.data !== 'object' || !('parsed' in mintInfo.value.data)) {
        return { 
          ok: false, 
          message: `LP Protection -> Failed to get LP mint info` 
        };
      }

      const parsedData = mintInfo.value.data.parsed;
      const totalSupply = parsedData.info.supply;
      
      const largestAccounts = await this.connection.getTokenLargestAccounts(lpMint);
      
      if (!largestAccounts.value || largestAccounts.value.length === 0) {
        return { 
          ok: false, 
          message: `LP Protection -> No LP accounts found` 
        };
      }

      const burnAddresses = [
        '11111111111111111111111111111111', // System program (burn)
        '1nc1nerator11111111111111111111111111111111', // Incinerator
      ];

      let burnedAmount = 0;
      for (const account of largestAccounts.value) {
        const accountAddress = account.address.toString();
        if (burnAddresses.includes(accountAddress)) {
          burnedAmount += Number(account.amount);
        }
      }

      const burnPercentage = (burnedAmount / Number(totalSupply)) * 100;
      
      if (burnPercentage < this.minBurnPercentage) {
        return { 
          ok: false, 
          message: `LP Protection -> Burn ${burnPercentage.toFixed(1)}% < ${this.minBurnPercentage}%` 
        };
      }

      logger.debug(`LP Protection passed: ${burnPercentage.toFixed(1)}% burned`);
      return { ok: true };
      
    } catch (error) {
      return { 
        ok: false, 
        message: `LP Protection -> Failed to check burn percentage` 
      };
    }
  }
}
