import { getContainerId } from '../../utils/getContainerId.js';
import { StarknetAgentInterface } from '@starknet-agent-kit/agents';

export const printPortfolio = async (agent: StarknetAgentInterface) => {
  try {
    const containerId = getContainerId();

    const db = await agent.getDatabaseByName(`leftcurve_db_${containerId}`);
    if (!db) throw new Error(`leftcurve_db_${containerId} not found`);

    const result = await db.select({
      FROM: ['sak_table_portfolio'],
      SELECT: ['token_symbol', 'balance'],
    });

    if (result.status !== 'success' || !result.query) {
      throw new Error('Failed to fetch portfolio');
    }

    const rows = result.query.rows;

    if (rows.length === 0) {
      console.log('📉 Portfolio is empty.');
      return { success: true, message: 'Portfolio is empty.' };
    }

    console.log('📊 Your Portfolio:');
    console.table(
      rows.map((row: any) => ({
        Token: row.token_symbol,
        Balance: Number(row.balance).toFixed(6),
      }))
    );

    return {
      success: true,
      portfolio: rows.map((row: any) => ({
        token_symbol: row.token_symbol,
        balance: Number(row.balance),
      })),
    };
  } catch (err) {
    console.error('Error printing portfolio:', err);
    return { success: false, message: `${err}` };
  }
};
