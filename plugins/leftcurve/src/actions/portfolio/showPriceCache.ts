import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { PriceService } from '../../services/PriceService.js';

/**
 * Affiche le contenu du cache des prix pour le debugging
 */
export const showPriceCache = async (agent: StarknetAgentInterface) => {
  try {
    const priceService = PriceService.getInstance();
    const cacheStatus = priceService.getCacheStatus();
    const cacheEntries = Object.entries(cacheStatus);
    
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
      return {
        Symbol: symbol,
        'Prix (USD)': `$${data.price.toFixed(4)}`,
        Source: data.source,
        Age: data.age,
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
          age: data.age,
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