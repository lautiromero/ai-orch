export interface ModelConfig {
  id: string;
  provider: 'groq' | 'google' | 'anthropic';
  label: string;
  priority: number;
}

export const AVAILABLE_MODELS: ModelConfig[] = [
  { id: 'openai/gpt-oss-120b', provider: 'groq', label: 'GPT OSS 120B', priority: 1 },
  { id: 'qwen/qwen3-32b', provider: 'groq', label: 'Qwen 3 32B', priority: 1 },
  { id: 'llama-3.3-70b-versatile', provider: 'groq', label: 'Llama 3.3 70B Versatile', priority: 2 },
  { id: 'openai/gpt-oss-20b', provider: 'groq', label: 'GPT OSS 20B', priority: 2 },
  { id: 'gemini-2.5-flash', provider: 'google', label: 'Gemini 2.5 Flash', priority: 1 },
  { id: 'gemini-2.5-pro', provider: 'google', label: 'Gemini 2.5 Pro', priority: 2 },
  { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', provider: 'groq', label: 'Llama 4 Maverick 17B', priority: 3 },
  { id: 'moonshotai/kimi-k2-instruct-0905', provider: 'groq', label: 'Kimi K2 Instruct 0905', priority: 3 },
  { id: 'meta-llama/llama-4-scout-17b-16e-instruct', provider: 'groq', label: 'Llama 4 Scout 17B', priority: 3 },
  { id: 'gemini-3-flash-preview', provider: 'google', label: 'Gemini 3 Flash', priority: 3 },
  { id: 'moonshotai/kimi-k2-instruct', provider: 'groq', label: 'Kimi K2 Instruct', priority: 4 },
  { id: 'canopylabs/orpheus-v1-english', provider: 'groq', label: 'Orpheus V1 English', priority: 4 },
  { id: 'gemini-3.1-pro-preview', provider: 'google', label: 'Gemini 3 Pro', priority: 4 },
  { id: 'llama-3.1-8b-instant', provider: 'groq', label: 'Llama 3.1 8B Instant', priority: 5 },
  // { id: 'groq/compound', provider: 'groq', label: 'Compound', priority: 6 },
  { id: 'allam-2-7b', provider: 'groq', label: 'Allam 2 7B', priority: 6 },
  // { id: 'groq/compound-mini', provider: 'groq', label: 'Compound Mini', priority: 6 },
  { id: 'canopylabs/orpheus-arabic-saudi', provider: 'groq', label: 'Orpheus Arabic Saudi', priority: 7 },
  { id: 'whisper-large-v3-turbo', provider: 'groq', label: 'Whisper Large V3 Turbo', priority: 8 },
  { id: 'whisper-large-v3', provider: 'groq', label: 'Whisper Large V3', priority: 8 },
  { id: 'meta-llama/llama-prompt-guard-2-22m', provider: 'groq', label: 'Llama Prompt Guard 2 22M', priority: 9 },
  { id: 'meta-llama/llama-prompt-guard-2-86m', provider: 'groq', label: 'Llama Prompt Guard 2 86M', priority: 9 },
  { id: 'openai/gpt-oss-safeguard-20b', provider: 'groq', label: 'GPT OSS Safeguard 20B', priority: 9 },
  { id: 'meta-llama/llama-guard-4-12b', provider: 'groq', label: 'Llama Guard 4 12B', priority: 9 }
];

export const API_KEYS = {
  groq: process.env.GROQ_API_KEY,
  google: process.env.GEMINI_API_KEY,
};
