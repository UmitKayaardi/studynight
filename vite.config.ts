import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
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
    plugins: [
      react(),
      tailwindcss(),
      devApi(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
        manifest: {
          name: 'StudyNight',
          short_name: 'StudyNight',
          description: 'Your notes, turned into a game. Upload your study material and play a quiz built from it.',
          lang: 'en',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#0b1026',
          theme_color: '#0b1026',
          categories: ['education', 'productivity'],
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // The app shell and every lazily loaded screen are precached for offline play. Large, rarely needed
          // files (script font slices, the ONNX runtime) are cached on first use instead.
          globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}', 'assets/inter-latin-*.woff2', 'assets/nunito-latin-*.woff2'],
          globIgnores: ['**/ort/**'],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' },
            {
              urlPattern: ({ url }) => url.pathname.endsWith('.woff2'),
              handler: 'CacheFirst',
              options: { cacheName: 'sn-fonts', expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 365 } },
            },
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/ort/'),
              handler: 'CacheFirst',
              options: { cacheName: 'sn-ort', expiration: { maxEntries: 4 } },
            },
          ],
        },
      }),
    ],
    worker: { format: 'es' },
    build: {
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: 1500,
    },
  };
});
