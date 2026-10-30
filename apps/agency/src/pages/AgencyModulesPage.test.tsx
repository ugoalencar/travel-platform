import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AgencyModulesProvider } from '../modules/AgencyModulesContext';
import { AgencyModuleRouteBoundary } from '../modules/AgencyModulesContext';
import { AgencyModulesPage } from './AgencyModulesPage';

const { get, patch } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('../lib/api', () => ({ api: { get, patch } }));
vi.mock('../hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ user: { role: 'ADMIN' }, loading: false }) }));

const modules = [
  { key: 'CORE', label: 'Essencial', description: 'Core', essential: true, dependencies: [], apiPrefixes: [], uiPrefixes: [], enabled: true, entitled: true, available: true },
  { key: 'CAMPAIGNS', label: 'Campanhas e cupons', description: 'Campanhas', essential: false, dependencies: ['CORE'], apiPrefixes: ['/campaigns'], uiPrefixes: ['/campaigns'], enabled: true, entitled: true, available: true },
  { key: 'SOCIAL_PUBLISHING', label: 'Publicação social', description: 'Publicação', essential: false, dependencies: ['CAMPAIGNS'], apiPrefixes: ['/publications'], uiPrefixes: ['/publications'], enabled: true, entitled: true, available: true },
];

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('AgencyModulesPage', () => {
  it('explains dependencies and blocks disabling a prerequisite in use', async () => {
    get.mockResolvedValue({ data: { modules } });
    render(<MemoryRouter><AgencyModulesProvider><AgencyModulesPage /></AgencyModulesProvider></MemoryRouter>);

    expect(await screen.findByText(/Desative primeiro: Publicação social/i)).toBeTruthy();
    expect(screen.getByRole('switch', { name: /Campanhas e cupons/i }).hasAttribute('disabled')).toBe(true);
  });

  it('persists optional module changes and reloads effective state', async () => {
    get.mockResolvedValueOnce({ data: { modules: modules.slice(0, 2) } });
    get.mockResolvedValueOnce({ data: { modules: [modules[0], { ...modules[1], enabled: false, available: false }] } });
    patch.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<MemoryRouter><AgencyModulesProvider><AgencyModulesPage /></AgencyModulesProvider></MemoryRouter>);

    const toggle = await screen.findByRole('switch', { name: /Campanhas e cupons/i });
    expect(toggle.hasAttribute('disabled')).toBe(false);
    await user.click(toggle);
    expect(patch).toHaveBeenCalledWith('/settings/modules/CAMPAIGNS', { enabled: false });
  });
});

describe('AgencyModuleRouteBoundary', () => {
  it('blocks a disabled deep link and preserves an admin link back to module settings', async () => {
    get.mockResolvedValue({ data: { modules: [modules[0], { ...modules[1], enabled: false, available: false }] } });
    render(
      <MemoryRouter initialEntries={['/campaigns']}>
        <AgencyModulesProvider><AgencyModuleRouteBoundary><p>Campanhas protegidas</p></AgencyModuleRouteBoundary></AgencyModulesProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Campanhas e cupons indisponível/i)).toBeTruthy();
    expect(screen.queryByText('Campanhas protegidas')).toBeNull();
    expect(screen.getByRole('link', { name: /Ver módulos da agência/i })).toBeTruthy();
  });
});
