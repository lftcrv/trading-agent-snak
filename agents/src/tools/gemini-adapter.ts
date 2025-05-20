/**
 * Gemini API Schema Adapter
 * 
 * This module provides functions to adapt JSON Schemas generated from Zod to be compatible
 * with the Google Gemini API, which has more limited JSON Schema support compared to other LLMs.
 */

/**
 * Recursively cleans a JSON Schema object to be compatible with Gemini API.
 * Specifically handles:
 * - exclusiveMinimum -> converts to minimum with adjusted value
 * - exclusiveMaximum -> converts to maximum with adjusted value
 * - Potentially other incompatible properties as needed
 * 
 * @param schema The JSON Schema object to clean
 * @returns A Gemini-compatible JSON Schema
 */
export function cleanJsonSchemaForGemini(schema: any): any {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }
  
  const result = Array.isArray(schema) 
    ? schema.map(cleanJsonSchemaForGemini) 
    : { ...schema };
  
  // Handle arrays
  if (Array.isArray(result)) {
    return result;
  }
  
  // Process exclusiveMinimum (a common issue with Gemini)
  if ('exclusiveMinimum' in result) {
    // Convert exclusiveMinimum: 0 (positive numbers) to minimum: 1
    if (result.exclusiveMinimum === 0) {
      result.minimum = 1;
    } else {
      // For other values, we increment by a small amount based on the type
      const increment = Number.isInteger(result.exclusiveMinimum) ? 1 : 0.000001;
      result.minimum = result.exclusiveMinimum + increment;
    }
    delete result.exclusiveMinimum;
  }

  // Process exclusiveMaximum
  if ('exclusiveMaximum' in result) {
    // Convert to maximum with slightly decreased value
    const decrement = Number.isInteger(result.exclusiveMaximum) ? 1 : 0.000001;
    result.maximum = result.exclusiveMaximum - decrement;
    delete result.exclusiveMaximum;
  }
  
  // Recursively clean nested objects and properties
  for (const key in result) {
    if (typeof result[key] === 'object' && result[key] !== null) {
      result[key] = cleanJsonSchemaForGemini(result[key]);
    }
  }
  
  return result;
}

/**
 * Adapts function declarations for Gemini compatibility
 * 
 * @param functionDeclarations Function declarations to adapt
 * @returns Gemini-compatible function declarations
 */
export function adaptFunctionDeclarationsForGemini(functionDeclarations: any[]): any[] {
  if (!functionDeclarations || !Array.isArray(functionDeclarations)) {
    return functionDeclarations;
  }
  
  return functionDeclarations.map(func => {
    if (!func || typeof func !== 'object') return func;
    
    const adapted = { ...func };
    
    // Clean the parameters schema
    if (adapted.parameters && typeof adapted.parameters === 'object') {
      adapted.parameters = cleanJsonSchemaForGemini(adapted.parameters);
    }
    
    return adapted;
  });
}

/**
 * Adapts tools configuration for Gemini compatibility
 * 
 * @param tools Tools configuration to adapt
 * @returns Gemini-compatible tools configuration
 */
export function adaptToolsForGemini(tools: any[]): any[] {
  if (!tools || !Array.isArray(tools)) {
    return tools;
  }
  
  return tools.map(tool => {
    if (!tool || typeof tool !== 'object') return tool;
    
    const adaptedTool = { ...tool };
    
    // Handle function declarations
    if (adaptedTool.functionDeclarations) {
      adaptedTool.functionDeclarations = adaptFunctionDeclarationsForGemini(
        adaptedTool.functionDeclarations
      );
    }
    
    return adaptedTool;
  });
} 