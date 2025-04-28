import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { getContainerId } from '../../utils/getContainerId.js';
import { inspectParadexTradesTable } from '../../utils/paradexTradeHistory.js';

export interface InspectTradeTableParams {
  // No parameters needed for this action
}

/**
 * Debug tool to inspect the paradex_trades table structure
 */
export const inspectParadexTradeTable = async (
  agent: StarknetAgentInterface,
  params: InspectTradeTableParams
) => {
  try {
    console.log('🔍 Inspecting Paradex trade table structure');
    
    const containerId = getContainerId();
    const db = await agent.getDatabaseByName(`leftcurve_db_${containerId}`);
    
    if (!db) {
      throw new Error(`leftcurve_db_${containerId} not found`);
    }
    
    // Inspect table
    const inspectionResult = await inspectParadexTradesTable(db);
    
    if (!inspectionResult.success) {
      return {
        success: false,
        message: `Failed to inspect paradex_trades table: ${inspectionResult.error}`,
        data: null
      };
    }
    
    // Create summary message
    const summary = [
      '📊 Paradex Trades Table Inspection:',
      `Total records: ${inspectionResult.count}`,
      '',
      '📋 Table Structure:',
      ...(inspectionResult.columns.map((col: { column_name: string; data_type: string; is_nullable: string }) => 
        `- ${col.column_name} (${col.data_type})${col.is_nullable === 'YES' ? ' [nullable]' : ''}`
      )),
      '',
      '📝 Sample Record:',
      inspectionResult.sampleRecord ? JSON.stringify(inspectionResult.sampleRecord, null, 2) : 'No records found'
    ].join('\n');
    
    console.log(summary);
    
    return {
      success: true,
      message: summary,
      data: inspectionResult
    };
  } catch (error) {
    console.error('❌ Error inspecting Paradex trade table:', error);
    return {
      success: false,
      message: `Failed to inspect Paradex trade table: ${error instanceof Error ? error.message : String(error)}`,
      data: null
    };
  }
}; 