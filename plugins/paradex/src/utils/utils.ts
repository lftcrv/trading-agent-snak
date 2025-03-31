import { shortString } from 'starknet';
import { SystemConfig, Account } from './paradex-ts/types.js';
import { validateParadexConfig } from './environment.js';
import { ParadexOrderError } from '../interfaces/errors.js';
import * as fs from 'fs';

export const getParadexEnv = () => {
  return validateParadexConfig();
};

export function getParadexConfig(): SystemConfig {
  const network = process.env.PARADEX_NETWORK?.toLowerCase();
  let apiBaseUrl: string;
  let chainId: string;

  if (network === 'prod') {
    apiBaseUrl = 'https://api.prod.paradex.trade/v1';
    chainId = shortString.encodeShortString('PRIVATE_SN_PARACLEAR_MAINNET');
  } else if (network === 'testnet') {
    apiBaseUrl = 'https://api.testnet.paradex.trade/v1';
    chainId = shortString.encodeShortString('PRIVATE_SN_POTC_SEPOLIA');
  } else {
    throw new Error(
      "Invalid PARADEX_NETWORK. Please set it to 'prod' or 'testnet'."
    );
  }

  return { apiBaseUrl, starknet: { chainId } };
}

export async function getAccount(): Promise<Account> {
  try {
    const network = process.env.PARADEX_NETWORK?.toLowerCase();

    if (!network) {
      throw new Error('PARADEX_NETWORK environment variable is not set');
    }

    const prefix = network === 'prod' ? 'PROD' : 'TESTNET';
    const address = process.env[`PARADEX_${prefix}_ADDRESS`];
    const privateKey = process.env[`PARADEX_${prefix}_PRIVATE_KEY`];

    if (!address || !privateKey) {
      throw new Error(
        `Missing Paradex credentials for ${network}. Required variables: PARADEX_${prefix}_ADDRESS and PARADEX_${prefix}_PRIVATE_KEY`
      );
    }

    const config = await validateParadexConfig();

    return {
      address: address,
      publicKey: address,
      privateKey: privateKey,
      ethereumAccount: config.ETHEREUM_ACCOUNT_ADDRESS,
    };
  } catch (error) {
    console.error('Failed to initialize account:', error);
    throw new ParadexOrderError('Failed to initialize account configuration');
  }
}

export class ParadexAuthenticationError extends Error {
  constructor(
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ParadexAuthenticationError';
  }
}
