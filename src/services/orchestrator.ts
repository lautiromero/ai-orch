import chalk from 'chalk';
import { AVAILABLE_MODELS } from '../../config/models.config';
import { AIProvider, type Message } from '../providers/base.provider';

interface Model {
  id: string;
  provider: string;
  label: string;
  priority: number;
}

export class Orchestrator {
  private sortedModels = [...AVAILABLE_MODELS].sort((a, b) => a.priority - b.priority) as Model[];
  private currentModelIndex = 0;

  constructor(private providers: Record<string, AIProvider>) { }

  /**
   * Retorna el modelo que está siendo utilizado actualmente.
   */
  public getCurrentModel(): Model {
    return this.sortedModels[this.currentModelIndex]!;
  }

  public getCurrentModelIndex() {
    return this.currentModelIndex;
  }


  public setModel(index: number): boolean {
    if (index >= 0 && index < this.sortedModels.length) {
      this.currentModelIndex = index;
      return true;
    }
    return false;
  }
  /**
  * Returns a list of models availables
  */
  public getModels(): Model[] {
    return this.sortedModels;
  }

  async ask(messages: Message[]): Promise<string> {
    const totalModels = this.sortedModels.length;

    for (let i = 0; i < totalModels; i++) {
      // Calculamos el índice real basado en el último que funcionó
      const targetIndex = (this.currentModelIndex + i) % totalModels;
      const model = this.sortedModels[targetIndex];

      if (!model) continue;

      const provider = this.providers[model.provider];
      if (!provider) continue;

      try {
        const label = model.label;
        // Si i > 0, estamos en un reintento (fallback)
        const color = i === 0 ? chalk.blue : chalk.yellow;

        process.stdout.write(`\r${' '.repeat(4)}${color(`[${label}]:`)} ${chalk.dim('thinking...')}\x1b[K`);

        const response = await provider.ask(messages, model.id);

        // Guardamos el índice del modelo que respondió con éxito
        this.currentModelIndex = targetIndex;

        process.stdout.write('\r\x1b[K');
        return response;

      } catch (error: any) {
        if (error.message === 'RATE_LIMIT_EXCEEDED') {
          process.stdout.write('\r\x1b[K');
          console.log(`    ${chalk.red('⚠️  ')} ${chalk.dim(`${model.label} saturado. Probando siguiente...`)}`);
          continue;
        }

        process.stdout.write('\r\x1b[K');
        console.log(`    ${chalk.red('❌ ')} ${chalk.dim(`Error en ${model.label}: ${error.message}`)}`);
        continue;
      }
    }

    throw new Error("No hay proveedores disponibles o todos los modelos de la lista fallaron.");
  }
}
