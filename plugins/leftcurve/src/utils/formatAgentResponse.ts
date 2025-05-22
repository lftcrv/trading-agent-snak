/**
 * Utility to format data consistently for both agent and console output
 * This ensures data is always in JSON format for the agent while maintaining
 * consistent log formatting
 * @param data - The data to format (object or string)
 * @param type - The type of data being returned (e.g., 'portfolio', 'prices', etc.)
 * @returns Formatted response suitable for both agent and console logs
 */
export const formatAgentResponse = (
  data: any,
  type: string
): string => {
  // If data is already a string, try to parse it as JSON
  // Otherwise, keep it as is
  let dataObj = typeof data === 'string' ? 
    ((() => { try { return JSON.parse(data); } catch { return null; }})()) || data : 
    data;
  
  // Format the response as JSON
  const response = {
    type,
    timestamp: new Date().toISOString(),
    data: dataObj
  };
  
  // Return the formatted response as a JSON string
  return JSON.stringify(response, null, 2);
}; 