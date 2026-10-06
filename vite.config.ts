import { resolve } from 'path';
import { defineConfig } from 'vite';
import { handleAiRequest } from './server/ai.ts';
import { handleGenerationRequest } from './server/generation.ts';

export default defineConfig({
  plugins: [{
    name: 'mopple-ai-service',
    configureServer(server) {
      server.middlewares.use('/api/ai/operations', (req, res) => { void handleAiRequest(req, res); });
      server.middlewares.use('/api/ai/generate', (req, res) => { void handleGenerationRequest(req, res); });
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/ai/operations', (req, res) => { void handleAiRequest(req, res); });
      server.middlewares.use('/api/ai/generate', (req, res) => { void handleGenerationRequest(req, res); });
    },
  }],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        editor: resolve(import.meta.dirname, 'editor.html'),
      },
    },
  },
  server: {
    host: true,
  },
  preview: {
    host: true,
  },
});
