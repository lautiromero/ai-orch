import axios from 'axios';
import { createOpenAI, type OpenAIProvider } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import type {
  SourceOptions, GoogleResult, ProcessResult,
  Message
} from '../types/source.types';

export class SourceService {
  llmModel: string;
  timeout: number;
  maxContentLength: number;
  private llmProvider: OpenAIProvider;

  constructor(options?: SourceOptions) {
    const host = process.env.LLM_HOST;
    if (!host) throw new Error('LLM_HOST is not defined');

    this.llmModel = options?.llmModel || 'phi4-mini:3.8b';
    this.timeout = options?.timeout || 12000;
    this.maxContentLength = options?.maxContentLength || 12000;

    this.llmProvider = createOpenAI({
      baseURL: host,
      apiKey: 'local-token',
    });
  }

  /**
   * Extrae contenido usando Jina AI (Reader Mode)
   */
  async extractWithReader(url: string) {
    const jinaApiKey = process.env.JINA_API_KEY;
    if (!jinaApiKey) throw Error('Jina API key needed.');
    try {
      const response = await axios.get(`https://r.jina.ai/${url}`, {
        headers: {
          // 'Authorization': `Bearer ${jinaApiKey}`,
          // Remover elementos que no aportan valor
          'X-Remove-Selector': [
            'header', 'nav', '.nav', '.navbar', '.navigation',
            'footer', '.footer',
            '.sidebar', '.side-bar', '#sidebar',
            '.menu', '.dropdown-menu',
            'aside', '.aside',
            '.ads', '.advertisement', '.banner',
            '.cookie-banner', '.consent-banner',
            '.social-share', '.share-buttons',
            'script', 'style', 'noscript',
            '.modal', '.s-modal', '.popup', '.overlay',
            '.hidden', '.d-none', '.invisible',
            '[aria-hidden="true"]',
            '.comments', '#comments',
            '.related-articles', '.recommended',
            '.toc', '.table-of-contents', '#toc',
            '.breadcrumbs', '.breadcrumb'
          ].join(', '),
          // Solo imágenes relevantes (ninguna por ahora)
          'X-Retain-Images': 'none',
          // Target: contenido principal (muy inclusivo)
          'X-Target-Selector': [
            'main', '#main', '.main', '[role="main"]',
            'article', '.article', '.post', '.entry',
            '.content', '#content', '.main-content', '#main-content',
            '.documentation', '.docs', '#docs', '.doc-content',
            '.page-content', '.article-content', '.post-content',
            '.markdown-body', '.prose',
            'section[role="region"]',
            // Fallbacks comunes
            '.container', '.wrapper', '.page-wrapper'
          ].join(', '),
          // Sin links summary para reducir ruido
          'X-With-Links-Summary': 'none',
          // Timeout para no esperar forever
        },
        timeout: 60000
      });

      if (response.status !== 200) console.error(response)
      return {
        content: response.data,
        success: response.status === 200 && response.data.length > 600
      };
    } catch (error: any) {
      console.error(error.message);
      return { content: null, success: false };
    }
  }

  /**
   * Ordena los resultados de búsqueda por relevancia técnica y calidad
   */
  private rankResults(
    results: GoogleResult[],
    library?: string | null,
    _suggestedSources?: string[]  // nuevo parámetro
  ): GoogleResult[] {
    return results.sort((a, b) => {
      const getScore = (res: GoogleResult) => {
        let score = 0;
        const url = res.url.toLowerCase();

        // Prioridad 1: Dominios sugeridos por el LLM
        // if (suggestedSources?.some(s => url.includes(this.extractDomain(s).toLowerCase()))) {
        //   score += 15;
        // }

        // Prioridad 2: Documentación oficial de la librería
        if (library && url.includes(library.toLowerCase())) score += 10;
        if (
          url.includes('docs.') ||
          url.includes('/docs/') ||
          url.includes('/guides/') ||
          url.includes('.dev') ||
          url.includes('dev.') ||
          url.includes('/dev/')
        ) score += 12;

        // Prioridad 3: Repositorios y fuentes técnicas
        // if (url.includes('github.com')) score += 5;
        // if (url.includes('stackoverflow.com')) score += 2;

        // Penalizar sitios no técnicos
        if (url.includes('pinterest') || url.includes('facebook') || url.includes('youtube')) score -= 10;

        return score;
      };
      return getScore(b) - getScore(a);
    });
  }

  /**
   * Genera un plan de búsqueda optimizado considerando la librería
   */
  async optimizeSearch(userMessage: string, history: Message[], library?: string | null) {
    const systemPrompt = library
      ? `You are a technical search optimizer. Your ONLY job is to improve search queries for finding documentation.

CRITICAL RULES - FOLLOW EXACTLY:
1. The user is working with LIBRARY: "${library}"
2. The query MUST contain "${library}" verbatim
3. suggested_sources MUST be URLs that contain "${library}" in the domain or path
4. If you cannot find relevant sources with "${library}", return EMPTY array []
5. NEVER suggest generic sources like w3schools, oracle java docs, or unrelated technologies
6. ONLY suggest official docs, GitHub repos, or established documentation sites for ${library}

BAD EXAMPLE (NEVER DO THIS):
- Query: "how to read properties in Java" 
- Sources: ["https://docs.oracle.com/javase/..."] 
- Why wrong: No mention of "${library}"

GOOD EXAMPLE:
- Query: "${library} middleware setup authentication"
- Sources: ["https://${library}.js.org/guide/middleware", "https://github.com/${library}/${library}/blob/master/docs"]

RESPONSE FORMAT:
{
  "query": "string that includes ${library}",
  "suggested_sources": ["url with ${library}", "another url with ${library}"] or []
}`

      : `You are a technical search optimizer.

CRITICAL RULES:
1. Analyze the user message and identify the SPECIFIC technology/library mentioned
2. The query MUST include that technology name
3. suggested_sources MUST be URLs containing that technology name
4. NO generic programming tutorials
5. NO unrelated technologies

RESPONSE FORMAT:
{
  "query": "improved search with technology name",
  "suggested_sources": ["official docs url", "github url"] or []
}`;

    const userPrompt = library
      ? `CONTEXT:
- User is specifically using: ${library}
- Previous messages: ${JSON.stringify(history.slice(-3))}
- Current question: "${userMessage}"

TASK: Create a search query and sources STRICTLY for ${library}.

REMEMBER: 
- Query MUST contain "${library}"
- Sources MUST contain "${library}" in the URL
- NO Java, no Spring, no unrelated tech unless explicitly mentioned by user`

      : `CONTEXT:
- Previous messages: ${JSON.stringify(history.slice(-3))}
- Current question: "${userMessage}"

TASK: Identify the technology in the message and create targeted search query and sources.`;
    try {
      const { output } = await generateText({
        model: this.llmProvider(this.llmModel),
        temperature: 0,
        output: Output.object({
          schema: z.object({
            query: z.string(),
            suggested_sources: z.array(z.string()).nullable().optional(),
            sources: z.array(z.string()).nullable().optional(),
          }).transform((data) => ({
            query: data.query,
            suggestedSources: data.suggested_sources ?? data.sources ?? [],
          })),
        }),
        system: systemPrompt,
        prompt: userPrompt,
      });
      return output;
    } catch (error) {
      console.error(error);
      return { query: userMessage, suggestedSources: library ? [library] : [] };
    }
  }

  /**
   * Synthesize the content obtained from the web and convert to markdown
   */
  private async synthesizeContent(
    userMessage: string,
    finalContent: string,
    history: Message[],
    library?: string | null
  ): Promise<string> {

    // console.log('=== CONTENT PREVIEW (first 500 chars) ===');
    // console.log(finalContent.slice(0, 500));
    // console.log('=== END PREVIEW ===');
    // console.log(`Total length: ${finalContent.length} chars`);

    const result = await generateText({
      model: this.llmProvider(this.llmModel),
      temperature: 0.1,
      system: `You are a technical assistant. Explain the user's query using the provided documentation.
Be concise but complete. Include relevant API details and short code examples if present.
Respond in clean Markdown.`,
      prompt: `User Query: ${userMessage}

Conversation History:
${history.slice(-3).map(h => `${h.role}: ${h.content}`).join('\n')}

Documentation Content:
${finalContent.slice(0, this.maxContentLength)}

Provide a helpful technical explanation:`,
    });

    const rawOutput = (result as any)._output || result.text;

    // Parsear si es JSON string
    const text = this.extractTextFromLLMResponse(rawOutput);

    return `### Documentation' Details\n\n${text}`;
  }

  /**
 * Main orchestration.
 * If a URL is supplied, it is used directly (no search/ranking).
 * Otherwise the original search‑rank‑extract‑synthesize flow is executed.
 */
  async processUserMessage(
    userMessage: string,
    history: Message[],
    libraryOverride?: string,
    _url?: string
  ): Promise<ProcessResult> {
    const library = libraryOverride || this.extractLibraryName(userMessage);

    // -----------------------------------------------------------------
    // 1️⃣  URL shortcut – use the provided URL directly
    // -----------------------------------------------------------------
    if (_url) {
      const { content, success } = await this.extractWithReader(_url);
      if (success && content && this.isValidContent(content, userMessage)) {
        const synthesized = await this.synthesizeContent(
          userMessage,
          content,
          history,
          library
        );

        return {
          action: 'inject_context',
          contextToInject: {
            timestamp: new Date().toISOString(),
            originalQuery: userMessage,
            sources: [_url],
            context: synthesized,
            metadata: {
              tokensEstimate: Math.ceil(synthesized.length / 4),
              extractionMethod: 'jina-ai (url‑override)'
            }
          }
        };
      }
      return { action: 'extraction_failed', contextToInject: null };
    }

    // -----------------------------------------------------------------
    // 2️⃣  Normal flow – optimise query, search, rank, extract, synthesize
    // -----------------------------------------------------------------
    const plan = await this.optimizeSearch(userMessage, history, library);
    const query = plan.query || userMessage;

    // Search
    const searchResults = await this.searchTechnical(query);
    if (searchResults.length === 0) {
      return { action: 'search_failed', contextToInject: null };
    }

    // Rank
    const ranked = this.rankResults(
      searchResults,
      library,
      plan.suggestedSources
    );

    // Extract (try up to 5 best results)
    let finalContent = '';
    let usedUrl = '';
    for (const result of ranked.slice(0, 5)) {
      const { content, success } = await this.extractWithReader(result.url);
      if (success && content && this.isValidContent(content, query)) {
        finalContent = content;
        usedUrl = result.url;
        break;
      }
    }

    if (!finalContent) {
      return { action: 'extraction_failed', contextToInject: null };
    }

    // Synthesize
    const synthesized = await this.synthesizeContent(
      userMessage,
      finalContent,
      history,
      library
    );

    if (!synthesized) {
      return { action: 'synthesized_failed', contextToInject: null };
    }

    return {
      action: 'inject_context',
      contextToInject: {
        timestamp: new Date().toISOString(),
        originalQuery: userMessage,
        sources: [usedUrl],
        context: synthesized,
        metadata: {
          tokensEstimate: Math.ceil(synthesized.length / 4),
          extractionMethod: 'jina-ai'
        }
      }
    };
  }

  private async searchTechnical(query: string): Promise<GoogleResult[]> {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) return [];

    try {
      const response = await axios.post(
        'https://google.serper.dev/search',
        {
          q: query,
          num: 10
        },
        { headers: { 'X-API-KEY': apiKey } }
      );

      return response.data.organic?.map((r: any) => ({
        title: r.title,
        url: r.link,
        snippet: r.snippet,
        source: 'google-serper'
      })) || [];
    } catch (err: any) {
      console.error('Search error:', err.message);
      return [];
    }
  }

  private extractLibraryName(message: string): string | null {
    const commonLibs = ['react', 'vue', 'nextjs', 'tailwind', 'prisma', 'fastapi', 'pandas', 'express'];
    const lower = message.toLowerCase();
    return commonLibs.find(lib => lower.includes(lib)) || null;
  }

  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      // Quitar www. si existe
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      // Si no es URL válida, devolver como está (asumiendo que ya es dominio)
      return url.replace(/^www\./, '');
    }
  }

  private isValidContent(content: string, query: string): boolean {
    const invalidPatterns = [
      /403\s+forbidden/i,
      /captcha/i,
      /security\s+service/i,
      /cloudflare/i,
      /access\s+denied/i,
      /please\s+ensure\s+you\s+are\s+authorized/i,
      /verification/i,
      /blocked/i,
    ];

    if (invalidPatterns.some(p => p.test(content))) {
      console.error('Invalid matches')
      return false;
    }

    // 2. No contenido genérico de "no encontrado"
    if (/does\s+not\s+contain\s+any\s+information/i.test(content)) {
      console.error('jeje')
      return false;
    }

    // 3. Debe tener palabras clave de la query
    if (query) {
      // Extraer palabras significativas (ignorar "how", "to", "the", etc.)
      const stopWords = new Set(['how', 'to', 'the', 'a', 'an', 'in', 'on', 'at', 'for', 'with', 'using', 'from']);
      const queryTerms = query.toLowerCase()
        .split(/\W+/)
        .filter(w => w.length > 2 && !stopWords.has(w));

      const contentLower = content.toLowerCase();

      // Debe coincidir al menos con 2 términos o el 50% de los términos
      const matches = queryTerms.filter(term => contentLower.includes(term)).length;
      const minMatches = Math.max(2, Math.ceil(queryTerms.length * 0.5));

      if (matches < minMatches) {
        console.log(`Content only matches ${matches}/${minMatches} query terms`);
        return false;
      }
    }

    return true;
  }

  private extractTextFromLLMResponse(response: any): string {
    console.log('type:', typeof response);
    console.log(response);
    // Si es string, verificar si es JSON
    if (typeof response === 'string') {
      try {
        const parsed = JSON.parse(response);
        // Es JSON, extraer recursivamente
        return this.extractFromParsedObject(parsed);
      } catch {
        // No es JSON, devolver el string directo
        return response;
      }
    }

    // Si es objeto, extraer directo
    if (typeof response === 'object' && response !== null) {
      return this.extractFromParsedObject(response);
    }

    return String(response);
  }

  private extractFromParsedObject(obj: any): string {
    const fields = ['response', 'text', 'content', 'answer', 'message', 'value', 'result', 'thoughts'];

    for (const field of fields) {
      if (typeof obj[field] === 'string') {
        return obj[field];
      }
    }

    if (obj.choices?.[0]?.message?.content) {
      return obj.choices[0].message.content;
    }

    // Si no encontramos campo conocido, devolver stringify formateado
    return JSON.stringify(obj, null, 2);
  }
}

