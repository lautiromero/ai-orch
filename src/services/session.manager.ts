import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import chalk from 'chalk';
import * as readline from 'node:readline/promises';
import { PrinterService } from './printer.service';
import { type Message } from '../providers/base.provider';

interface SessionData {
  id: string;
  title: string;
  history: Message[];
}

export class SessionManager {
  private sessionsDir: string;
  private maxContextMessages: number = 15; // Un poco más de margen para desarrollo
  private SYSTEM_PROMPT: Message = { role: 'system', content: 'Sos un programador experto.' };

  constructor() {
    this.sessionsDir = path.join(os.homedir(), '.ai-orch/.sessions');
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  /**
   * Genera un ID único basado en timestamp
   */
  generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
  }

  private getPath(id: string): string {
    return path.join(this.sessionsDir, `${id}.json`);
  }

  /**
   * Crea o actualiza la sesión con metadatos
   */
  save(id: string, history: Message[], title?: string): void {
    const existingData = this.loadFullSession(id);

    const sessionData: SessionData = {
      id: id,
      title: title || existingData?.title || 'Nueva conversación',
      history: history
    };

    fs.writeFileSync(this.getPath(id), JSON.stringify(sessionData, null, 2), 'utf-8');
  }

  /**
   * Carga solo el historial para el flujo del chat
   */
  loadHistory(id: string): Message[] {
    const session = this.loadFullSession(id);
    return session ? session.history : [this.SYSTEM_PROMPT];
  }

  /**
   * Cambia el nombre/título de una sesión existente
   */
  rename(id: string, newTitle: string): void {
    const existingData = this.loadFullSession(id);

    // 1. Validación de existencia
    if (!existingData) {
      throw new Error(`No se encontró la sesión con ID: ${id}`);
    }

    // 2. Construcción de la data actualizada
    const sessionData: SessionData = {
      ...existingData,
      title: newTitle.trim() || 'Sin nombre'
    };

    // 3. Persistencia
    fs.writeFileSync(
      this.getPath(id),
      JSON.stringify(sessionData, null, 2),
      'utf-8'
    );
  }

  /**
   * Carga el objeto completo de la sesión
   */
  private loadFullSession(id: string): SessionData | null {
    const filePath = this.getPath(id);
    if (fs.existsSync(filePath)) {
      try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  /**
   * Ventana deslizante para la API
   */
  getContextForApi(history: Message[]): Message[] {
    if (history.length <= this.maxContextMessages) {
      return history;
    }
    // Siempre mantenemos el System Prompt y los últimos N mensajes
    return [this.SYSTEM_PROMPT, ...history.slice(-this.maxContextMessages)];
  }

  /**
   * Lista sesiones con su ID y Título para que sea legible por el usuario
   */
  listSessions(): { id: string, title: string }[] {
    if (!fs.existsSync(this.sessionsDir)) return [];

    return fs.readdirSync(this.sessionsDir)
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const id = file.replace('.json', '');
        const filePath = path.join(this.sessionsDir, file);
        try {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          return { id: id, title: data.title || id };
        } catch {
          return { id: id, title: id };
        }
      })
      // Ordenamos por la más reciente (usando la fecha de modificación del archivo)
      .sort((a, b) => {
        const statA = fs.statSync(path.join(this.sessionsDir, `${a.id}.json`));
        const statB = fs.statSync(path.join(this.sessionsDir, `${b.id}.json`));
        return statB.mtimeMs - statA.mtimeMs;
      });
  }

  async selectSession(printer: PrinterService, rl: readline.Interface): Promise<string> {
    const sessions = this.listSessions();

    printer.printMargin();
    printer.printHeader("S E S I O N E S");
    printer.hr();

    if (sessions.length === 0) return this.generateId();

    sessions.forEach((s, i) => {
      // Usamos el margen estándar para las opciones
      console.log(`    ${chalk.green(i + 1)} ${chalk.white(s.title)}`);
    });

    console.log(`    ${chalk.green('0')} ${chalk.dim('Nueva conversación')}\n`);

    const choiceStr = await rl.question(`    ${chalk.yellow('» Elige una opción: ')}`);
    const choiceIdx = parseInt(choiceStr, 10);

    return (isNaN(choiceIdx) || choiceIdx === 0 || !sessions[choiceIdx - 1])
      ? this.generateId()
      : sessions[choiceIdx - 1]!.id;
  }
}
