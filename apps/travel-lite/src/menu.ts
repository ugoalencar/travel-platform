/**
 * Menu entries and the permissions that make each one useful. An entry is
 * shown (and its route reachable) when the user holds any of them; an empty
 * list means every authenticated user. The API remains the authority.
 */
export interface MenuItem {
  to: string;
  label: string;
  anyOf: string[];
}

export const MENU: MenuItem[] = [
  { to: '/', label: 'Dashboard', anyOf: [] },
  { to: '/vendas', label: 'Vendas', anyOf: ['sales.read_all', 'sales.read_own'] },
  { to: '/financeiro', label: 'Financeiro', anyOf: ['finance.read'] },
  { to: '/importacoes', label: 'Importações', anyOf: ['imports.manage'] },
  { to: '/clientes', label: 'Clientes', anyOf: ['customers.read_all', 'customers.read_own'] },
  { to: '/vendedores', label: 'Vendedores', anyOf: ['sellers.read'] },
  { to: '/comissoes', label: 'Comissões', anyOf: ['commissions.read_all', 'commissions.read_own'] },
  {
    to: '/relatorios',
    label: 'Relatórios',
    anyOf: ['reports.sales_all', 'reports.sales_own', 'reports.sellers_all', 'reports.finance'],
  },
  { to: '/cadastros', label: 'Cadastros', anyOf: ['settings.manage'] },
  { to: '/configuracoes', label: 'Configurações', anyOf: ['users.manage', 'permissions.manage'] },
];

export function menuPermissions(path: string): string[] {
  return MENU.find((item) => item.to === path)?.anyOf ?? [];
}
