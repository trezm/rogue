import { getDb, resolveProject } from '../../core/store.js';
import { startServer } from '../../server/index.js';

interface ServeOptions {
  port?: string;
  project?: string;
}

export async function serveCommand(options: ServeOptions): Promise<void> {
  const db = getDb();
  const project = await resolveProject(db, options.project);
  const port = options.port ? parseInt(options.port, 10) : 4242;

  startServer(db, () => project.id, port);
}
