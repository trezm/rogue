type WSClient = { send: (data: string) => void; close: () => void };

const clients = new Set<WSClient>();

export function addClient(ws: WSClient): void {
  clients.add(ws);
}

export function removeClient(ws: WSClient): void {
  clients.delete(ws);
}

export function broadcastEvent(event: Record<string, any>): void {
  const data = JSON.stringify(event);
  for (const ws of clients) {
    try {
      ws.send(data);
    } catch {
      clients.delete(ws);
    }
  }
}
