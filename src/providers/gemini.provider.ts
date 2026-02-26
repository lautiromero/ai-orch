import { GoogleGenAI } from "@google/genai";
import { AIProvider, type Message } from './base.provider';

export class GeminiProvider extends AIProvider {
  name = 'Gemini 3 Flash';
  private client: any;

  constructor(apiKey: string) {
    super();
    // We silence console warns
    const oldWarn = console.warn;
    console.warn = (...args) => {
      if (args[0]?.includes('Interactions usage is experimental')) return;
      oldWarn(...args);
    };
    this.client = new GoogleGenAI({ apiKey });
  }

  async ask(messages: Message[], modelId: string = 'gemini-3-flash-preview'): Promise<string> {
    try {
      // 1. Extraemos el system prompt (si existe)
      const systemPrompt = messages.find(m => m.role === 'system')?.content;

      // 2. Mapeamos el historial al formato Turn { role, content }
      // Filtramos el system y convertimos assistant -> model
      const conversationHistory = messages
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
          role: msg.role === 'assistant' ? 'model' : msg.role,
          content: msg.content
        }));

      // 3. Llamada usando la interfaz BaseCreateModelInteractionParams
      const interaction = await this.client.interactions.create({
        model: modelId,
        system_instruction: systemPrompt, // Ahora sabemos que es string y singular
        input: conversationHistory,
        generation_config: {
          temperature: 0.2,
          // max_output_tokens suele ir dentro de generation_config si lo necesitas
        }
      });

      // 4. Extraemos la última respuesta
      const lastOutput = interaction.outputs[interaction.outputs.length - 1];
      return lastOutput.text;

    } catch (error: any) {
      if (error.status === 429 || error.message?.includes('429')) {
        throw new Error('RATE_LIMIT_EXCEEDED');
      }
      throw new Error(`Gemini Error: ${error.message}`);
    }
  }
}
