export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export abstract class AIProvider {
  abstract name: string;
  abstract ask(messages: Message[], modelId: string): Promise<string>;
}
