import React, { useState, useEffect } from 'react';
import { render, Text, Box, useInput } from 'ink';
import TextInput from 'ink-text-input'; // Componente oficial para inputs
import fs from 'fs';

const ChatApp = () => {
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Lógica de Autocompletado (se dispara cuando cambia el query)
  useEffect(() => {
    if (query.includes('@')) {
      const parts = query.split('@');
      const lastPart = parts[parts.length - 1];

      try {
        // Buscamos carpetas en el directorio actual que empiecen con lo que escribió
        const files = fs.readdirSync('.')
          .filter(f => f.startsWith(lastPart) && fs.lstatSync(f).isDirectory());
        setSuggestions(files.slice(0, 5)); // Limitamos a 5 sugerencias
      } catch (e) {
        setSuggestions([]);
      }
    } else {
      setSuggestions([]);
    }
  }, [query]);

  // Manejo de envío de mensaje
  const handleSubmit = (value: string) => {
    if (value.trim()) {
      setHistory(prev => [...prev, value]);
      setQuery('');
    }
  };

  // Captura de teclas especiales (Shift + Enter es difícil en terminal, 
  // pero podemos usar Ctrl + Enter o detectar el \n)
  useInput((input, key) => {
    if (key.return && (key.ctrl || key.meta)) {
      // Si quisieras forzar un salto de línea manual
      setQuery(prev => prev + '\n');
    }
  });

  return (
    <Box flexDirection= "column" padding = { 1} >
      {/* Historial de mensajes */ }
      < Box flexDirection = "column" marginBottom = { 1} >
      {
        history.map((msg, i) => (
          <Text key= { i } >
          <Text color="cyan" bold > yo: </Text> {msg}
        </Text>
        ))
      }
        </Box>

  {/* Área de Input */ }
  <Box>
    <Text color="green" bold > yo: </Text>
      < TextInput
  value = { query }
  onChange = { setQuery }
  onSubmit = { handleSubmit }
    />
    </Box>

  {/* Ventana flotante de sugerencias */ }
  {
    suggestions.length > 0 && (
      <Box flexDirection="column" borderStyle = "round" borderColor = "blue" marginTop = { 1} >
        <Text color="gray" > Sugerencias de carpetas: </Text>
    {
      suggestions.map(s => (
        <Text key= { s } color = "yellow" > @{ s } </Text>
      ))
    }
    </Box>
      )}
</Box>
  );
};

render(<ChatApp />);
