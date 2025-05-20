import { ChatAnthropic } from '@langchain/anthropic';
import { AiConfig } from '../common/index.js';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOllama } from '@langchain/ollama';
import { ChatDeepSeek } from '@langchain/deepseek';
import { StarknetAgentInterface } from './tools/tools.js';
import { createSignatureTools } from './tools/signatureTools.js';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { createAllowedToollkits } from './tools/external_tools.js';
import { createAllowedTools } from './tools/tools.js';
import { MCP_CONTROLLER } from './mcp/src/mcp.js';
import { adaptToolsForGemini } from './tools/gemini-adapter.js';

// Monkey patch the ChatGoogleGenerativeAI for tools compatibility
// This ensures the patch is applied only once
let isGeminiPatched = false;
function patchGeminiForToolsCompat() {
  if (isGeminiPatched) return;
  
  // Get the original _generate method directly from the prototype
  const originalGenerate = ChatGoogleGenerativeAI.prototype._generate;
  
  // Override the method
  ChatGoogleGenerativeAI.prototype._generate = async function(...args) {
    try {
      // If we have tools in our params, patch them before sending
      const messages = args[0];
      const options = args[1];
      
      if (options && options.tools) {
        console.log('Adapting tools for Gemini compatibility');
        
        // Make a deep copy and adapt tools
        const adaptedTools = JSON.parse(JSON.stringify(options.tools));
        for (const tool of adaptedTools) {
          if (tool.functionDeclarations) {
            for (const func of tool.functionDeclarations) {
              if (func.parameters) {
                // Remove exclusiveMinimum property recursively
                const cleanObject = (obj: any) => {
                  if (!obj || typeof obj !== 'object') return;
                  
                  if ('exclusiveMinimum' in obj) {
                    // Convert exclusiveMinimum: 0 to minimum: 1
                    if (obj.exclusiveMinimum === 0) {
                      obj.minimum = 1;
                    } else {
                      const increment = Number.isInteger(obj.exclusiveMinimum) ? 1 : 0.000001;
                      obj.minimum = obj.exclusiveMinimum + increment;
                    }
                    delete obj.exclusiveMinimum;
                  }
                  
                  if ('exclusiveMaximum' in obj) {
                    const decrement = Number.isInteger(obj.exclusiveMaximum) ? 1 : 0.000001;
                    obj.maximum = obj.exclusiveMaximum - decrement;
                    delete obj.exclusiveMaximum;
                  }
                  
                  // Process nested properties
                  for (const key in obj) {
                    if (typeof obj[key] === 'object' && obj[key] !== null) {
                      cleanObject(obj[key]);
                    }
                  }
                };
                
                cleanObject(func.parameters);
              }
            }
          }
        }
        
        // Replace with adapted tools
        options.tools = adaptedTools;
      }
      
      // Call the original method with the modified options
      return await originalGenerate.apply(this, args);
    } catch (error) {
      console.error('Error in patched Gemini _generate method:', error);
      // Fall back to original method if our patch fails
      return await originalGenerate.apply(this, args);
    }
  };
  
  isGeminiPatched = true;
}

export const createAgent = async (
  starknetAgent: StarknetAgentInterface,
  aiConfig: AiConfig
) => {
  const isSignature = starknetAgent.getSignature().signature === 'wallet';
  
  // If Gemini is being used, apply our compatibility patch
  if (aiConfig.aiProvider === 'gemini') {
    patchGeminiForToolsCompat();
  }
  
  const model = () => {
    switch (aiConfig.aiProvider) {
      case 'anthropic':
        if (!aiConfig.aiProviderApiKey) {
          throw new Error(
            'Valid Anthropic api key is required https://docs.anthropic.com/en/api/admin-api/apikeys/get-api-key'
          );
        }
        return new ChatAnthropic({
          modelName: aiConfig.aiModel,
          anthropicApiKey: aiConfig.aiProviderApiKey,
        });
      case 'openai':
        if (!aiConfig.aiProviderApiKey) {
          throw new Error(
            'Valid OpenAI api key is required https://platform.openai.com/api-keys'
          );
        }
        return new ChatOpenAI({
          modelName: aiConfig.aiModel,
          apiKey: aiConfig.aiProviderApiKey,
        });
      case 'gemini':
        if (!aiConfig.aiProviderApiKey) {
          throw new Error(
            'Valid Gemini api key is required https://ai.google.dev/gemini-api/docs/api-key'
          );
        }
        return new ChatGoogleGenerativeAI({
          modelName: aiConfig.aiModel,
          apiKey: aiConfig.aiProviderApiKey,
          convertSystemMessageToHumanContent: true,
        });
      case 'ollama':
        return new ChatOllama({
          model: aiConfig.aiModel,
        });
      case 'deepseek':
        if (!aiConfig.aiProviderApiKey) {
          throw new Error(
            'Valid DeepSeek api key is required https://api-docs.deepseek.com/'
          );
        }
        return new ChatDeepSeek({
          modelName: aiConfig.aiModel,
          apiKey: aiConfig.aiProviderApiKey,
        });
      default:
        throw new Error(`Unsupported AI provider: ${aiConfig.aiProvider}`);
    }
  };

  try {
    const modelSelected = model();
    const json_config = starknetAgent.getAgentConfig();

    if (!json_config) {
      throw new Error('Agent configuration is required');
    }
    let tools;
    if (isSignature === true) {
      tools = await createSignatureTools(json_config.internal_plugins);
    } else {
      const allowedTools = await createAllowedTools(
        starknetAgent,
        json_config.internal_plugins
      );

      const allowedToolsKits = json_config.external_plugins
        ? createAllowedToollkits(json_config.external_plugins)
        : null;

      tools = allowedToolsKits
        ? [...allowedTools, ...allowedToolsKits]
        : [...allowedTools];
    }
    if (json_config.mcp === true) {
      const mcp = new MCP_CONTROLLER();
      await mcp.initializeConnections();
      console.log(mcp.getTools());
      tools = [...tools, ...mcp.getTools()];
    }

    const agent = createReactAgent({
      llm: modelSelected,
      tools,
      messageModifier: json_config.prompt,
    });

    return agent;
  } catch (error) {
    console.error(
      `⚠️ Ensure your environment variables are set correctly according to your config/agent.json file.`
    );
    console.error('Failed to load or parse JSON config:', error);
    throw error;
  }
};
