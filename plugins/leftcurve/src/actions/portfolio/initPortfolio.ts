import {
  StarknetAgentInterface,
  PostgresAdaptater,
} from '@starknet-agent-kit/agents';

export const initPortfolio = async (agent: StarknetAgentInterface) => {
  try {
    // Grab the existing DB by name
    const db = await agent.getDatabaseByName('leftcurve_db');
    if (!db) {
      throw new Error('leftcurve_db not found');
    }

    // Check if a USDC row exists
    const selectResult = await db.select({
      FROM: ['sak_table_portfolio'],
      SELECT: ['token_symbol', 'balance'],
      WHERE: [`token_symbol = 'USDC'`],
    });

    if (
      selectResult.status === 'success' &&
      selectResult.query &&
      selectResult.query.rows.length > 0
    ) {
      console.log('Already have a USDC entry, skipping insert.');
      return {
        success: true,
        message: 'Portfolio already initialized with USDC.',
      };
    }

    // Otherwise, insert a row with 1000 USDC
    const insertResult = await db.insert({
      table_name: 'sak_table_portfolio',
      fields: new Map([
        ['token_symbol', 'USDC'],
        ['balance', '1000.00000000'], // numeric(18,8)
      ]),
    });

    if (insertResult.status === 'success') {
      console.log('Inserted initial USDC balance = 1000 into portfolio');
      return {
        success: true,
        message: 'Portfolio initialized with 1000 USDC.',
      };
    } else {
      console.error('Failed to insert initial USDC row:', insertResult);
      return {
        success: false,
        message: 'Could not initialize portfolio with USDC.',
      };
    }
  } catch (error) {
    console.error('Error in initPortfolio:', error);
    return { success: false, message: `${error}` };
  }
};
