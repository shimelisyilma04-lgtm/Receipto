import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import { router, healthHandler } from './server/routes.js';
import { initDatabase } from './server/db.js';
import { startReminderWorker } from './server/worker.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middlewares
  app.use(express.json({
    limit: '2mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Production security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });

  // Root health check endpoint (GET /health)
  app.get('/health', healthHandler);

  // Mount API routes under /api
  app.use('/api', router);

  // Initialize database
  try {
    const dbStatus = await initDatabase();
    console.log(`[Receipto] Database initialized successfully (Engine: ${dbStatus.engine}).`);
  } catch (err: any) {
    console.error('[Receipto] Critical database initialization error:', err.message);
  }

  // Start background reminder worker
  try {
    startReminderWorker();
  } catch (err: any) {
    console.error('[Receipto] Failed to initialize background worker:', err.message);
  }

  // Serve static public assets directly (logos, favicons)
  app.use(express.static(path.join(process.cwd(), 'public')));

  // Vite middleware for development or static serving for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Receipto] Production SaaS server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Receipto] Failed to start server:', err);
  process.exit(1);
});
