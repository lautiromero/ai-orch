import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';

export class PromptEngine {
  /**
   * Procesa el input del usuario buscando menciones de archivos con '@'
   * y adjunta su contenido al final del mensaje.
   */

  // TODO: cambiar esta funcion para que limpie los inputs que vuelven de CommandService
  async processInput(input: string): Promise<string> {
    const fileRegex = /@([\w\.\/\-]+\.\w+)/g; // Detecta @ruta/archivo.ext
    const matches = input.match(fileRegex);

    if (!matches) return input;

    let attachedContext = "\n\n--- Contexto de Archivos ---\n";
    let processedInput = input;
    let foundFiles = false;

    for (const match of matches) {
      const fileName = match.slice(1); // Quitamos el '@'
      const absolutePath = path.resolve(process.cwd(), fileName);

      try {
        if (fs.existsSync(absolutePath) && fs.lstatSync(absolutePath).isFile()) {
          const content = fs.readFileSync(absolutePath, 'utf-8');

          attachedContext += `\nArchivo: ${fileName}\n\`\`\`\n${content}\n\`\`\`\n`;

          // Reemplazamos en el texto original para que la IA sepa de qué hablamos
          processedInput = processedInput.replace(match, `[Archivo: ${fileName}]`);

          console.log(chalk.blue(`[Sistema] Contenido de ${fileName} inyectado.`));
          foundFiles = true;
        } else {
          console.log(chalk.red(`[Debug] File doesn't exists: ${absolutePath}`));
        }
      } catch (err) {
        console.error(chalk.red(`[Error] No se pudo leer @${fileName}`));
      }
    }

    return foundFiles ? `${processedInput}${attachedContext}` : input;
  }
}
