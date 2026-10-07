import { defineConfig, loadEnv } from 'vite';
import { handleR2Presign } from './api/r2-presign.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  return {
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    server: {
      port: 5173,
      host: true
    },
    preview: {
      port: 4173,
      host: true
    },
    plugins: [
      {
        name: 'r2-presign-api',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url && (req.url.startsWith('/api/r2-presign') || req.url.startsWith('/api/presign'))) {
              return handleR2Presign(req, res);
            }
            next();
          });
        },
        configurePreviewServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url && (req.url.startsWith('/api/r2-presign') || req.url.startsWith('/api/presign'))) {
              return handleR2Presign(req, res);
            }
            next();
          });
        }
      }
    ]
  };
});
