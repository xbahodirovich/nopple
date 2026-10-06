import { resolve } from 'path';
import { defineConfig, loadEnv } from 'vite';
import { handleAiRequest } from './server/ai.ts';

export default defineConfig(({mode}) => {
 const env=loadEnv(mode,process.cwd(),'');
 for (const key of ['NVIDIA_API_KEY','AI_PER_IP_PER_MINUTE','AI_DAILY_CAP','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN']) if(process.env[key]===undefined && env[key]) process.env[key]=env[key];
 return {
  plugins: [{
    name: 'mopple-ai-service',
    transformIndexHtml: { order: 'post', handler(html, context) {
      if(!env.VITE_SITE_URL)return html;
      const origin=new URL(env.VITE_SITE_URL).origin;
      return html.replace(/(<meta property="og:image" content=")([^" ]+)(")/, (_match,start,path,end)=>start+new URL(path,origin).href+end).replace('</head>',`<meta property="og:url" content="${new URL(context.path,origin).href}"></head>`);
    } },
    configureServer(server) { server.middlewares.use('/api/ai/operations', (req, res) => { void handleAiRequest(req, res); }); },
    configurePreviewServer(server) { server.middlewares.use('/api/ai/operations', (req, res) => { void handleAiRequest(req, res); }); },
  }],
  build: {
    rollupOptions: {
      input: {
        share: resolve(import.meta.dirname, 'share.html'),
        homes: resolve(import.meta.dirname, 'homes.html'),
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
}; });
