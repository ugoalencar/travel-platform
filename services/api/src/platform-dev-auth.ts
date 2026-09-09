import type { PlatformAuthProvider, PlatformAuthenticatedPrincipal } from './platform-auth';
import type { PlatformUserRole } from '../../../packages/domain/types';

export class PlatformDevAuthProvider implements PlatformAuthProvider {
  authenticate(request: {
    headers: Record<string, string | string[] | undefined>;
  }): Promise<PlatformAuthenticatedPrincipal | null> {
    const platformUserId = request.headers['x-dev-platform-user-id'];
    const role = request.headers['x-dev-platform-user-role'];

    if (typeof platformUserId === 'string' && typeof role === 'string') {
      const result: PlatformAuthenticatedPrincipal = {
        platformUserId,
        role: role as PlatformUserRole,
        email: 'dev-platform-admin@example.com',
      };
      return Promise.resolve(result);
    }

    return Promise.resolve(null);
  }
}
