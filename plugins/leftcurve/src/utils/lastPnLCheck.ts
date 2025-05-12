// Store the timestamp of the last PnL check
let lastPnLCheckTimestamp: number | null = null;

// Time window in milliseconds (5 minutes)
const PNL_CHECK_WINDOW_MS = 5 * 60 * 1000;

/**
 * Record that a PnL check was just performed
 */
export const recordPnLCheck = (): void => {
  lastPnLCheckTimestamp = Date.now();
  console.log('📊 PnL check recorded at:', new Date(lastPnLCheckTimestamp).toISOString());
};

/**
 * Check if a PnL check was performed within the allowed time window
 * 
 * @returns {boolean} True if a PnL check was performed within the allowed time window
 */
export const isPnLCheckRecent = (): boolean => {
  if (lastPnLCheckTimestamp === null) {
    console.log('⚠️ No PnL check has been recorded yet');
    return false;
  }
  
  const now = Date.now();
  const timeSinceLastCheck = now - lastPnLCheckTimestamp;
  const isRecent = timeSinceLastCheck <= PNL_CHECK_WINDOW_MS;
  
  if (isRecent) {
    console.log(`✅ PnL was checked recently (${Math.round(timeSinceLastCheck / 1000)} seconds ago)`);
  } else {
    console.log(`⚠️ PnL check is outdated (${Math.round(timeSinceLastCheck / 1000)} seconds ago, limit is ${PNL_CHECK_WINDOW_MS / 1000} seconds)`);
  }
  
  return isRecent;
}; 