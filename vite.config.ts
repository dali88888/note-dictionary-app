import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Dev-only middleware: mounts our Vercel Edge Function (api/translate.ts) at
 * /api/translate during `vite dev`, so we don't need `vercel dev` to test the
 * full flow locally. In production on Vercel, this plugin is irrelevant —
 * Vercel serves the Edge Function directly.
 */
function apiEdgeDevPlugin(): Plugin {
  return {
    name: 'api-edge-dev',
    apply: 'serve',
    configureServer(server) {
      // Load .env.local into process.env before importing the handler
      const envPath = path.join(server.config.root, '.env.local');
      if (fs.existsSync(envPath)) {
        fs.readFileSync(envPath, 'utf8')
          .split(/\r?\n/)
          .filter((l) => l && !l.startsWith('#'))
          .forEach((line) => {
            const eq = line.indexOf('=');
            if (eq > 0) {
              const k = line.slice(0, eq).trim();
              const v = line.slice(eq + 1).trim();
              if (!process.env[k]) process.env[k] = v;
            }
          });
      }

      server.middlewares.use('/api/translate', async (req, res) => {
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const bodyBuf = Buffer.concat(chunks);

          const webReq = new Request('http://localhost/api/translate', {
            method: req.method ?? 'POST',
            headers: req.headers as Record<string, string>,
            body: bodyBuf.length ? bodyBuf : undefined,
          });

          const mod = await server.ssrLoadModule('/api/translate.ts');
          const handler = mod.default as (r: Request) => Promise<Response>;
          const webRes = await handler(webReq);

          res.statusCode = webRes.status;
          webRes.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await webRes.arrayBuffer()));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: `Dev middleware failed: ${msg}` }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), apiEdgeDevPlugin()],
});
