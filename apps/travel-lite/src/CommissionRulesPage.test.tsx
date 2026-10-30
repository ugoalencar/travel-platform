import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildVersionPayload, describeVersion, emptyVersionForm } from './commissionRules';

const apiMock = vi.fn<(path: string, options?: { method?: string; body?: unknown }) => Promise<unknown>>();
let canManage = true;

vi.mock('./api', () => ({ api: (path: string, options?: { method?: string; body?: unknown }) => apiMock(path, options) }));
vi.mock('./auth', () => ({ useCan: () => canManage }));

import { CommissionRulesPage } from './pages/CommissionRulesPage';

const sellers = { items: [{ id: 's1', name: 'Ana Vendedora' }] };
const categories = { items: [{ id: 'c1', name: 'Pacotes' }] };
const rule = {
  id: 'r1',
  seller_id: 's1',
  category_id: null,
  name: 'Regra da Ana',
  status: 'ACTIVE',
  version_number: 2,
  effective_from: '2026-11-01',
  mode: 'PERCENTAGE',
  calculation_base: 'GROSS',
  value: 10,
  apply_on: 'EXCESS',
  excess_threshold: 500,
};

function routeApi(rules: unknown[] = [rule]) {
  apiMock.mockImplementation((path: string, options?: { method?: string }) => {
    if (path === '/commission-rules' && !options?.method) return Promise.resolve({ items: rules });
    if (path.startsWith('/sellers')) return Promise.resolve(sellers);
    if (path === '/categories') return Promise.resolve(categories);
    if (path === '/commission-rules/r1' && !options?.method) {
      return Promise.resolve({
        versions: [
          { version_number: 2, effective_from: '2026-11-01', mode: 'PERCENTAGE', calculation_base: 'GROSS', value: 10, apply_on: 'EXCESS', excess_threshold: 500, reason: 'novo patamar' },
          { version_number: 1, effective_from: '2026-10-01', mode: 'PERCENTAGE', calculation_base: 'GROSS', value: 8, apply_on: 'TOTAL', excess_threshold: null, reason: null },
        ],
      });
    }
    return Promise.resolve({ ok: true });
  });
}

beforeEach(() => {
  apiMock.mockReset();
  canManage = true;
  routeApi();
});
afterEach(() => vi.restoreAllMocks());

describe('commission rule helpers', () => {
  it('describes versions in plain language', () => {
    expect(describeVersion({ mode: 'PERCENTAGE', calculation_base: 'MARGIN', value: 3.5, apply_on: 'TOTAL', excess_threshold: null })).toBe('3,5% da margem');
    expect(describeVersion({ mode: 'PERCENTAGE', calculation_base: 'GROSS', value: 10, apply_on: 'EXCESS', excess_threshold: 500 })).toMatch(/^10% da venda bruta acima de R\$\s500,00$/);
    expect(describeVersion({ mode: 'FIXED', calculation_base: null, value: 75, apply_on: 'TOTAL', excess_threshold: null })).toMatch(/fixos por venda/);
    expect(describeVersion({ mode: 'NONE', calculation_base: null, value: null, apply_on: 'TOTAL', excess_threshold: null })).toMatch(/Sem regra/);
  });

  it('builds API payloads that match the server contract and rejects bad input', () => {
    const base = { ...emptyVersionForm('2026-11-01'), value: '12,5', reason: 'ajuste' };
    expect(buildVersionPayload(base, true)).toEqual({
      mode: 'PERCENTAGE', effective_from: '2026-11-01', reason: 'ajuste', value: 12.5, calculation_base: 'GROSS',
    });
    expect(buildVersionPayload({ ...base, base: 'MARGIN', applyOn: 'EXCESS', threshold: '500' }, true)).toMatchObject({
      calculation_base: 'MARGIN', apply_on: 'EXCESS', excess_threshold: 500,
    });
    expect(buildVersionPayload({ ...base, mode: 'FIXED', value: '80' }, true)).toEqual({
      mode: 'FIXED', effective_from: '2026-11-01', reason: 'ajuste', value: 80,
    });
    expect(buildVersionPayload({ ...base, mode: 'NONE' }, true)).toEqual({
      mode: 'NONE', effective_from: '2026-11-01', reason: 'ajuste',
    });
    expect(() => buildVersionPayload({ ...base, value: '150' }, true)).toThrow(/100/);
    expect(() => buildVersionPayload({ ...base, value: '' }, true)).toThrow(/percentual/);
    expect(() => buildVersionPayload({ ...base, reason: 'a' }, true)).toThrow(/motivo/);
    expect(() => buildVersionPayload({ ...base, applyOn: 'EXCESS', threshold: '' }, true)).toThrow(/limite/);
    expect(() => buildVersionPayload({ ...base, effectiveFrom: '' }, true)).toThrow(/vigência/);
  });
});

describe('CommissionRulesPage', () => {
  it('lists rules with scope, latest version summary and status', async () => {
    render(<MemoryRouter><CommissionRulesPage /></MemoryRouter>);
    const row = (await screen.findByText('Regra da Ana')).closest('tr')!;
    expect(within(row).getByText('Ana Vendedora')).toBeInTheDocument();
    expect(within(row).getByText('Todas as categorias')).toBeInTheDocument();
    expect(within(row).getByText(/10% da venda bruta acima de/)).toBeInTheDocument();
    expect(within(row).getByText('v2 desde 2026-11-01')).toBeInTheDocument();
  });

  it('creates a rule with seller, category and the parsed version', async () => {
    render(<MemoryRouter><CommissionRulesPage /></MemoryRouter>);
    await screen.findByText('Regra da Ana');
    fireEvent.click(screen.getByRole('button', { name: 'Nova regra' }));
    const form = screen.getByRole('form', { name: 'Nova regra' });
    fireEvent.change(within(form).getByLabelText('Nome *'), { target: { value: 'Padrão' } });
    fireEvent.change(within(form).getByLabelText('Categoria'), { target: { value: 'c1' } });
    fireEvent.change(within(form).getByLabelText('Percentual (%) *'), { target: { value: '7' } });
    fireEvent.change(within(form).getByLabelText('Vigência a partir de *'), { target: { value: '2026-12-01' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Criar regra' }));

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith('/commission-rules', {
        method: 'POST',
        body: { name: 'Padrão', category_id: 'c1', mode: 'PERCENTAGE', effective_from: '2026-12-01', value: 7, calculation_base: 'GROSS' },
      }),
    );
    expect(await screen.findByText('Regra criada.')).toBeInTheDocument();
  });

  it('shows the server error without closing the form', async () => {
    apiMock.mockImplementation((path: string, options?: { method?: string }) => {
      if (options?.method === 'POST') return Promise.reject(new Error('An active rule already exists'));
      if (path === '/commission-rules') return Promise.resolve({ items: [] });
      return Promise.resolve(path === '/categories' ? categories : sellers);
    });
    render(<MemoryRouter><CommissionRulesPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Nova regra' }));
    const form = screen.getByRole('form', { name: 'Nova regra' });
    fireEvent.change(within(form).getByLabelText('Nome *'), { target: { value: 'Duplicada' } });
    fireEvent.change(within(form).getByLabelText('Percentual (%) *'), { target: { value: '5' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Criar regra' }));
    expect(await screen.findByText('An active rule already exists')).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Nova regra' })).toBeInTheDocument();
  });

  it('requires a reason and posts a new version, then refreshes', async () => {
    render(<MemoryRouter><CommissionRulesPage /></MemoryRouter>);
    await screen.findByText('Regra da Ana');
    fireEvent.click(screen.getByRole('button', { name: 'Nova versão' }));
    const form = screen.getByRole('form', { name: 'Nova versão' });
    fireEvent.change(within(form).getByLabelText('Percentual (%) *'), { target: { value: '12' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Registrar versão' }));
    expect(await screen.findByText(/Informe o motivo da revisão/)).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalledWith('/commission-rules/r1/versions', expect.anything());

    fireEvent.change(within(form).getByLabelText('Motivo da revisão *'), { target: { value: 'meta nova' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Registrar versão' }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith('/commission-rules/r1/versions', {
        method: 'POST',
        body: expect.objectContaining({ mode: 'PERCENTAGE', value: 12, reason: 'meta nova', calculation_base: 'GROSS' }) as unknown,
      }),
    );
    expect(await screen.findByText(/Nova versão registrada/)).toBeInTheDocument();
  });

  it('archives only after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<MemoryRouter><CommissionRulesPage /></MemoryRouter>);
    await screen.findByText('Regra da Ana');
    fireEvent.click(screen.getByRole('button', { name: 'Arquivar' }));
    expect(apiMock).not.toHaveBeenCalledWith('/commission-rules/r1/archive', expect.anything());
    fireEvent.click(screen.getByRole('button', { name: 'Arquivar' }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/commission-rules/r1/archive', { method: 'POST', body: {} }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Regra arquivada.')).toBeInTheDocument();
  });

  it('shows the version history', async () => {
    render(<MemoryRouter><CommissionRulesPage /></MemoryRouter>);
    await screen.findByText('Regra da Ana');
    fireEvent.click(screen.getByRole('button', { name: 'Histórico' }));
    const history = await screen.findByRole('region', { name: 'Histórico de versões' });
    expect(within(history).getByText(/v1 · desde 2026-10-01 · 8% da venda bruta/)).toBeInTheDocument();
    expect(within(history).getByText(/novo patamar/)).toBeInTheDocument();
  });

  it('is read-only without commissions.rules_manage', async () => {
    canManage = false;
    render(<MemoryRouter><CommissionRulesPage /></MemoryRouter>);
    await screen.findByText('Regra da Ana');
    expect(screen.queryByRole('button', { name: 'Nova regra' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nova versão' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arquivar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Histórico' })).toBeInTheDocument();
  });

  it('does not offer revision or archive for archived rules', async () => {
    routeApi([{ ...rule, status: 'ARCHIVED' }]);
    render(<MemoryRouter><CommissionRulesPage /></MemoryRouter>);
    await screen.findByText('Regra da Ana');
    expect(screen.queryByRole('button', { name: 'Nova versão' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arquivar' })).not.toBeInTheDocument();
  });
});

describe('progressive commission rules', () => {
  const progressiveRule = {
    ...rule,
    name: 'Metas do mês',
    seller_id: null,
    apply_on: 'TOTAL',
    excess_threshold: null,
    progressive: true,
    tiers: [
      { tier_number: 1, from_amount: 0, to_amount: 20000, rate: 3 },
      { tier_number: 2, from_amount: 20000, to_amount: null, rate: 4 },
    ],
  };

  it('describes the tiers and builds contiguous tiers for the API', () => {
    expect(describeVersion(progressiveRule as never)).toMatch(/^Progressiva mensal da venda bruta: 3% até R\$\s20\.000,00; 4% acima$/);
    const form = {
      ...emptyVersionForm('2026-11-01'),
      progressive: true,
      base: 'MARGIN' as const,
      tiers: [
        { upTo: '10000', rate: '3' },
        { upTo: '25000,50', rate: '4' },
        { upTo: '', rate: '5,5' },
      ],
    };
    expect(buildVersionPayload(form, false)).toEqual({
      mode: 'PERCENTAGE',
      effective_from: '2026-11-01',
      progressive: true,
      calculation_base: 'MARGIN',
      tiers: [
        { from_amount: 0, to_amount: 10000, rate: 3 },
        { from_amount: 10000, to_amount: 25000.5, rate: 4 },
        { from_amount: 25000.5, to_amount: null, rate: 5.5 },
      ],
    });
    expect(() => buildVersionPayload({ ...form, tiers: [{ upTo: '', rate: '3' }] }, false)).toThrow(/2 faixas/);
    expect(() => buildVersionPayload({ ...form, tiers: [{ upTo: '1000', rate: '3' }, { upTo: '900', rate: '4' }, { upTo: '', rate: '5' }] }, false)).toThrow(/faixa 2/);
    expect(() => buildVersionPayload({ ...form, tiers: [{ upTo: '', rate: '3' }, { upTo: '', rate: '4' }] }, false)).toThrow(/limite da faixa 1/);
    expect(() => buildVersionPayload({ ...form, tiers: [{ upTo: '1000', rate: '300' }, { upTo: '', rate: '4' }] }, false)).toThrow(/100/);
  });

  it('shows a progressive rule summary in the list', async () => {
    routeApi([progressiveRule]);
    render(<MemoryRouter><CommissionRulesPage /></MemoryRouter>);
    expect(await screen.findByText(/Progressiva mensal da venda bruta: 3% até/)).toBeInTheDocument();
  });

  it('creates a progressive rule from the tier editor', async () => {
    render(<MemoryRouter><CommissionRulesPage /></MemoryRouter>);
    await screen.findByText('Regra da Ana');
    fireEvent.click(screen.getByRole('button', { name: 'Nova regra' }));
    const form = screen.getByRole('form', { name: 'Nova regra' });
    fireEvent.change(within(form).getByLabelText('Nome *'), { target: { value: 'Metas' } });
    fireEvent.click(within(form).getByLabelText(/Comissão progressiva por meta mensal/));
    expect(within(form).queryByLabelText('Percentual (%) *')).not.toBeInTheDocument();

    fireEvent.change(within(form).getByLabelText('Até (R$) da faixa 1'), { target: { value: '20000' } });
    fireEvent.change(within(form).getByLabelText('Percentual (%) da faixa 1'), { target: { value: '3' } });
    fireEvent.change(within(form).getByLabelText('Percentual (%) da faixa 2'), { target: { value: '4' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Adicionar faixa' }));
    fireEvent.change(within(form).getByLabelText('Até (R$) da faixa 2'), { target: { value: '50000' } });
    fireEvent.change(within(form).getByLabelText('Percentual (%) da faixa 3'), { target: { value: '5' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Criar regra' }));

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith('/commission-rules', {
        method: 'POST',
        body: expect.objectContaining({
          name: 'Metas',
          progressive: true,
          calculation_base: 'GROSS',
          tiers: [
            { from_amount: 0, to_amount: 20000, rate: 3 },
            { from_amount: 20000, to_amount: 50000, rate: 4 },
            { from_amount: 50000, to_amount: null, rate: 5 },
          ],
        }) as unknown,
      }),
    );
  });

  it('keeps at least two tiers and removes a middle tier', () => {
    render(<MemoryRouter><CommissionRulesPage /></MemoryRouter>);
    return screen.findByText('Regra da Ana').then(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Nova regra' }));
      const form = screen.getByRole('form', { name: 'Nova regra' });
      fireEvent.click(within(form).getByLabelText(/Comissão progressiva por meta mensal/));
      expect(within(form).queryByRole('button', { name: /Remover faixa/ })).not.toBeInTheDocument();
      fireEvent.click(within(form).getByRole('button', { name: 'Adicionar faixa' }));
      fireEvent.click(within(form).getByRole('button', { name: 'Remover faixa 2' }));
      expect(within(form).queryByLabelText('Percentual (%) da faixa 3')).not.toBeInTheDocument();
    });
  });
});
