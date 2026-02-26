import { GroqProvider } from './groq.provider';
import { GeminiProvider } from './gemini.provider';
import { API_KEYS } from '../../config/models.config';
import { AIProvider } from './base.provider';

export class ProviderFactory {
  static build(): Record<string, AIProvider> {
    const providers: Record<string, AIProvider> = {};

    // Solo inyectamos si la API Key existe
    if (API_KEYS.groq) {
      providers['groq'] = new GroqProvider(API_KEYS.groq);
    }

    if (API_KEYS.google) {
      providers['google'] = new GeminiProvider(API_KEYS.google);
    }

    return providers;
  }
}
