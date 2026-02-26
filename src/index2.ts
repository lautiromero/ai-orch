import 'dotenv/config';
import * as readline from 'node:readline/promises';
import chalk from 'chalk';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import { API_KEYS } from '../config/models.config';
import { GroqProvider } from './providers/groq.provider';
import { Orchestrator } from './services/orchestrator';
import { SessionManager } from './services/session.manager';
import { PromptEngine } from './services/prompt.engine';
import { fileCompleter } from './services/autocomplete.service';

const MARGIN_SIZE = 4;
const MARGIN = ' '.repeat(MARGIN_SIZE);

marked.setOptions({
  renderer: new TerminalRenderer({
    code: chalk.yellow,
    blockquote: chalk.italic.gray,
    firstHeading: chalk.magenta.bold,
    strong: chalk.bold.cyan,
    width: Math.min(process.stdout.columns - (MARGIN_SIZE * 2), 70),
    reflowText: true
  }) as any
});

const printText = (text: string) => {
  const lines = text.split('\n');
  lines.forEach(line => {
    console.log(`${MARGIN}${chalk.whiteBright(line)}`);
  });
};

const hr = () => {
  const width = Math.min(process.stdout.columns - (MARGIN_SIZE * 2), 70);
  console.log(chalk.dim(`${MARGIN}${'—'.repeat(width)}`));
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: fileCompleter
});

async function selectSession(sessionManager: SessionManager): Promise<string> {
  const sessions = sessionManager.listSessions();
  console.log('');
  printText(chalk.cyan.bold('S E S I O N E S'));
  hr();
  if (sessions.length === 0) return sessionManager.generateId();

  sessions.forEach((s, i) => {
    printText(`${chalk.green(i + 1)} ${chalk.white(s.title)}`);
  });
  printText(`${chalk.green('0')} ${chalk.dim('Nueva conversación')}\n`);

  const choiceStr = await rl.question(`${MARGIN}${chalk.yellow('» Elige una opción: ')}`);
  const choiceIdx = parseInt(choiceStr, 10);
  return (isNaN(choiceIdx) || choiceIdx === 0 || !sessions[choiceIdx - 1])
    ? sessionManager.generateId()
    : sessions[choiceIdx - 1]!.id;
}

async function main() {
  const sessionManager = new SessionManager();
  const promptEngine = new PromptEngine();
  const orchestrator = new Orchestrator({ groq: new GroqProvider(API_KEYS.groq!) });

  console.clear();
  console.log('\n');
  printText(chalk.magenta.bold('◢ AI ORCHESTRATOR v1.0'));
  hr();

  let currentSessionId = await selectSession(sessionManager);
  let history = sessionManager.loadHistory(currentSessionId);

  console.clear();
  printText(chalk.magenta.bold('◢ AI ORCHESTRATOR'));
  hr();

  while (true) {
    const userInput = await rl.question(`\n${chalk.green.bold(MARGIN + '👨💻 ')} `);
    if (userInput.toLowerCase() === 'exit') break;

    if (userInput === '/clear') {
      history = [{ role: 'system', content: 'Sos un programador experto.' }];
      sessionManager.save(currentSessionId, history);
      printText(chalk.yellow('⚠ Historial limpio.'));
      continue;
    }

    const finalInput = await promptEngine.processInput(userInput);
    history.push({ role: 'user', content: finalInput });

    console.log('');
    process.stdout.write(`${MARGIN}${chalk.magenta.bold('🤖 AI:')} ${chalk.dim('Pensando...')}`);

    try {
      let fullResponse = '';
      for await (const chunk of orchestrator.ask(sessionManager.getContextForApi(history))) {
        fullResponse += chunk;
      }

      process.stdout.write('\r');
      process.stdout.clearLine(0);

      const rendered = marked.parse(fullResponse) as string;

      console.log('');
      console.log('');

      const codeContainer = [] as any;
      rendered.split('\n').forEach(line => {
        if (line.trim() !== '') {
          codeContainer.push(`${MARGIN}${line}`);
        }
      });

      console.log(codeContainer.join('\n'));

      history.push({ role: 'assistant', content: fullResponse });
      sessionManager.save(currentSessionId, history);
      hr();
    } catch (err: any) {
      process.stdout.write('\r');
      process.stdout.clearLine(0);
      printText(chalk.red(`[Error]: ${err.message}`));
    }
  }
  rl.close();
}

main();
