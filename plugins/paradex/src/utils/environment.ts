import { z } from 'zod';

// Schema for environment variables
const paradexEnvSchema = z.object({
  PARADEX_NETWORK: z.enum(['mainnet', 'testnet']),
  PARADEX_MAINNET_ADDRESS: z.string().optional(),
  PARADEX_TESTNET_ADDRESS: z.string().optional(),
  PARADEX_MAINNET_PRIVATE_KEY: z.string().optional(),
  PARADEX_TESTNET_PRIVATE_KEY: z.string().optional(),
  ETHEREUM_ACCOUNT_ADDRESS: z.string(),
});

export type ParadexConfig = z.infer<typeof paradexEnvSchema>;

export async function validateParadexConfig(): Promise<ParadexConfig> {
  try {
    const network = process.env.PARADEX_NETWORK?.toLowerCase();

    if (!network) {
      throw new Error('PARADEX_NETWORK environment variable is not set');
    }

    const prefix = network === 'prod' ? 'PROD' : 'TESTNET';
    const address = process.env[`PARADEX_${prefix}_ADDRESS`];
    const privateKey = process.env[`PARADEX_${prefix}_PRIVATE_KEY`];

    const config = {
      PARADEX_NETWORK: network,
      PARADEX_ACCOUNT_ADDRESS: address,
      PARADEX_PRIVATE_KEY: privateKey,
      ETHEREUM_ACCOUNT_ADDRESS: process.env.ETHEREUM_ACCOUNT_ADDRESS,
    };

    return paradexEnvSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join('\n');
      throw new Error(
        `Paradex configuration validation failed:\n${errorMessages}`
      );
    }
    throw error;
  }
}
