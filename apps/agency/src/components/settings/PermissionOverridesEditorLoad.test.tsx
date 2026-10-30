import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PermissionOverridesEditor } from './PermissionOverridesEditor';
import * as apiModule from '../../lib/api';

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof apiModule>('../../lib/api');
  return { ...actual, api: { get: vi.fn(), put: vi.fn() } };
});

const get = vi.mocked(apiModule.api.get);
const put = vi.mocked(apiModule.api.put);

beforeEach(() => {
  vi.clearAllMocks();
  get.mockRejectedValue(new Error('offline'));
});

describe('PermissionOverridesEditor load failure', () => {
  it('does not offer saving when the initial load failed (an empty set would wipe real overrides)', async () => {
    render(<PermissionOverridesEditor memberId="u1" memberRole="AGENT" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar');
    const button = screen.getByRole('button', { name: 'Salvar permissões' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(put).not.toHaveBeenCalled();
  });
});
