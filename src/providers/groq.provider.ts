import { AIProvider, type Message } from './base.provider';

export class GroqProvider extends AIProvider {
  name = 'Groq';
  private apiKey: string;

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async ask(messages: Message[], modelId: string): Promise<string> {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        stream: false, // Correcto
        max_completion_tokens: 4096,
        temperature: 0.2
      })
    });

    const data = await response.json() as any; // Corregido el doble punto ..

    if (!response.ok) {
      if (data.error?.code === 'rate_limit_exceeded') throw new Error('RATE_LIMIT_EXCEEDED');
      throw new Error(data.error?.message || 'Groq Error');
    }

    // Devolvemos el contenido directamente
    return data.choices[0].message.content;
  }
}
