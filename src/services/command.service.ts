import { SessionManager } from './session.manager';
import { type Message } from '../providers/base.provider';
import { PrinterService } from './printer.service';
import { Orchestrator } from './orchestrator';
import clipboard from 'clipboardy';
import chalk from 'chalk';
import { PromptEngine } from './prompt.engine';
import { SourceService } from './source.service';

export class CommandService {
  private promptEngine;
  private shouldContinue: boolean;
  private updatedHistory: Message[];

  constructor(
    private sessionManager: SessionManager,
    private printer: PrinterService,
    private orchestrator: Orchestrator
  ) {
    this.promptEngine = new PromptEngine();
    this.shouldContinue = true;
    this.updatedHistory = [];
  }

  /**
   * Ejecuta un comando y devuelve true si el flujo principal debe continuar (continue)
   * o false si debe procesar la entrada como prompt de IA.
   */

  async execute(input: string, sessionId: string, history: any[]): Promise<{ shouldContinue: boolean, updatedHistory?: any[] }> {
    const trimmedInput = input.trim();

    // Si no empieza con /, no es un comando para este service
    if (!trimmedInput.startsWith('/')) return { shouldContinue: false };

    // Separamos el comando del resto (argumentos)
    const parts = trimmedInput.split(' ');
    const command = parts[0]?.toLowerCase() || '/help';
    const args = parts.slice(1).join(' ');

    switch (command) {
      case '/models':
        const models = this.orchestrator.getModels();
        const currentIndex = this.orchestrator.getCurrentModelIndex();

        this.printer.printMargin();
        this.printer.printInfo("Modelos disponibles:");
        models.forEach((m, i) => {
          const isCurrent = i === currentIndex;
          const bullet = isCurrent ? chalk.cyan('  → ') : '    ';
          const label = isCurrent ? chalk.cyan.bold(m.label) : chalk.white(m.label);
          console.log(`${bullet}${chalk.dim(`[${i}]`)} ${label} ${chalk.dim(`(${m.provider})`)}`);
        });
        this.printer.printMargin();
        this.shouldContinue = true;
        break;

      case '/use':
        const index = parseInt(args);
        if (isNaN(index)) {
          this.printer.printError("❌ Uso: /use [número]. Ejemplo: /use 0");
          return { shouldContinue: true };
        }

        const success = this.orchestrator.setModel(index);
        if (success) {
          const newModel = this.orchestrator.getCurrentModel();
          this.printer.printInfo(`✅ Cambiado a: ${chalk.bold(newModel.label)}`);
        } else {
          this.printer.printError("❌ Índice de modelo no válido.");
        }
        this.shouldContinue = true;
        break;

      case '/clear':
        const newHistory = [{ role: 'system', content: 'Sos un programador experto.' }] as Message[];
        this.sessionManager.save(sessionId, newHistory);
        this.printer.printInfo("⚠ Historial de conversación limpio.");

        this.shouldContinue = true;
        this.updatedHistory = newHistory;
        break;

      case '/help':
        this.printer.printMargin();
        this.printer.printInfo("Comandos disponibles:");
        this.printer.printInfo("  /models          - Lista los modelos configurados");
        this.printer.printInfo("  /use [n]         - Cambia al modelo indicado por el índice");
        this.printer.printInfo("  /rename [titulo] - Renombra la sesión actual");
        this.printer.printInfo("  /clear           - Limpia el historial de la sesión actual");
        this.printer.printInfo("  /copy [n]        - Copia el bloque de código n. Default 1");
        this.printer.printInfo("  /exit            - Cierra la aplicación");
        this.printer.printMargin();

        this.shouldContinue = true;
        break;

      case '/rename':
        const newName = args.trim();
        if (!newName) {
          this.printer.printError("❌ Debes indicar un nombre: /rename Mi Nueva Sesion");
          this.shouldContinue = true;
          break;
        }

        try {
          this.sessionManager.rename(sessionId, newName);
          this.printer.printInfo(`✅ Sesión renombrada a: "${newName}"`);
        } catch (e: any) {
          this.printer.printError(`❌ Error al renombrar: ${e.message}`);
        }
        this.shouldContinue = true;
        break;

      case '/copy':
        // 1. Buscamos el último mensaje de la IA en el historial
        const lastAiMessage = [...history].reverse().find(msg => msg.role === 'assistant');

        if (!lastAiMessage || !lastAiMessage.content) {
          this.printer.printError("❌ No hay mensajes de la IA para copiar.");
          this.shouldContinue = true;
          break;
        }

        // 2. Expresión regular para encontrar bloques de código
        const codeBlockRegex = /```[\s\S]*?\n([\s\S]*?)```/g;
        const matches = [...lastAiMessage.content.matchAll(codeBlockRegex)];

        if (matches.length === 0) {
          this.printer.printError("❌ No se encontraron bloques de código en el último mensaje.");
          this.shouldContinue = true;
          break
        }

        // 3. Determinar qué bloque copiar (por defecto el prime ro o el indicado por args)
        const copyIndex = args ? parseInt(args) - 1 : 0;

        if (isNaN(copyIndex) || !matches[copyIndex]) {
          this.printer.printError(`❌ Bloque no válido. Hay ${matches.length} bloques disponibles.`);
          this.shouldContinue = true;
          break;
        }

        const codeToCopy = matches[copyIndex][1].trim();
        try {
          clipboard.writeSync(codeToCopy);
          this.printer.printInfo(`📋 Bloque de código ${copyIndex + 1} copiado al portapapeles.`);
        } catch (err) {
          this.printer.printError("❌ Falló el acceso al portapa peles.");
        }

        this.shouldContinue = true;
        break;

      case '/source': {
        const [queryPart, askPart] = args.split(' -- ', 2);
        const query = queryPart?.trim();
        if (!query) {
          this.printer.printError('❌ Uso: /source <términos> [-- <pregunta>]');
          this.shouldContinue = true;
          break;
        }

        const [library, ...rest] = query?.split(' ');
        const resource = rest.join(' ');

        if (!library || !askPart) {
          this.printer.printError('❌ Uso: /source <términos> [-- <pregunta>]');
          this.shouldContinue = true;
          break;
        }

        // 1. Búsqueda (llamada al futuro SearchService)
        const sourceService = new SourceService(library, resource, askPart, history);
        await sourceService.injectSource();

        // // 2. Modo solo-search
        // if (askPart === undefined) {
        //   this.printer.printMargin();
        //   this.printer.printInfo('🔍 Resultados de búsqueda:');
        //   console.log(summary);
        //   if (sources.length) {
        //     console.log(chalk.dim('\nFuentes:'), sources.join(', '));
        //   }
        //   this.printer.printMargin();
        //   return { shouldContinue: true };
        // }

        // // 3. Modo search+ask
        // const systemMsg: Message = {
        //   role: 'system',
        //   content: `Contexto recuperado:\n${summary}\nFuentes: ${sources.join(', ')}`
        // };
        // const userMsg: Message = {
        //   role: 'user',
        //   content: askPart.trim()
        // };

        // // Reemplazamos el comando por los dos mensajes
        // const idx = history.length - 1; // el último es el /search
        // history.splice(idx, 1, systemMsg, userMsg);

        // return { shouldContinue: false, updatedHistory: history };
        this.shouldContinue = true;
        break;
      }

      default:
        this.printer.printInfo(`❌ Comando desconocido: ${command} `);
        this.shouldContinue = true;
    }

    // Always process the final input
    const finalInput = await this.promptEngine.processInput(trimmedInput);
    history.push({ role: 'user', content: finalInput });
    return {
      updatedHistory: this.updatedHistory.length ? this.updatedHistory : undefined,
      shouldContinue: this.shouldContinue
    }
  }
}
