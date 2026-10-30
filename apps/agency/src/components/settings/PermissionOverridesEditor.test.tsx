import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PermissionOverridesEditor } from './PermissionOverridesEditor';
import * as apiModule from '../../lib/api';

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof apiModule>('../../lib/api');
  return { ...actual, api: { get: vi.fn(), put: vi.fn() } };
});

const get = vi.mocked(apiModule.api.get);
const put = vi.mocked(apiModule.api.put);

const catalog = [
  { resource: 'financial', action: 'receivables.read', minRole: 'MANAGER', delegable: true, grantableToRoles: ['AGENT'], mutation: false, enforced: true },
  { resource: 'customers', action: 'fields_manage', minRole: 'ADMIN', delegable: false, grantableToRoles: [], mutation: true, enforced: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation((path: string) =>
    Promise.resolve({
      data: path.endsWith('permission-catalog') ? { catalog } : { overrides: [] },
    }),
  );
  put.mockResolvedValue({ data: { overrides: [] } });
});

describe('PermissionOverridesEditor', () => {
  it('offers "Conceder" only for delegable keys of an AGENT', async () => {
    render(<PermissionOverridesEditor memberId="u1" memberRole="AGENT" />);
    const delegable = await screen.findByLabelText('financial: receivables.read');
    expect(Array.from((delegable as HTMLSelectElement).options).map((o) => o.value)).toEqual([
      'DEFAULT',
      'GRANT',
      'REVOKE',
    ]);
    const fixed = screen.getByLabelText('customers: fields_manage');
    expect(Array.from((fixed as HTMLSelectElement).options).map((o) => o.value)).toEqual(['DEFAULT']);
  });

  it('never offers "Conceder" to MANAGER or VIEWER', async () => {
    render(<PermissionOverridesEditor memberId="u1" memberRole="MANAGER" />);
    const select = await screen.findByLabelText('financial: receivables.read');
    expect(Array.from((select as HTMLSelectElement).options).map((o) => o.value)).toEqual(['DEFAULT', 'REVOKE']);
  });

  it('requires a reason before saving a change', async () => {
    render(<PermissionOverridesEditor memberId="u1" memberRole="AGENT" />);
    fireEvent.change(await screen.findByLabelText('financial: receivables.read'), { target: { value: 'GRANT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar permissões' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o motivo');
    expect(put).not.toHaveBeenCalled();
  });

  it('sends the full override set with the reason and shows the saved state', async () => {
    put.mockResolvedValue({
      data: {
        overrides: [{ resource: 'financial', action: 'receivables.read', effect: 'GRANT', reason: 'Acompanhar', createdAt: '', createdByUserId: 'a' }],
      },
    });
    render(<PermissionOverridesEditor memberId="u1" memberRole="AGENT" />);
    fireEvent.change(await screen.findByLabelText('financial: receivables.read'), { target: { value: 'GRANT' } });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Acompanhar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar permissões' }));
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/settings/team/u1/permission-overrides', {
        overrides: [{ resource: 'financial', action: 'receivables.read', effect: 'GRANT', reason: 'Acompanhar' }],
      }),
    );
    expect(await screen.findByText('Permissões salvas.')).toBeInTheDocument();
  });

  it('shows the server error without losing the choices', async () => {
    put.mockRejectedValue(new apiModule.ApiError('Você não pode conceder uma permissão que não possui', 'FORBIDDEN', 403));
    render(<PermissionOverridesEditor memberId="u1" memberRole="AGENT" />);
    fireEvent.change(await screen.findByLabelText('financial: receivables.read'), { target: { value: 'GRANT' } });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar permissões' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('não pode conceder');
    expect(screen.getByLabelText('financial: receivables.read')).toHaveValue('GRANT');
  });
});
