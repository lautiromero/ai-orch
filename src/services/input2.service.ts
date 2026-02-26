import Enquirer from 'enquirer';
import chalk from 'chalk';
import path from 'node:path';
import fs from 'node:fs';
import stringWidth from 'string-width'; // Importar string-width
import wrapAnsi from 'wrap-ansi';     // Importar wrap-ansi

// Helper para quitar códigos ANSI (colores) para cálculos de longitud
const stripAnsi = (str: string) => str.replace(/\u001b\[[0-9;]*m/g, '');

export class InputService {
  private MARGIN = "    ";

  async ask(): Promise<string> {
    const { Prompt } = Enquirer;

    // Activamos el modo de teclado extendido (CSI u)
    process.stdout.write('\u001b[>1u');

    class ChatInput extends (Prompt as any) {
      constructor(options: any) {
        super(options);
        this.input = ''; // La cadena de texto cruda del usuario
        this.cursor = 0; // La posición del cursor dentro de 'this.input'
        this.state.size = 0; // Inicializar this.state.size para la primera limpieza
        this.value = this.result;
      }

      async keypress(char: string, key: any) {
        if (!key) return;

        const isCtrlC = (key.ctrl && key.name === 'c') || key.sequence === '\u001b[99;5u';

        // 1. Salir (Ctrl+C)
        if (isCtrlC) {
          process.stdout.write('\u001b[<u'); // Desactivar modo teclado extendido
          process.stdout.write('\n');
          return process.exit(0);
        }

        // 2. Shift + Enter (Nueva línea)
        if (key.sequence === '\u001b[13;2u') {
          // this.input = this.input.slice(0, this.cursor) + '\n' + this.input.slice(this.cursor);
          this.input = this.input.slice(0, this.cursor) + '\n';
          this.cursor++;
          return this.render();
        }

        // 3. Tab (Autocompletado)
        if (key.name === 'tab') {
          this.handleTabComplete();
          return this.render();
        }

        // 4. Enter (Enviar)
        if (key.name === 'return') {
          return this.submit();
        }

        // 5. Borrar
        if (key.name === 'backspace') {
          if (this.cursor > 0) {
            this.input = this.input.slice(0, this.cursor - 1) + this.input.slice(this.cursor);
            this.cursor--;
          }
          return this.render();
        }

        // 6. Caracteres normales
        if (char && char.length === 1 && !key.ctrl && !key.meta && key.name !== 'undefined') {
          this.input = this.input.slice(0, this.cursor) + char + this.input.slice(this.cursor);
          this.cursor++;
        }

        return this.render();
      }

      handleTabComplete() {
        const beforeCursor = this.input.slice(0, this.cursor);
        const afterCursor = this.input.slice(this.cursor);
        const parts = beforeCursor.split(/\s/);
        const lastWord = parts[parts.length - 1];

        if (lastWord.startsWith('@')) {
          const matches = this.getMatches(lastWord);
          if (matches.length > 0) {
            const bestMatch = matches[0];
            // Reemplazamos desde el @ hasta el cursor con el match
            const newBefore = beforeCursor.slice(0, beforeCursor.length - lastWord.length + 1) + bestMatch;
            this.input = newBefore + afterCursor;
            this.cursor = newBefore.length;
          }
        }
      }

      getMatches(word: string): string[] {
        const searchPath = word.slice(1);
        const dir = path.dirname(searchPath);
        const base = path.basename(searchPath);

        // Si no hay base y termina en /, es que busca dentro de esa carpeta
        const isSearchingInDir = searchPath.endsWith('/');
        const targetDir = isSearchingInDir ? searchPath : dir;
        const targetBase = isSearchingInDir ? '' : base;

        const fullDir = path.resolve(process.cwd(), targetDir === '.' ? '' : targetDir);

        try {
          if (fs.existsSync(fullDir) && fs.lstatSync(fullDir).isDirectory()) {
            return fs.readdirSync(fullDir)
              .filter(f => f.startsWith(targetBase))
              .sort((a, b) => a.length - b.length)
              .map(f => path.join(targetDir === '.' ? '' : targetDir, f));
          }
        } catch { return []; }
        return [];
      }

      /**
       * Sobrescribe el método submit para evitar el error de propiedad de solo lectura.
       * NO limpia el prompt, ya que debe permanecer en pantalla como parte de la conversación.
       */
      async submit() {
        process.stdout.write('\u001b[<u'); // Desactivar modo teclado extendido antes de salir

        // No limpiar el prompt aquí. El flujo principal (index.ts) se encargará
        // de imprimir el mensaje del usuario, lo que efectivamente "reemplazará" el prompt.
        this.emit('submit', this.input);
        this.resolve(this.input); // Resuelve la promesa de Enquirer con el input final.
      }

      /**
       * Sobrescribe el getter 'value' para controlar qué se muestra en la terminal.
       * NO inserta un símbolo de cursor, ya que usaremos el cursor nativo de la terminal.
       */
      // get value() {
      //   const prefix = this.options.prefix || '';
      //   const message = this.options.message || '';
      //   const content = this.input || ''; // El input crudo del usuario

      //   const inputToFormat = content;

      //   // 1. Formatear las líneas: añadir el prefijo a las líneas subsiguientes
      //   // El prefijo principal (this.options.prefix + this.options.message) se añade en render()
      //   const lines = inputToFormat.split('\n');
      //   const formattedInput = lines.map((line, idx) => {
      //     if (idx === 0) return line;
      //     return this.MARGIN + line; // Las líneas subsiguientes del input obtienen 2 espacios de indentación
      //     // return line; // Las líneas subsiguientes del input obtienen 2 espacios de indentación
      //   }).join('\n');

      //   // let output = `${prefix}${message} ${formattedInput}`;
      //   let output = formattedInput;

      //   // 2. Lógica de sugerencia (hint)
      //   const parts = this.input.slice(0, this.cursor).split(/\s/);
      //   const lastWord = parts[parts.length - 1];
      //   if (lastWord.startsWith('@') && lastWord.length > 1) {
      //     const matches = this.getMatches(lastWord);
      //     if (matches.length > 0) {
      //       const hint = matches[0]?.replace(lastWord.slice(1), '');
      //       if (hint) {
      //         output += chalk.dim(hint);
      //       }
      //     }
      //   }

      //   // console.log('value: ', output);
      //   return output;
      // }

      /**
       * Implementación del método render() requerido.
       * Gestiona completamente la limpieza, escritura y posicionamiento del cursor
       * usando directamente process.stdout.write y códigos ANSI.
       */
      render() {
        const outputToDisplay = this.value; // La cadena completa a mostrar

        // --- 1. Limpieza de la pantalla ---
        // Mover cursor al inicio de la línea actual
        process.stdout.write('\r');
        this.clear();
        // Mover cursor hacia arriba y borrar las líneas anteriores
        // this.state.size contiene el número de líneas del *render anterior*.
        for (let i = 0; i < this.state.size; i++) {
          process.stdout.write('\u001b[2K'); // Borrar toda la línea
          // this.clear();
          // if (i < this.state.size - 1) { // Si no es la última línea a borrar, subir
          //   process.stdout.write('\u001b[1A'); // Mover cursor una línea arriba
          // }
        }
        // Después del bucle, el cursor debería estar al inicio de la primera línea que ocupaba el prompt.
        // --- Fin Limpieza ---

        // --- 2. Escritura de la nueva salida ---
        // Escribir la salida directamente a stdout, bypass Enquirer's this.write()
        process.stdout.write(outputToDisplay);

        // --- 3. Actualizar this.state.size para el próximo render ---
        // Usar wrapAnsi para calcular con precisión el número de líneas que ocupa la salida.
        const terminalWidth = process.stdout.columns || 80;
        const wrappedOutput = wrapAnsi(outputToDisplay, terminalWidth, {
          hard: true, // Asegura que las líneas se rompan exactamente al ancho
          trim: false // No recortar espacios al final de las líneas
        });
        this.state.size = wrappedOutput.split('\n').length;

        // --- 4. Posicionamiento del Cursor ---
        // El cursor nativo de la terminal está actualmente al final de 'outputToDisplay'.
        // Necesitamos moverlo hacia atrás para que quede en la posición correcta dentro del input del usuario.

        const content = this.input || '';
        let hintPart = '';
        const parts = content.slice(0, this.cursor).split(/\s/);
        const lastWord = parts[parts.length - 1];
        if (lastWord.startsWith('@') && lastWord.length > 1) {
          const matches = this.getMatches(lastWord);
          if (matches.length > 0) {
            const hint = matches[0]?.replace(lastWord.slice(1), '');
            if (hint) hintPart = chalk.dim(hint);
          }
        }

        // Caracteres en el input del usuario que están *después* del cursor
        const charsAfterCursorInInput = content.length - this.cursor;
        // Longitud visual del hint (calculada con stringWidth)
        const hintLength = stringWidth(hintPart);

        // Total de caracteres que necesitamos mover el cursor hacia atrás
        // (longitud del hint + longitud del texto del usuario después del cursor)
        const totalCharsToMoveBack = hintLength + charsAfterCursorInInput;

        if (totalCharsToMoveBack > 0) {
          process.stdout.write(`\u001b[${totalCharsToMoveBack}D`);
        }
      }
    }

    const prompt = new ChatInput({
      message: chalk.green.bold(''),
      // message: chalk.green.bold('👨‍💻 '),
      prefix: this.MARGIN
    });

    try {
      return await prompt.run();
    } finally {
      // Asegurarse de que el modo de teclado extendido se desactive al salir
      process.stdout.write('\u001b[<u');
    }
  }
}
