import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';

export function createVercelHandler(
  getApp: () => Promise<FastifyInstance>
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request, response) => {
    const app = await getApp();
    await app.ready();
    app.routing(request, response);
  };
}
