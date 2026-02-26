import { type Message } from '../providers/base.provider';
import axios from 'axios';
import * as cheerio from 'cheerio';

interface DocumentationObject {
  library: string;
  resourceLink: string;
  mainResource?: string;
  score: number;
}

export class SourceService {
  private library: string;
  private resource: string;
  private prompt: string;
  private history: Message[];

  constructor(library: string, resource: string, prompt: string, history: Message[]) {
    this.library = library;
    this.resource = resource;
    this.prompt = prompt;
    this.history = history;
  }

  /**
   * Define la documentacion que se va a utilizar
   * @returns El enlace a documentación de la librería
   */
  async getDocumentationLink(): Promise<string> {
    const query = encodeURIComponent(`${this.library} ${this.resource}`);
    const documentation = await this.searchDocumentation(query);

    // TODO: aqui definimos cual documentacion es la que se va a utilizar
    return '';
  }

  /**
   * Busca en la documentación el método o recurso que se necesita
   * @param documentation La documentación de la librería
   * @returns El método o recurso que se necesita
   */
  // FUTURE: implementation
  // async getDocumentationResource(documentation: string): Promise<string> {
  //   // Lógica para buscar en la documentación el método o recurso que se necesita
  //   // Por ejemplo, utilizando la API de búsqueda de la documentación
  //   const method = await this.searchDocumentation(`${this.library} ${this.fun}`);
  //   return method;
  // }

  /**
   * Procesa la información con un modelo barato o local
   * @param method El método o recurso que se necesita
   * @returns El resumen de la información listo para el modelo grande
   */
  async processInformation(method: string): Promise<string> {
    // Lógica para procesar la información con un modelo barato o local
    // Por ejemplo, utilizando un modelo de resumen como BART
    const summary = await this.summarizeDocumentation(method);
    return summary;
  }

  /**
   * Inyecta la información procesada al modelo grande
   * @param summary El resumen de la información
   * @param prompt La pregunta del usuario
   * @param history El historial de conversación
   * @returns La respuesta del modelo grande
   */
  async injectDocumentation(summary: string): Promise<Message[]> {
    // Lógica para inyectar la información procesada al modelo grande
    // Por ejemplo, utilizando un modelo de lenguaje como GPT-3
    const systemContent = '';
    const newHistory = this.history.concat({
      content: systemContent,
      role: 'system',
    });
    return newHistory;
  }


  /**
   * Obtiene los datos necesarios para la búsqueda
   * @param query La consulta de búsqueda
   * @returns Los datos necesarios para la búsqueda
   */
  async getSearchData(query: string): Promise<any> {
    // Lógica para obtener los datos necesarios para la búsqueda
    // Por ejemplo, utilizando la API de búsqueda de la documentación
    // Esta función debería retornar los datos necesarios para la búsqueda
    throw new Error('Method not implemented.');
  }

  /**
   * Resumir la documentación
   * @param documentation La documentación a resumir
   * @returns El resumen de la documentación
   */
  async summarizeDocumentation(documentation: string): Promise<string> {
    // Lógica para resumir la documentación
    // Por ejemplo, utilizando un modelo de resumen como BART
    // Esta función debería retornar el resumen de la documentación
    throw new Error('Method not implemented.');
  }

  /**
   * Recibe una query y busca la documentacion en el motor de busqueda
   * @param query La consulta de búsqueda
   * @returns Los resultados de la búsqueda
   */
  async searchDocumentation(query: string): Promise<DocumentationObject[]> {
    // Lógica para buscar en la documentación
    // Por ejemplo, utilizando la API de búsqueda de la documentación
    const url = `https://html.duckduckgo.com/html/?q=${query}`;
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.3';

    const response = await axios.get(url, {
      headers: {
        'User-Agent': userAgent,
      },
    });

    console.log(response);
    const $ = cheerio.load(response.data);
    const results = $('.result__body');
    const documentationObjects: DocumentationObject[] = [];

    results.each((_index, element) => {
      const title = $(element).find('.result__title').text();
      const link = $(element).find('.result__a').attr('href');
      const snippet = $(element).find('.result__snippet').text();

      console.log(`${title}, ${link}, ${snippet}`);
      if (
        !link
        || !snippet.includes(this.library) || !snippet.includes(this.resource)
        || !title.includes(this.library) || !title.includes(this.resource)
      ) return;

      const documentationObject: DocumentationObject = {
        library: link,
        resourceLink: link,
        score: this.calculateScore(title, link, snippet),
      };

      documentationObjects.push(documentationObject);
    })
    console.log(JSON.stringify(documentationObjects));
    return documentationObjects;
  }


  calculateScore(result: any, query: string, snippet?: string): number {
    // Esta función se va a implementar más adelante
    // Por ahora, devuelve un valor fijo
    return 0;
  }

  /**
   * Inyecta la información procesada al modelo grande
   * @param library La librería
   * @param fun La función o clase
   * @param prompt La pregunta del usuario
   * @param history El historial de conversación
   * @returns La respuesta del modelo grande
   */
  public async injectSource(): Promise<Message[]> {
    const resourcePage = await this.getDocumentationLink();
    // const summary = await this.processInformation(resourcePage);
    // return await this.injectDocumentation(summary);
    return await this.injectDocumentation('example');
  }
}
