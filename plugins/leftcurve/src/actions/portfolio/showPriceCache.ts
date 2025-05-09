import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { PriceService } from '../../services/PriceService.js';

/**
 * Affiche le contenu du cache des prix pour le debugging
 */
export const showPriceCache = async (agent: StarknetAgentInterface) => {
  try {
    const priceService = PriceService.getInstance();
    const cacheEntries = priceService.getCacheEntries();
    
    if (cacheEntries.length === 0) {
      console.log('📂 Le cache des prix est vide.');
      return { 
        success: true, 
        data: { entries: [] },
        text: 'Le cache des prix est vide' 
      };
    }

    console.log('📊 Cache des prix:');
    
    // Formatter les données pour un affichage clair
    const formattedEntries = cacheEntries.map(([symbol, data]) => {
      const ageMs = Date.now() - data.timestamp;
      let ageString;
      
      if (ageMs < 60000) {
        ageString = `${Math.floor(ageMs / 1000)}s`;
      } else if (ageMs < 3600000) {
        ageString = `${Math.floor(ageMs / 60000)}m`;
      } else {
        ageString = `${Math.floor(ageMs / 3600000)}h`;
      }
      
      return {
        Symbol: symbol,
        'Prix (USD)': `$${data.price.toFixed(4)}`,
        Source: data.source,
        Age: ageString,
        'Timestamp': new Date(data.timestamp).toLocaleTimeString(),
      };
    });
    
    console.table(formattedEntries);
    
    return {
      success: true,
      data: {
        entries: cacheEntries.map(([symbol, data]) => ({
          symbol,
          price: data.price,
          source: data.source,
          timestamp: data.timestamp,
        }))
      },
      text: `${cacheEntries.length} entrées dans le cache des prix`
    };
  } catch (err) {
    console.error('❌ Erreur lors de l\'affichage du cache des prix:', err);
    return { 
      success: false, 
      text: `Erreur: ${String(err)}` 
    };
  }
}; 