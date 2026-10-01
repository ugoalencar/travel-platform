import { buildApp } from './app';
import { loadConfig } from './config';
import { createDatabase } from './database';

const config = loadConfig();

async function main(): Promise<void> {
  const database = createDatabase(config.databaseUrl);
  const app = await buildApp({
    logger: config.nodeEnv !== 'test',
    database,
    staticDir: config.frontendDistDir,
  });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal}, shutting down`);
    await app.close();
    await database.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.host, port: config.port });
  app.log.info(`Travel Lite API listening on http://${config.host}:${config.port}`);
}

main().catch((error: unknown) => {
  console.error('Failed to start Travel Lite API:', error);
  process.exit(1);
});
