import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FinancialSettingsPage } from './FinancialSettingsPage';

vi.mock('./PaymentConditionsPage', () => ({ PaymentConditionsPage: () => <p>Editor de condições</p> }));
vi.mock('./CommissionReleasePage', () => ({ CommissionReleasePage: ({ section }: { section: string }) => <p>Política: {section}</p> }));
vi.mock('./AgencyRevenuePage', () => ({ AgencyRevenuePage: () => <p>Editor de receita e lotes</p> }));
vi.mock('./CommissionRulesPage', () => ({ CommissionRulesPage: () => <p>Editor de comissões</p> }));
vi.mock('./SaleCategoriesPage', () => ({ SaleCategoriesPage: () => <p>Editor de categorias</p> }));
vi.mock('./CommissionPaymentPolicyTab', () => ({ CommissionPaymentPolicyTab: () => <p>Política de pagamento das comissões</p> }));
afterEach(cleanup);

describe('FinancialSettingsPage', () => {
  it('reuses the seven editors, showing only the selected tab', () => {
    render(<MemoryRouter><FinancialSettingsPage /></MemoryRouter>);
    expect(screen.getAllByRole('tab')).toHaveLength(7);
    expect(screen.getByText('Editor de condições')).toBeTruthy();
    for (const [label, content] of [
      ['Formas de pagamento', 'Política: methods'],
      ['Receita da agência e lotes', 'Editor de receita e lotes'],
      ['Regras de comissão', 'Editor de comissões'],
      ['Pagamento das comissões', 'Política de pagamento das comissões'],
      ['Liberação e perfil financeiro', 'Política: profile'],
      ['Categorias de venda', 'Editor de categorias'],
    ] as const) {
      fireEvent.click(screen.getByRole('tab', { name: label }));
      expect(screen.getByText(content)).toBeTruthy();
      expect(screen.queryByText('Editor de condições')).toBeNull();
      expect(screen.getByRole('tab', { name: label }).getAttribute('aria-selected')).toBe('true');
    }
  });
  it('supports a deep link and safely defaults an unknown tab', () => {
    const view = render(<MemoryRouter initialEntries={['/financial/settings?tab=revenue']}><FinancialSettingsPage /></MemoryRouter>);
    expect(screen.getByText('Editor de receita e lotes')).toBeTruthy();
    view.unmount();
    render(<MemoryRouter initialEntries={['/financial/settings?tab=unknown']}><FinancialSettingsPage /></MemoryRouter>);
    expect(screen.getByText('Editor de condições')).toBeTruthy();
  });
});
