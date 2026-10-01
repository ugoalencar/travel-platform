# Travel Lite — Controle de acesso, carteira e dashboard

Migration `004_access_control_dashboard.sql`. Código central:
`services/api-lite/src/access.ts`.

## Modelo

| Tabela | Escopo | Conteúdo |
|---|---|---|
| `roles` | global (migration) | Perfis com `rank` e `grants_all` (MASTER = todas as permissões) |
| `permissions` | global (migration) | Catálogo; `master_only` = só MASTER concede |
| `role_permissions` | global (migration) | Permissões padrão de cada perfil |
| `user_permissions` | por tenant (RLS) | Exceções por usuário: `GRANT` ou `REVOKE` |
| `dashboard_settings` | por tenant (RLS) | Ordem e widgets habilitados (só a configuração) |

- **Permissões efetivas:** para um perfil `grants_all`, todo o catálogo. Nos demais, valem as permissões padrão do perfil, menos as revogadas (`REVOKE`), mais as concedidas (`GRANT`).
- **Onde são calculadas:** uma vez por requisição, na autenticação, junto com o vendedor vinculado ao login (`sellers.user_id`).
- **Nas rotas:** só se usa `requirePermission` e `scopeFor` (todos os dados ou só os próprios). Não há `role === …` no código.
- **`users.role`:** passou a ser FK para `roles`. O perfil antigo `OPERATOR` foi migrado para `SELLER`.
- **Um login, um vendedor:** um login representa no máximo um vendedor (`uq_sellers_tenant_user`).

## Perfis padrão

| Permissão | MASTER | ADMIN | MANAGER | SELLER | VIEWER |
|---|---|---|---|---|---|
| users.manage | ✓ | | | | |
| permissions.manage (só MASTER concede) | ✓ | | | | |
| dashboard.configure (só MASTER concede) | ✓ | | | | |
| customers.create | ✓ | ✓ | ✓ | ✓ | |
| customers.read_all / update_all | ✓ | ✓ | ✓ | | read_all |
| customers.read_own / update_own | ✓ | | | ✓ | |
| sales.create | ✓ | ✓ | ✓ | ✓ | |
| sales.read_all / update_all | ✓ | ✓ | ✓ | | read_all |
| sales.read_own / update_own | ✓ | | | ✓ | |
| sellers.read | ✓ | ✓ | ✓ | | ✓ |
| sellers.manage | ✓ | ✓ | ✓ | | |
| commissions.read_all | ✓ | ✓ | ✓ | | ✓ |
| commissions.read_own | ✓ | | | ✓ | |
| commissions.approve / pay | ✓ | ✓ | ✓ | | |
| finance.read | ✓ | ✓ | ✓ | | ✓ |
| finance.manage | ✓ | ✓ | ✓ | | |
| reports.sales_all / sellers_all / finance | ✓ | ✓ | ✓ | | ✓ |
| reports.sales_own | ✓ | | | ✓ | |
| settings.manage | ✓ | ✓ | ✓ | | |

O MASTER pode ajustar cada usuário em **Configurações › Usuários e permissões**. Exemplo: conceder `finance.manage` a uma vendedora para que ela registre recebimentos.

## Escopo dos dados

- **`*_own`:** o servidor filtra pelo vendedor vinculado ao login.
  - Um id de outro vendedor responde **404**, como se o registro não existisse.
  - Pedir o filtro `seller_id` de outro vendedor responde **403**.
  - Um login com perfil SELLER sem vendedor vinculado fica *fail-closed*: listas vêm vazias, e cadastrar cliente ou ver relatórios responde 403.
- **Carteira do cliente:** `customers.responsible_seller_id` (FK composta, segura entre agências).
  - Quando um usuário com vendedor vinculado cadastra um cliente, o responsável é ele mesmo.
  - Escolher ou reatribuir o responsável exige `customers.update_all`. A reatribuição gera o evento de auditoria `CUSTOMER_REASSIGNED` (de/para).
  - Clientes criados antes da 004 ficam sem responsável e só aparecem para quem tem `read_all`, até um MASTER atribuí-los.
- **Venda:** `sales.seller_id` continua independente do responsável pelo cliente.
  - Quem tem só `*_own` vende apenas como o próprio vendedor e apenas para clientes que consegue ver.
  - Cancelar uma venda exige `sales.update_all`.
- **Financeiro:**
  - Listas e saldos exigem `finance.read`.
  - Recebimentos, despesas, pagamentos e estornos exigem `finance.manage`.
  - Pagar uma comissão exige também `commissions.pay`.
- **Relatórios:**
  - `reports.sales_all` ou `reports.sales_own` dão acesso a vendas e indicadores (os próprios, no caso de `_own`).
  - `reports.sellers_all` dá acesso ao comparativo de vendedores.
  - `reports.finance` dá acesso ao fluxo de caixa.
- **Gráficos:** vêm de `/reports/sellers` (`charts.by_month`, `charts.by_category`). São agrupados a partir das mesmas linhas por venda que geram os totais, então a soma de cada série é igual ao total da tabela (há teste para isso).

## Regras anti-escalada (servidor)

- Ninguém altera o próprio perfil, o próprio status ou as próprias permissões, nem o MASTER.
- Um usuário só gerencia usuários com `rank` menor ou igual ao seu, e só atribui perfis com `rank` menor ou igual ao seu. Na prática:
  - só um MASTER cria ou edita um MASTER;
  - o último MASTER nunca pode ser rebaixado.
- Exceções de permissão exigem `permissions.manage`.
  - Permissões `master_only` só podem ser alteradas por um MASTER.
  - Ninguém concede uma permissão que não tem.
- Eventos de auditoria: `USER_CREATED`, `USER_UPDATED`, `USER_ROLE_CHANGED`, `USER_STATUS_CHANGED`, `USER_PERMISSIONS_CHANGED`, `USER_SELLER_LINKED`, `CUSTOMER_REASSIGNED`, `DASHBOARD_CONFIGURED`.
- Desativar um usuário ou trocar o perfil vale a partir da próxima requisição, porque as permissões são recalculadas a cada requisição.

## Dashboard

- **Widgets (definidos no código):** `sales_month`, `sales_amount`, `received`, `receivable`, `expenses`, `payable`, `result`, `pending_commissions`, `sales_by_category_chart`, `sales_evolution_chart`, `seller_ranking`, `cash_flow`.
- **Configuração:**
  - `GET` e `PUT /dashboard/settings` exigem `dashboard.configure`.
  - O `PUT` precisa listar todos os widgets, exatamente uma vez cada; só ordem e habilitação mudam, e nenhuma definição pode ser apagada.
- **Escopo:**
  - `GET /dashboard` calcula cada widget dentro do escopo de quem vê.
  - A vendedora vê os mesmos widgets com os próprios números.
  - Widgets financeiros (`expenses`, `payable`, `result`, `cash_flow`) só aparecem para quem tem `finance.read`.
- **Saldos por conta:** saíram do dashboard e estão em `GET /financial-accounts` (campo `balance` = saldo inicial + livro-caixa).

## Seed Gadotti

- Patricia é MASTER, mas a promoção só acontece enquanto a agência não tiver nenhum MASTER. Assim o seed nunca desfaz uma troca de perfil feita depois.
- As demais pessoas são SELLER.
- O seed não altera senha, perfil nem status de usuários existentes.
- Os vendedores são vinculados aos logins.
