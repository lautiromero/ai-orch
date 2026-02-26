import * as fs from 'node:fs';
import * as path from 'node:path';

// Exportamos la función directamente para que coincida con la firma
export function fileCompleter(line: string): [string[], string] {
  const parts = line.split(' ');
  const lastWord = parts[parts.length - 1];

  if (lastWord?.startsWith('@')) {
    const searchPath = lastWord.slice(1);
    const dir = path.dirname(searchPath);
    const base = path.basename(searchPath);

    // Resolvemos la ruta absoluta
    const fullDir = path.resolve(process.cwd(), dir === '.' ? '' : dir);

    try {
      if (fs.existsSync(fullDir) && fs.lstatSync(fullDir).isDirectory()) {
        const files = fs.readdirSync(fullDir);

        const hits = files
          .filter(f => f.startsWith(base))
          .map(f => {
            const fullPath = path.join(dir === '.' ? '' : dir, f);
            return `@${fullPath}`;
          });

        return [hits, lastWord];
      }
    } catch (e) {
      return [[], lastWord];
    }
  }

  return [[], line];
}
