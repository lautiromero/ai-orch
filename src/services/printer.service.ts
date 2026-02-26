import chalk from 'chalk';
import { render } from 'markdansi';
import highlight from 'cli-highlight';

export class PrinterService {
  private readonly MARGIN_SIZE = 4;
  private readonly MARGIN = " ".repeat(this.MARGIN_SIZE);
  private readonly BG_COLOR = chalk.bgRgb(35, 35, 35);

  private getWidth() {
    return Math.min(process.stdout.columns - (this.MARGIN_SIZE * 2), 85);
  }

  hr() {
    const width = Math.min(process.stdout.columns - (this.MARGIN_SIZE * 2), 80);
    console.log(chalk.dim(`${this.MARGIN}${'—'.repeat(width)}`));
  }

  printHeader(text: string) {
    console.log(`${this.MARGIN}${chalk.magenta.bold(text)}`);
  }

  printInfo(text: string) {
    console.log(`${this.MARGIN}${chalk.yellow(text)}`);
  }

  printError(text: string) {
    console.log(`${this.MARGIN}${chalk.red(text)}`);
  }

  printMargin() {
    console.log("");
  }

  renderMarkdown(content: string) {
    const contentWidth = this.getWidth();
    const safeWidth = Math.max(0, contentWidth - 1);

    let processedContent = content.replace(/<think>([\s\S]*?)<\/think>/g, (match, thought) => {
      const header = chalk.cyan.bold.italic('   [Pensamiento del modelo]');
      const body = chalk.cyan.italic(thought.trim());
      // Retornamos el bloque formateado con una sutil línea lateral o simplemente indentado
      return `\n${header}\n${body}\n\n${chalk.dim('---').repeat(5)}\n`;
    });

    const rendered = render(processedContent, {
      width: contentWidth,
      theme: 'bright',
      codeBox: false,
      highlighter: (code, lang) => {
        let highlighted;
        try {
          highlighted = highlight(code, {
            language: lang ? lang.toLowerCase() : 'text',
            ignoreIllegals: true
          });
        } catch (e) {
          highlighted = code;
        }

        return highlighted
          .split('\n')
          .map(line => {
            const leftPadding = '    '; // Los 4 espacios que te gustaron
            const visibleLength = line.replace(/\u001b\[[0-9;]*m/g, '').length + 4;
            const rightPadding = ' '.repeat(Math.max(0, safeWidth - visibleLength));
            return this.BG_COLOR(leftPadding + line + rightPadding);
          })
          .join('\n');
      }
    });

    // Imprimir con margen izquierdo
    rendered.split('\n').forEach(line => {
      console.log(`${this.MARGIN}${line}`);
    });
  }

  clearScreen() {
    console.clear();
    console.log("\n");
  }
}
