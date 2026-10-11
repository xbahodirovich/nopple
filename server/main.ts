import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import {pageRoutes,pageRedirects} from './routes.ts';
import { handleAiRequest } from './ai.ts';
import { handleGenerationRequest } from './generation.ts';

const root = resolve('dist');
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json' };
createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/api/ai/operations') { await handleAiRequest(req, res); return; }
  if (url.pathname.startsWith('/api/ai/generate')) { await handleGenerationRequest(req, res); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  try {
    const pathname = decodeURIComponent(url.pathname);
    if(pageRedirects[pathname]){res.writeHead(308,{Location:pageRedirects[pathname]+url.search});res.end();return;}
    const relative = pageRoutes[pathname] ?? pathname.slice(1);
    const path = resolve(root, relative);
    if (!path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    const contents = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : contents);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '127.0.0.1', () => console.log(`Mopple server ready on port ${process.env.PORT ?? 3000}`));
