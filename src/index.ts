import 'dotenv/config';
import * as readline from 'node:readline/promises';
import chalk from 'chalk';
import { Orchestrator } from './services/orchestrator';
import { SessionManager } from './services/session.manager';
import { PromptEngine } from './services/prompt.engine';
import { PrinterService } from './services/printer.service';
import { CommandService } from './services/command.service';
import { InputService } from './services/input.service';
import { ProviderFactory } from './providers/factory';

async function main() {
  const printer = new PrinterService();
  const inputService = new InputService();

  // Keep this rl only for the initial session selection
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const sessionManager = new SessionManager();

  const providers = ProviderFactory.build();
  const orchestrator = new Orchestrator(providers);

  const commandService = new CommandService(sessionManager, printer, orchestrator);

  // 1. Startup and Session Selection
  printer.clearScreen();
  printer.printHeader("◢ AI ORCHESTRATOR v1.0");
  printer.hr();

  let currentSessionId = await sessionManager.selectSession(printer, rl);
  let history = sessionManager.loadHistory(currentSessionId);

  // TODO: print the session history

  // Close this readline because InputService will use its own (Enquirer)
  rl.close();

  // 2. Prepare Chat UI
  printer.clearScreen();
  printer.printHeader("◢ AI ORCHESTRATOR");
  printer.hr();

  // 3. Chat Loop
  while (true) {
    // Use the new multiline service (Shift+Enter for new line, Enter to send)
    const userInput = await inputService.ask();

    if (!userInput || userInput.trim().length === 0) {
      continue;
    }

    const trimmedInput = userInput.trim();

    // NOW WE RENDER ON THE COMPONENET
    printer.printMargin();
    printer.hr();

    if (!trimmedInput) continue;

    // Exit is now handled as a command or simple check
    if (trimmedInput.toLowerCase() === 'exit') break;

    // Command Logic (Delegated to the service)
    if (trimmedInput.startsWith('/')) {
      const result = await commandService.execute(trimmedInput, currentSessionId, history);
      if (result.updatedHistory) history = result.updatedHistory;
      // If the command already processed everything (e.g., clear screen), ask for input again
      if (result.shouldContinue) continue;
    } else {
      // Prompt processing (ex: files)
      // Command service allways call this method so we call it here only in no command cases
      const promptEngine = new PromptEngine();
      const finalInput = await promptEngine.processInput(trimmedInput);
      history.push({ role: 'user', content: finalInput });
    }

    printer.printMargin();
    process.stdout.write(`    ${chalk.magenta.bold('🤖 :')} ${chalk.dim('Thinking...')}`);

    try {
      const fullResponse = await orchestrator.ask(sessionManager.getContextForApi(history));
      const model = orchestrator.getCurrentModel();

      // Clear the "Thinking..." message
      process.stdout.write('\r\x1b[K');

      printer.printHeader(`🤖 ${model.label}:`);
      printer.printMargin();
      printer.renderMarkdown(fullResponse);

      history.push({ role: 'assistant', content: fullResponse });
      sessionManager.save(currentSessionId, history);

      printer.printMargin();
      printer.hr();

    } catch (err: any) {
      process.stdout.write('\r\x1b[K');
      console.log(`    ${chalk.red(`[Error]: ${err.message}`)}`);
    }
  }

  console.log(`\n    ${chalk.dim('Goodbye!')}`);
}

main().catch(err => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
