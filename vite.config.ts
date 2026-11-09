import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Serves the Vercel functions in /api during `npm run dev`, so the whole app
 * (frontend + API) runs from one local command without the Vercel CLI.
 * Handlers use the Web-standard `Request`/`Response` signature.
 */
function devApi(): Plugin {
  let server: ViteDevServer;
  return {
    name: 'studynight-dev-api',
    apply: 'serve',
    configureServer(s) {
      server = s;
      s.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const url = req.url ?? '';
        const match = /^\/api\/([a-z-]+)(\?.*)?$/.exec(url);
        if (!match) return next();
        try {
          const mod = (await server.ssrLoadModule(`/api/${match[1]}.ts`)) as Record<
            string,
            ((r: Request) => Promise<Response>) | undefined
          >;
          const handler = mod[req.method ?? 'GET'];
          if (!handler) {
            res.statusCode = 405;
            res.end();
            return;
          }
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const body = chunks.length ? Buffer.concat(chunks) : undefined;
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v === 'string') headers.set(k, v);
          }
          const request = new Request(`http://localhost${url}`, {
            method: req.method,
            headers,
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
          });
          const response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: { code: 'UPSTREAM', message: 'Dev server error' } }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Make .env available to the dev API handlers (server side only — never exposed to the client bundle,
  // because none of these variables start with VITE_).
  const env = loadEnv(mode, process.cwd(), '');
  for (const [k, v] of Object.entries(env)) {
    if (k.startsWith('GROQ_') && process.env[k] === undefined) process.env[k] = v;
  }
  return {
    plugins: [react(), tailwindcss(), devApi()],
    worker: { format: 'es' },
    build: {
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: 1500,
    },
  };
});
