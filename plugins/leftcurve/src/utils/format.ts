/**
 * Formats a token amount string or number into its base unit representation
 * @param {string | number} amount - Human-readable amount (e.g., 1.5)
 * @param {number} [decimals=18] - Number of decimals of the token
 * @returns {string} Amount in base units (e.g., wei)
 */
export const formatTokenAmount = (
  amount: string | number,
  decimals: number = 18
): string => {
  const value = typeof amount === 'string' ? amount : amount.toString();
  const [whole, fraction = ''] = value.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0');
  return whole + paddedFraction;
};
