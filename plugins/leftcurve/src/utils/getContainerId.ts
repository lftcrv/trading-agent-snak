import * as fs from 'fs';
import * as os from 'os';

/**
 * Gets the container ID from environment variable, /etc/hostname, or returns a fixed value
 * @returns {string} The container ID or a fixed ID if not available
 */
export const getContainerId = (): string => {
  if (process.env.CONTAINER_ID) {
    return process.env.CONTAINER_ID;
  }

  try {
    const hostname = fs.readFileSync('/etc/hostname', 'utf8').trim();
    return hostname;
  } catch (error) {
    try {
      return os.hostname();
    } catch (hostError) {
      console.error('Error getting hostname:', hostError);
      return 'standalone-instance';
    }
  }
};
