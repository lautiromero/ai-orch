import axios from 'axios';
import { firefox } from 'playwright';
import { createOpenAI, type OpenAIProvider } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import { z } from 'zod';
import type { Message } from '../providers/base.provider';

interface SourceOptions {
  llmModel?: string;
  detectorModel?: string;
  timeout?: number;
  maxContentLength?: number;
}

type ExtractionMethods = 'jina-ai' | 'failed' | 'semantic' | 'heuristic:density' | 'fallback:body' | 'platform';

interface ExtractOptions {
  strategy: 'auto' | 'fast' | 'medium' | 'thorough';
  maxConcurrent?: number;
}

interface SmartExtractResult {
  url: string;
  query: string;
  extractionMethod: ExtractionMethods;
  rawLength?: number;
  cleanedContent: {
    summary: string;
    technicalDetails: string;
    usageExample: string;
    importantNotes: string
  } | null;
  success: boolean;
  processingSteps?: {
    step: 'extraction' | 'cleaning';
    method: string;
    success: boolean;
  }[];
}

interface GoogleResult {
  title: string,
  url: string,
  snippet: string,
  source: 'google-serper'
}

interface ExtractDynamicResult {
  content: string,
  source: 'playwright',
  method: ExtractionMethods,
  success: boolean,
  metadata?: {
    textLength: number;
    extractionMethod: ExtractionMethods;
  }
  error?: string;
}

interface InjectionPackage {
  timestamp: string;
  originalQuery: string;
  sources: string[];
  context: string,
  metadata: {
    tokensEstimate: number;
    extractionMethod: ExtractionMethods
  }
}

type ProcessResult =
  | {
    action: 'inject_context';
    contextToInject: InjectionPackage;
    rawResults?: any;
    reasoning?: string;
  }
  | {
    action: 'extraction_failed' | 'search_failed' | 'direct';
    contextToInject: null;
    rawResults?: any;
    reasoning?: string;
  };

export class SourceService {
  llmModel: string;
  detectorModel: string;
  timeout: number;
  maxContentLength: number;
  private llmProvider: OpenAIProvider;

  constructor(options?: SourceOptions) {
    const host = process.env.LLM_HOST;
    if (!host) {
      throw new Error('LLM_HOST is not defined in environment variables.');
    }

    this.llmModel = options?.llmModel || 'phi4-mini:3.8b';
    this.detectorModel = this.llmModel || 'phi4-mini:3.8b';
    this.timeout = options?.timeout || 10000;
    this.maxContentLength = options?.maxContentLength || 15000;

    this.llmProvider = createOpenAI({
      baseURL: host, // Ejemplo: http://localhost:8080/v1
      apiKey: 'local-token', // El SDK lo requiere aunque el servidor no lo use
    });
  }

  // ============================================================================
  // NIVEL 1: EXTRACCIÓN UNIVERSAL RÁPIDA
  // ============================================================================

  /**
   * Usa servicios de "Reader Mode" (Jina AI) para extraer contenido limpio
   * Gratis, rápido, sin configuración
   */
  async extractWithReader(url: string) {
    const services = [
      `https://r.jina.ai/http://${url}`,
      `https://r.jina.ai/http://${url}?format=text`,
      `https://r.jina.ai/http://${url}?format=json`
    ];

    for (const service of services) {
      try {
        const response = await axios.get(service, {
          timeout: this.timeout,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SmartBot/1.0)'
          }
        });

        if (response.status === 200 && response.data.length > 500) {
          return {
            content: response.data,
            source: 'jina-ai',
            success: true
          };
        }
      } catch (error: any) {
        console.log(`Falló ${service}: ${error.message}`);
        continue;
      }
    }

    return { content: null, source: null, success: false };
  }

  /**
   * Alternativa: Firecrawl API (requiere API key, más robusto)
   */
  async extractWithFirecrawl(url: string, apiKey: string) {
    try {
      const response = await axios.post('https://api.firecrawl.dev/v1/scrape', {
        url: url,
        formats: ['markdown', 'html'],
        onlyMainContent: true
      }, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        timeout: this.timeout
      });

      return {
        content: response.data.data?.markdown || response.data.data?.html,
        source: 'firecrawl',
        success: true
      };
    } catch (error: any) {
      return { content: null, source: null, success: false, error: error.message };
    }
  }

  // ============================================================================
  // NIVEL 2: EXTRACCIÓN DINÁMICA CON PLAYWRIGHT
  // ============================================================================

  /**
   * Para SPAs y contenido JavaScript-renderizado
   * Usa heurísticas de densidad de texto para encontrar contenido principal
   */
  async extractDynamicContent(url: string): Promise<ExtractDynamicResult> {
    let browser;
    try {
      browser = await firefox.launch({ headless: true });
      const page = await browser.newPage();

      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: this.timeout
      });

      // Heurísticas inteligentes de selección de contenido
      const content = await page.evaluate((): {
        html: string,
        method: ExtractionMethods,
        textLength: number
      } => {
        // 1. Intentar selectores semánticos comunes
        const semanticSelectors = [
          'main',
          'article',
          '[role="main"]',
          '.content',
          '.documentation',
          '.docs-content',
          '.doc-content',
          '#content',
          '#main-content',
          '.markdown-body', // GitHub
          '.readme', // GitHub READMEs
          '[itemprop="articleBody"]'
        ];

        for (const selector of semanticSelectors) {
          const element = document.querySelector(selector) as HTMLElement;
          if (element && element.innerText.length > 500) {
            return {
              html: element.innerHTML,
              method: 'semantic',
              textLength: element.innerText.length
            };
          }
        }

        // 2. Detectar plataforma de documentación específica
        const html = document.documentElement.innerHTML;
        let platformSelector = null;

        if (html.includes('readthedocs')) {
          platformSelector = '.rst-content, .document';
        } else if (html.includes('docusaurus')) {
          platformSelector = '.theme-doc-markdown, article';
        } else if (html.includes('gitbook')) {
          platformSelector = '[data-testid="page.content"]';
        } else if (html.includes('mkdocs')) {
          platformSelector = '.md-content';
        } else if (html.includes('vuepress')) {
          platformSelector = '.theme-default-content';
        }

        if (platformSelector) {
          const element = document.querySelector(platformSelector) as HTMLElement;
          if (element && element.innerText.length > 500) {
            return {
              html: element.innerHTML,
              method: 'platform',
              textLength: element.innerText.length
            };
          }
        }

        // 3. Fallback: Densidad de texto
        const divs = Array.from(document.querySelectorAll('div'));
        let bestDiv = null as any as HTMLElement;
        let maxDensity = 0;

        divs.forEach(div => {
          const text = div.innerText || '';
          const links = div.querySelectorAll('a').length;
          const paragraphs = div.querySelectorAll('p').length;
          const codeBlocks = div.querySelectorAll('code, pre').length;

          // Fórmula de densidad: premia texto, párrafos y código; penaliza muchos links
          const density = (text.length + (paragraphs * 100) + (codeBlocks * 50)) / (links + 1);

          if (density > maxDensity && text.length > 1000) {
            maxDensity = density;
            bestDiv = div;
          }
        });

        if (bestDiv) {
          return {
            html: bestDiv.innerHTML,
            method: 'heuristic:density',
            textLength: bestDiv.innerText.length
          };
        }

        // Último recurso: body completo
        return {
          html: document.body.innerHTML,
          method: 'fallback:body',
          textLength: document.body.innerText.length
        };
      });

      // Convertir HTML a Markdown
      const markdown = NodeHtmlMarkdown.translate(content.html);

      return {
        content: markdown,
        source: 'playwright',
        method: content.method,
        success: true,
        metadata: {
          textLength: content.textLength,
          extractionMethod: content.method
        }
      };

    } catch (error: any) {
      return {
        content: '',
        source: 'playwright',
        success: false,
        method: 'failed',
        error: error.message
      };
    } finally {
      if (browser) await browser.close();
    }
  }

  // ============================================================================
  // NIVEL 3: LIMPIEZA SEMÁNTICA CON LLM LOCAL (OLLAMA)
  // ============================================================================

  /**
   * Usa LLM local para extraer solo lo relevante para la query específica
   * Elimina navegación, ads, y estructura el contenido técnico
   */
  async semanticCleaner(rawContent: string, userQuery: string) {
    const truncated = rawContent.slice(0, this.maxContentLength);

    try {
      const { output } = await generateText({
        model: this.llmProvider(this.llmModel),

        // El esquema de Zod ahora va dentro de Output.object
        output: Output.object({
          schema: z.object({
            summary: z.string().describe('2-3 lines of what it is and what it is for.'),
            technicalDetails: z.string().describe('Signatures, parameters, and types.'),
            usageExample: z.string().describe('Complete and functional code block.'),
            importantNotes: z.string().describe('Warnings, deprecations, or requirements.')
          }),
        }),

        system: `You are a precise technical information extractor.
Your task:
1. Identify relevant parts of the content to answer the user's question.
2. Extract ONLY: function/API definitions, parameters, return types, code examples, warnings, and breaking changes.
3. COMPLETELY remove: navigation, ads, headers, footers, and unrelated clutter.
4. Keep code exact and functional.
Respond ONLY with the structured data.`,

        prompt: `USER QUERY: "${userQuery}"\n\nRAW WEB CONTENT:\n${truncated}`,

        abortSignal: AbortSignal.timeout(this.timeout),
      });

      // Con la nueva sintaxis, los datos están en 'output'
      return {
        content: output,
        success: true,
        model: this.llmModel
      };
    } catch (error: any) {
      //TODO: debug here
      let message = '';
      if (error.responseBody?.includes('model')) message = 'Model error.';
      console.error(message || error);
      return {
        content: null,
        success: false,
        error: error.message
      };
    }
  }


  /**
   * Compresión agresiva para modelos con límite de contexto corto
   * Resume la documentación en el formato más denso posible
   */
  async compressForContext(rawContent: string, _userQuery: string, maxTokens = 800) {
    const truncated = rawContent.slice(0, this.maxContentLength);

    try {
      const { text } = await generateText({
        model: this.llmProvider(this.llmModel),

        system: `You are a technical document compressor. 
Your goal is maximum information density with minimum tokens.
Rules:
1. Keep exact function signatures (parameters and types).
2. Provide 1-2 ultra-concise but functional code examples.
3. Include only critical warnings (breaking changes, deprecations).
4. Format: Dense bullet points, use inline code blocks for brevity.
5. All output must be optimized for another LLM's context.`,

        prompt: `CONTENT TO COMPRESS:
${truncated}

TARGET LIMIT: ${maxTokens} tokens.
OUTPUT: Essential technical info only.`,

        // Configuraciones de rendimiento para tu AMD
        abortSignal: AbortSignal.timeout(this.timeout),
        maxOutputTokens: maxTokens, // Límite estricto de salida
        temperature: 0.1,     // Determinismo total
      });

      return {
        content: text,
        tokens: maxTokens,
        success: true
      };
    } catch (error: any) {
      return {
        // Fallback: Si falla, devolvemos un recorte bruto
        content: rawContent.slice(0, maxTokens * 4),
        success: false,
        error: error.message
      };
    }
  }

  // ============================================================================
  // FLUJO PRINCIPAL: ORQUESTACIÓN INTELIGENTE
  // ============================================================================

  /**
   * Pipeline completo: Intenta métodos en orden de velocidad/costo
   */
  async smartExtract(url: string, userQuery: string, options: ExtractOptions): Promise<SmartExtractResult> {
    const strategy = options.strategy || 'auto'; // 'fast', 'thorough', 'auto'

    console.log(`🔍 Extrayendo: ${url}`);
    console.log(`❓ Query: "${userQuery}"`);
    console.log(`⚙️  Estrategia: ${strategy}`);

    let rawContent = null;
    let extractionMethod: ExtractionMethods = 'failed';

    // PASO 1: Intento rápido con Jina AI (1-2 segundos, gratis)
    if (strategy === 'medium' || strategy === 'auto') {
      console.log('📡 Intentando Jina AI...');
      const jinaResult = await this.extractWithReader(url);

      if (jinaResult.success) {
        rawContent = jinaResult.content;
        extractionMethod = 'jina-ai';
        console.log('✅ Jina AI exitoso');
      } else {
        console.log('❌ Jina AI falló');
      }
    }

    // TODO: fallback travily 'fast'

    // PASO 2: Fallback a Playwright para contenido dinámico (5-10 segundos)
    if (!rawContent && (strategy === 'thorough')) {
      console.log('🎭 Intentando Playwright...');
      const pwResult = await this.extractDynamicContent(url);

      if (pwResult.success) {
        rawContent = pwResult.content;
        extractionMethod = pwResult.method!;
        console.log(`✅ Playwright exitoso (${pwResult.metadata?.extractionMethod})`);
      } else {
        console.log('❌ Playwright falló:', pwResult.error);
      }
    }

    // console.log('rawcontent:', rawContent);
    // PASO 3: Si no hay contenido, fallo
    if (!rawContent) {
      console.error(`No se pudo extraer contenido de ${url}`);
    }

    // PASO 4: Limpieza semántica con LLM local (2-4 segundos)
    console.log('🧹 Limpiando con LLM local...');
    const cleaned = await this.semanticCleaner(rawContent, userQuery);

    if (!cleaned.success) {
      console.warn('⚠️  Limpieza semántica falló, usando contenido raw truncado');
    }

    return {
      url,
      query: userQuery,
      extractionMethod,
      rawLength: rawContent.length,
      cleanedContent: cleaned.content,
      success: cleaned.success,
      processingSteps: [
        { step: 'extraction', method: extractionMethod, success: true },
        { step: 'cleaning', method: 'ollama-semantic', success: cleaned.success }
      ]
    };
  }

  /**
   * Extracción paralela de múltiples URLs con ranking de relevancia
   */
  async extractMultiple(urls: string[], userQuery: string, options: ExtractOptions) {
    const maxConcurrent = options.maxConcurrent || 3;

    console.log(`🔄 Extrayendo ${urls.length} URLs en paralelo (max ${maxConcurrent})...`);

    // Procesar en lotes para no saturar
    const results = [];
    for (let i = 0; i < urls.length; i += maxConcurrent) {
      const batch = urls.slice(i, i + maxConcurrent);
      const batchPromises = batch.map(url =>
        this.smartExtract(url, userQuery, options)
          .catch(err => ({
            url,
            query: userQuery,
            extractionMethod: 'failed',
            success: false,
            error: err.message,
            cleanedContent: null
          } as SmartExtractResult))
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    // Filtrar exitosos y ordenar por longitud (heurística simple de relevancia)
    const successful = results
      .filter(r => r.success && r.cleanedContent)
      .sort((a, b) => b.cleanedContent!.summary.length - a.cleanedContent!.summary.length);

    return {
      results: successful,
      failed: results.filter(r => !r.success),
      combined: successful.map(r =>
        `## Fuente: ${r.url}\n\n${r.cleanedContent}`
      ).join('\n\n---\n\n')
    };
  }


  /**
   * Analiza el mensaje del usuario y devuelve datos para la busqueda
   */
  async optimizeSearch(userMessage: string, history: Message[]) {
    try {
      const { output } = await generateText({
        model: this.llmProvider(this.llmModel), // Recomiendo phi4-mini aquí
        output: Output.object({
          schema: z.object({
            optimizedQueries: z.array(z.string()).min(1).describe('Refined search queries based on context.'),
            suggestedSources: z.array(z.string()).describe('Target sites like docs, github, or specific domains.'),
            estimatedTokensNeeded: z.number().describe('How many tokens of documentation are likely needed to answer this (e.g., 500, 1500, 3000).'),
            priority: z.enum(['low', 'medium', 'high']).describe('Urgency of the external data.')
          }),
        }),
        system: `You are a technical search strategist.
      Analyze the chat history and the current message to create a search plan.
      - Use history to specify versions, OS (Fedora), and specific tech stacks.
      - Estimate 'estimatedTokensNeeded' based on the complexity: simple questions (~500), complex API implementations (~2000), or complete library overviews (>3000).`,

        prompt: `CHAT HISTORY:
${history.slice(-10).map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}

NEW MESSAGE: "${userMessage}"`,

        temperature: 0.1,
        abortSignal: AbortSignal.timeout(this.timeout),
      });

      return {
        queries: output.optimizedQueries,
        sources: output.suggestedSources,
        estimatedTokens: output.estimatedTokensNeeded,
        priority: output.priority,
        success: true
      };
    } catch (error: any) {
      return {
        queries: [userMessage],
        sources: ['docs'],
        estimatedTokens: 1000,
        priority: 'medium',
        success: false,
        error: error.message
      };
    }
  }

  // ============================================================================
  // MOTOR DE BÚSQUEDA (Integración con APIs)
  // ============================================================================

  /**
   * Búsqueda Google via Serper.dev (gratis hasta 2500 búsquedas)
   */
  async searchGoogle(query: string, options: {
    numResults?: number,
    type?: string;
  } = {
      numResults: 5,
      type: 'search'
    }): Promise<GoogleResult[]> {
    const serperApiKey = process.env.SERPER_API_KEY;
    if (!serperApiKey) throw Error('Serper API Key needed.');

    try {
      const response = await axios.post('https://google.serper.dev/search', {
        q: query,
        num: options.numResults,
        type: options.type
      }, {
        headers: {
          'X-API-KEY': serperApiKey,
          'Content-Type': 'application/json'
        }
      });

      return response.data.organic.map((result: any) => ({
        title: result.title,
        url: result.link,
        snippet: result.snippet,
        source: 'google-serper'
      }));
    } catch (error: any) {
      console.error('Error en búsqueda:', error.message);
      return [];
    }
  }

  /**
   * Búsqueda especializada para código/docs
   */
  async searchTechnical(query: string, context: { library?: string, language?: string }) {
    const queries = [];

    // Enriquecer query según contexto
    if (context.library) {
      queries.push(`${context.library} ${query} documentation`);
      queries.push(`${context.library} ${query} site:github.com`);
    }
    if (context.language) {
      queries.push(`${query} in ${context.language} example`);
    }

    // Query base si no hay contexto
    queries.push(query);

    // Ejecutar búsqueda con la query más específica primero
    for (const q of queries) {
      const results = await this.searchGoogle(q, { numResults: 3 });
      if (results.length > 0) return results;
    }

    return [];
  }



  /**
   * Punto de entrada principal
   * Recibe mensaje de usuario, decide si necesita búsqueda, ejecuta pipeline
   */
  async processUserMessage(userMessage: string, history: Message[], library?: string): Promise<ProcessResult> {
    console.log('\n🚀 === ORQUESTADOR ===');
    console.log(`👤 Usuario: "${userMessage}"`);

    // STEP 1: Optimize search parameters
    const optimizedParams = await this.optimizeSearch(userMessage, history);

    // PASO 2: Buscar
    console.log(`🔎 Buscando: "${optimizedParams.queries[0]}"`);

    const selectedLibrary = library ? library : this.extractLibraryName(userMessage);

    const searchResults = await this.searchTechnical(optimizedParams.queries[0] ?? userMessage, {
      library: selectedLibrary ?? undefined
    });
    if (searchResults.length === 0) {
      return {
        action: 'search_failed',
        contextToInject: null,
        reasoning: 'No se encontraron resultados de búsqueda'
      };
    }

    console.log(`📄 Encontrados ${searchResults.length} resultados`);

    // PASO 3: Extraer contenido de top 3 resultados
    const topUrls = searchResults.slice(0, 3).map(r => r.url);
    const extractionResults = await this.extractMultiple(
      topUrls,
      userMessage,
      { strategy: 'medium', maxConcurrent: 1 }
    );

    if (extractionResults.results.length) {
      return {
        action: 'extraction_failed',
        contextToInject: null,
        reasoning: 'Falló la extracción de todos los resultados'
      };
    }

    // PASO 4: Comprimir si es necesario (para modelos con contexto corto)
    let finalContext = extractionResults.combined;

    if (optimizedParams.estimatedTokens < 1000) {
      console.log('📦 Comprimiendo resultados...');
      const compressed = await this.compressForContext(
        finalContext,
        userMessage,
        optimizedParams.estimatedTokens
      );
      finalContext = compressed.content;
    }

    // PASO 5: Formatear para inyección
    const injectionPackage = {
      timestamp: new Date().toISOString(),
      originalQuery: userMessage,
      sources: extractionResults.results.map(r => r.url),
      context: finalContext,
      metadata: {
        tokensEstimate: Math.ceil(finalContext.length / 4), // Aproximación
        extractionMethod: extractionResults.results[0]?.extractionMethod || 'failed'
      }
    };

    console.log('✅ Contexto listo para inyección');
    console.log(`📊 Tokens estimados: ${injectionPackage.metadata.tokensEstimate}`);

    return {
      action: 'inject_context',
      contextToInject: injectionPackage,
      rawResults: extractionResults
    };
  }

  /**
   * Helper: Intenta extraer nombre de librería del mensaje
   */
  extractLibraryName(message: string) {
    const commonLibs = [
      'react', 'vue', 'angular', 'svelte', 'nextjs', 'nuxt',
      'pandas', 'numpy', 'tensorflow', 'pytorch', 'django', 'flask', 'fastapi',
      'docker', 'kubernetes', 'terraform', 'ansible',
      'express', 'fastify', 'nest', 'koa', 'puppeteer',
      'langchain', 'llamaindex', 'openai', 'anthropic', 'playwright',
      'postgres', 'mongodb', 'mysql', 'redis', 'elasticsearch'
    ];

    const lowerMsg = message.toLowerCase();
    return commonLibs.find(lib => lowerMsg.includes(lib)) || null;
  }

  /**
   * Formatea el contexto para enviar al modelo de IA
   */
  formatForModel(injectionPackage: InjectionPackage, _modelType = 'default') {
    const header = `[CONTEXT INJECTED - ${injectionPackage.timestamp}]
Fuentes: ${injectionPackage.sources.join(', ')}
Query original: ${injectionPackage.originalQuery}
---`;

    // if (modelType === 'cheap') {
    //   // Para modelos baratos, formato ultra-conciso
    //   return `${header}\nRESUMEN TÉCNICO:\n${injectionPackage.context}\n---\n`;
    // }

    // Para modelos potentes, más estructura
    return `${header}\nDOCUMENTACIÓN RELEVANTE:\n${injectionPackage.context}\n\nINSTRUCCIÓN: Usa la información anterior para responder. Cita la fuente si es específica.`;
  }
}
