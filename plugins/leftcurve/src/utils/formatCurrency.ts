/**
 * Formats a number as currency (USD)
 * @param amount The amount to format
 * @param decimals The number of decimal places to show
 * @returns Formatted currency string
 */
export const formatCurrency = (amount: number, decimals: number = 2): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(amount);
}; 