import { useState, useEffect, useMemo, useRef } from 'react';
import { render, Text, Box, useInput } from 'ink';
import TextInput from 'ink-text-input';
import path from 'node:path';
import fs from 'node:fs';
import stringWidth from 'string-width';

const ChatPromptComponent = ({ 
  margin, 
  onDone, 
  getMatches 
}: { 
  margin: string, 
  onDone: (v: string) => void,
  getMatches: (word: string) => string[]
}) => {
  const [input, setInput] = useState('');
  // const [suggestions, setSuggestions] = useState<string[]>([]);

  const [columns, setColumns] = useState(process.stdout.columns || 80);

  const icon = "👨💻 ";
  const prefixWidth = stringWidth(margin + icon)

  useEffect(() => {
    const handleResize = () => setColumns(process.stdout.columns);
    process.stdout.on('resize', handleResize);
    return () => { process.stdout.off('resize', handleResize); };
  }, []);

  const suggestions = useMemo(() => {
    const parts = input.split(/\s/);
    const lastWord = parts[parts.length - 1];
    if (lastWord && lastWord.startsWith('@')) {
      const sugestions = getMatches(lastWord);
      return sugestions;
    }
    return [];
  }, [input, getMatches]);

  const hasSubmitted = useRef(false);
  const mountedAt = useRef(Date.now());

  // useEffect(() => {
  //   const parts = input.split(/\s/);
  //   const lastWord = parts[parts.length - 1];
  //   if (lastWord?.startsWith('@') && lastWord.length > 1) {
  //     setSuggestions(getMatches(lastWord));
  //   } else {
  //     setSuggestions([]);
  //   }
  // }, [input]);

  useInput((char, key) => {
    // console.log(`key: ${JSON.stringify(key)}, char: ${char}`);

    if (key.ctrl && char === 'c') process.exit(0);

    if (key.return && !key.shift && char !== '\u001b[13;2u') {
      if (Date.now() - mountedAt.current < 250) return;

      if (input.trim().length > 0) {
        onDone(input);
      }
      return;
    }

    if (key.return && (key.shift || char === '\u001b[13;2u')) {
      setInput(prev => prev + '\n');
      return;
    }

    if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
      return;
    }

    if (key.tab && suggestions.length > 0) {
      const parts = input.split(/\s/);
      const lastWord = parts[parts.length - 1];
      const bestMatch = suggestions[0];
      const newInput = input.slice(0, input.length - lastWord!.length + 1) + bestMatch;
      setInput(newInput);
      return;
    }

    if (char && !key.meta && !key.ctrl && !key.return && !key.tab && !key. backspace && !key.delete) {
      setInput(prev => prev + char);
    }
  });

  const handleFinalSubmit = (value: string) => {
    if (Date.now() - mountedAt.current < 250) return;

    if (!hasSubmitted.current) {
      hasSubmitted.current = true;
      onDone(value);
    }
  };

  return (
    <Box flexDirection="column" width={columns - 1}>
      <Box flexDirection="row">
        <Box flexShrink={0}>
          <Text>{margin}</Text>
          <Text color="green" bold>{icon}:</Text>
        </Box>
      </Box>
      <Box flexGrow={1} width={columns - 1 - prefixWidth} marginLeft={stringWidth(margin)}>
        <Text wrap="wrap">
          {input}
          {suggestions.length > 0 && (
            <Text color="gray">
              {suggestions[0]!.replace(input.split(/\s/).pop()!.slice(1), '')}
            </Text>
          )}
          <TextInput 
            value='' onChange={() => {}} 
          />

         </Text>
      </Box>

      {suggestions.length > 1 && (
        <Box flexDirection="column" marginLeft={margin.length + 4}>
          {suggestions.slice(0, 5).map((s, i) => (
            <Text key={s} color={i === 0 ? "blue" : "gray"}>
              {i === 0 ? '➔' : ' '} @{s}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
};

export class InputService {
  private MARGIN = "    ";

  private getMatches(word: string): string[] {
    const searchPath = word.slice(1);
    const dir = path.dirname(searchPath);
    const base = path.basename(searchPath);
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

  async ask(): Promise<string> {
    let finalValue = '';
    process.stdin.pause();
    await new Promise(resolve => setTimeout(resolve, 150));
    while (process.stdin.read() !== null) {};
    process.stdin.resume();

    const instance = render(
      <ChatPromptComponent 
        margin={this.MARGIN} 
        getMatches={this.getMatches.bind(this)}
        onDone={(value) => {
          finalValue = value;
          instance.unmount(); 
        }} 
      />,
      {
        exitOnCtrlC: false,
        kittyKeyboard: {mode: 'enabled', flags: ['disambiguateEscapeCodes', 'reportAllKeysAsEscapeCodes']}
      }
    );

    await instance.waitUntilExit();
    
    return finalValue;
  }
}
