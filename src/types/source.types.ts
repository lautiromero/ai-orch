export type ExtractionMethods = 'jina-ai' | 'playwright' | 'failed' | 'platform' | 'jina-ai (url‑override)';

export interface SourceOptions {
  llmModel?: string;
  timeout?: number;
  maxContentLength?: number;
}

export interface GoogleResult {
  title: string;
  url: string;
  snippet: string;
  source: 'google-serper';
}

export interface InjectionPackage {
  timestamp: string;
  originalQuery: string;
  sources: string[];
  context: string;
  metadata: {
    tokensEstimate: number;
    extractionMethod: ExtractionMethods;
  };
}

export type ProcessResult =
  | {
    action: 'inject_context';
    contextToInject: InjectionPackage;
    rawResults?: any;
    reasoning?: string;
  }
  | {
    action: 'extraction_failed' | 'search_failed' | 'synthesized_failed';
    contextToInject: null;
    rawResults?: any;
    reasoning?: string;
  };

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
