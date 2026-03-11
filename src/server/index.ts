import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createNodeWebSocket } from '@hono/node-ws';
import { serveStatic } from '@hono/node-server/serve-static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { ticketRoutes } from './routes/tickets.js';
import { addClient, removeClient, broadcastEvent } from './ws.js';
import { setBroadcast } from '../core/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createServer(db: Database.Database, getProjectId: () => string) {
  const app = new Hono();
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app: app as any });

  // Wire up store broadcasts to WebSocket
  setBroadcast(broadcastEvent);

  // WebSocket endpoint
  app.get('/ws', upgradeWebSocket(() => ({
    onOpen(_event: any, ws: any) {
      addClient(ws);
    },
    onClose(_event: any, ws: any) {
      removeClient(ws);
    },
  })));

  // API routes
  app.route('/api/tickets', ticketRoutes(db, getProjectId, broadcastEvent));

  // Health check
  app.get('/api/health', (c) => c.json({ ok: true }));

  // Serve built React frontend
  const webDir = path.join(__dirname, 'web');
  app.use('/*', serveStatic({ root: webDir }));

  // SPA fallback
  app.get('*', serveStatic({ root: webDir, path: '/index.html' }));

  return { app, injectWebSocket };
}

export function startServer(
  db: Database.Database,
  getProjectId: () => string,
  port: number = 4242,
) {
  const { app, injectWebSocket } = createServer(db, getProjectId);

  const server = serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Rogue server running at http://localhost:${info.port}`);
  });

  injectWebSocket(server);
  return server;
}
