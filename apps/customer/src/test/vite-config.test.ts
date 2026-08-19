// @vitest-environment node
import { describe, expect, it } from 'vitest';
import viteConfig from '../../vite.config';
import type { UserConfig } from 'vite';

type ConfigFactory = (env: {
  command: 'build' | 'serve';
  mode: string;
}) => UserConfig | Promise<UserConfig>;

describe('vite.config dev-auth proxy wiring', () => {
  it('does not configure a server proxy in build mode', async () => {
    const config = await (viteConfig as ConfigFactory)({
      command: 'build',
      mode: 'production',
    });

    expect(config.server?.proxy).toBeUndefined();
  });

  it('configures the dev-auth header-injecting proxy in serve mode', async () => {
    const config = await (viteConfig as ConfigFactory)({
      command: 'serve',
      mode: 'development',
    });

    expect(config.server?.proxy).toBeDefined();
    expect(config.server?.proxy?.['/api']).toBeDefined();
  });
});
