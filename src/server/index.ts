import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createNodeWebSocket } from '@hono/node-ws';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { ticketRoutes } from './routes/tickets.js';
import { addClient, removeClient, broadcastEvent } from './ws.js';
import { setBroadcast, getAllProjects } from '../core/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.join(__dirname, '..', 'web');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export function createServer(db: Database.Database, getProjectId: () => string, setProjectId?: (id: string) => void) {
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

  // Projects API
  app.get('/api/projects', (c) => {
    const projects = getAllProjects(db);
    return c.json(projects);
  });

  app.get('/api/project', (c) => {
    return c.json({ id: getProjectId() });
  });

  app.post('/api/project', async (c) => {
    const body = await c.req.json();
    const { id } = body;
    if (!id) return c.json({ error: 'Missing project id' }, 400);
    const projects = getAllProjects(db);
    if (!projects.find((p: any) => p.id === id)) return c.json({ error: 'Project not found' }, 404);
    if (setProjectId) setProjectId(id);
    broadcastEvent({ type: 'project-changed', data: { id } });
    return c.json({ id });
  });

  // Health check
  app.get('/api/health', (c) => c.json({ ok: true }));

  // Serve built React frontend
  app.get('/*', (c) => {
    let reqPath = c.req.path;
    let filePath = path.join(webDir, reqPath);

    // If no file found, serve index.html (SPA fallback)
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(webDir, 'index.html');
    }

    if (!fs.existsSync(filePath)) {
      return c.text('Not Found', 404);
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const body = fs.readFileSync(filePath);
    return new Response(body, { headers: { 'Content-Type': contentType } });
  });

  return { app, injectWebSocket };
}

export function startServer(
  db: Database.Database,
  getProjectId: () => string,
  setProjectId?: (id: string) => void,
  port: number = 4242,
) {
  const { app, injectWebSocket } = createServer(db, getProjectId, setProjectId);

  const server = serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Rogue server running at http://localhost:${info.port}`);
    console.log(`Serving web UI from ${webDir}`);
  });

  injectWebSocket(server);
  return server;
}
