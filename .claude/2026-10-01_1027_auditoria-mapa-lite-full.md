# Auditoria somente leitura — Mapa Travel Lite → Travel Platform (Full)

- **Data/hora:** 2026-10-01 10:27
- **Escopo:** leitura da matriz `D:\travel-platform` (branch `main`, `2190f60`) e dos documentos do Lite (`feature/travel-lite`, `e19db89`).
- **Modo:** somente leitura. Nenhum arquivo do repositório foi alterado; a única escrita foi este relatório. Não houve migrations, deploy, leitura de `.env` real ou acesso a produção.
- **Lido:**
  - `AGENTS.md`, `docs/AI_CONTEXT.md`, `docs/PRODUCT-VISION-AND-SCOPE.md`;
  - `docs/01-architecture/technology-stack.md`, `docs/06-frontend/design-system.md`;
  - `docs/03-security/security-model.md`, `docs/03-security/authorization.md`;
  - `INTEGRATION-MAPPING.md` e `ACCESS-CONTROL.md` (Lite);
  - código ativo de `services/api/src` e `infrastructure/migrations`, por amostragem dirigida.

---

## 1. Estrutura relevante da matriz (Full)

| Camada | Estado real na `main` |
|---|---|
| Apps | `apps/agency` (back-office principal, cerca de 60 páginas: vendas, financeiro completo, DRE, conciliação, folha, comissões, importação), `apps/customer` (portal do cliente em `/customer-portal/*` + um 2º painel interno duplicado em `/`), `apps/platform-admin`, `apps/marketing` |
| API | `services/api` (Fastify, porta 4000), 47 módulos em `src/routes/`, autorização por **hierarquia fixa** `requireRole(UserRole.X)` (cerca de 370 usos) + **area grants** por módulo (`area-grants.ts`, migrations 064/065: 12 módulos de vendas e financeiro) |
| Banco | PostgreSQL (Supabase em produção), **98 migrations** imutáveis, `agency_id` TEXT, FKs compostas `(agency_id, id)`, RLS FORCE, perfis `travel_app_runtime` e `travel_app_platform` |
| Perfis | `OWNER/ADMIN/MANAGER/AGENT/VIEWER` (tenant) + `PLATFORM_OWNER/PLATFORM_ADMIN` (plataforma) |
| Acesso a dados | `pg` com SQL direto via `withTenantTransaction`. O Prisma aparece só em `platform-routes.ts`; o ADR-005 define o SQL como fonte de verdade |
| Autenticação | Sessões por provedor: `session-auth.ts`, `local-auth.ts`, `customer-*-auth.ts`, `platform-*-auth.ts`, `partner-auth.ts`; MFA e recuperação no admin da plataforma (098) |
| Comercial | `customers`, `wishes`, `offers`, `proposals`, `trips`, `sales` + `sale_items`, `commercial_opportunities` (com `responsible_user_id`), pipeline e cockpit |
| Pessoas e comissão | `employees` (`user_id` opcional, `default_commission_plan_id`), `commission_plans`, `employee_commission_rules`, `commission_entries`/`commissions`, `employee_deductions`, `payroll_entries`, `brokers`, `partner_commissions`; rotas `/commissions/mine` e `/commissions/generate` |
| Financeiro | `receivables`, `payables`, `payments`, `payment_allocations`, `cash_transactions`, `revenues`, `expenses`, `suppliers`, centros de custo, conciliação, DRE; relatórios de aging, fluxo de caixa, margem, previsto x realizado, exposição a fornecedor |
| Importação | `import_jobs`/`import_mapping_templates` (082) e `/api/import/*`: upload → parse → validate → confirm, para CUSTOMER/SUPPLIER/EMPLOYEE/TAG |
| Design system | `docs/06-frontend/design-system.md`: tokens CSS, Inter, Lucide. O `apps/agency` usa Tailwind v4 com componentes próprios em `components/ui` |

### Documentação da matriz defasada em relação ao código

| Documento | Diz | Realidade |
|---|---|---|
| `PRODUCT-VISION-AND-SCOPE.md` §21/§30 | Financeiro "DECISION REQUIRED, nenhuma tabela"; Sale "PR READY"; Commission "sem API"; Reports "nenhum dashboard" | Financeiro, vendas, comissões, DRE e relatórios estão implementados (migrations 040–090, rotas `financial`/`commissions`/`reports`) |
| `PRODUCT-VISION-AND-SCOPE.md` §2.3 | `apps/agency` é "placeholder" | É o app principal de back-office |
| `AI_CONTEXT.md` | "migrations 001..037", "31 módulos" | 98 migrations; 47 módulos de rota |
| `AGENTS.md` / `technology-stack.md` | "ORM: Prisma" | Na prática é SQL direto com `pg`; o Prisma é marginal (ADR-005) |
| `security-model.md` | JWT, Zod, cookies httpOnly | Sessões opacas por provedor; validação manual (o Zod não é padrão nas rotas) |
| `authorization.md` | Matriz só por perfil, com "Brokers" | Há também area grants por usuário; o RBAC real está espalhado em cerca de 370 `requireRole` |

---

## 2. Mapa Lite → Full por domínio

| Domínio | Travel Lite (`e19db89`) | Full (`main`) | Correspondência / observação |
|---|---|---|---|
| Tenant | `tenants` (UUID, `slug`), `tenant_id` | `agencies`, `agency_id` TEXT | 1 tenant = 1 agency. A chave muda de tipo (UUID → TEXT); a sincronização exige mapeamento `external_id`, já previsto no Lite (`integration_outbox`) |
| Usuários e perfis | `users`, perfis em tabela (MASTER/ADMIN/MANAGER/SELLER/VIEWER) + `permissions`/`role_permissions`/`user_permissions` | `users`, perfil fixo (OWNER/ADMIN/MANAGER/AGENT/VIEWER) + area grants | MASTER≈OWNER, SELLER≈AGENT. **Os modelos divergem**: o Lite usa permissões explícitas e exceções por usuário; o Full usa hierarquia mais 12 módulos de grant |
| Vendedor | `sellers` (`user_id` opcional, regra de comissão no próprio vendedor) | `employees` (`user_id` opcional) + `commission_plans` + `employee_commission_rules` + `brokers` | Vendedor do Lite → funcionário do Full; a regra do vendedor → regra ou plano do funcionário. O Full tem também a figura do broker |
| Cliente | `customers` + `responsible_seller_id` (carteira) | `customers` (sem responsável); o responsável existe só em `commercial_opportunities.responsible_user_id` | **Gap no Full**: não há carteira por cliente. Decidir se vira coluna em `customers` ou se fica na oportunidade |
| Venda | `sales` (categoria, bruto, custo, margem, parcelas, status), `sale_cost_items` (005) | `sales` + `sale_items` (itens por serviço), `proposals` → `sales` | Venda Lite → venda Full com 1 item genérico por categoria; custos do Lite → itens/custos do Full |
| Categoria de venda | `sale_categories` (AÉREO/TERRESTRE/EXCURSÃO/OUTROS) | Tipos de serviço por página (Aéreo, Terrestre, Excursões, Seguro) e `travel-products` | Mapear por tabela de-para; não há equivalência 1:1 garantida |
| Comissão | `seller_commissions` (snapshot, PENDING_RULE → PAID), aprovação vira conta a pagar | `commissions`/`commission_entries`, `/commissions/generate`, folha | O Lite gera a comissão na confirmação; o Full gera por lote. As regras de fato gerador são decisão pendente da Gadotti |
| Contas a receber | `receivables` (parcelas da venda) | `receivables` (+ aging) | Equivalente direto |
| Contas a pagar | `payables` (+ `financial_parties`, comissão) | `payables` + `suppliers` | `financial_parties` do Lite → `suppliers` (ou parceiros) do Full |
| Pagamentos | `payments` + `payment_allocations` + estorno espelhado (003) | `payments` + `payment_allocations` + `cash_transactions` | O conceito de alocação é o mesmo. O estorno espelhado do Lite **não tem equivalente documentado** no Full |
| Livro-caixa | `financial_transactions` (append-only) | `cash_transactions`, `revenues`/`expenses`, conciliação | No Full o caixa tem conciliação e DRE; o Lite é um livro-caixa simples |
| Contas | `financial_accounts` (BANK/CASH/WALLET) | Contas e saldo em `/financial/cash-balance` | Equivalente |
| Importação | `import_batches`/`import_records` (clientes e vendas, `.xlsx` via `read-excel-file`) | `import_jobs` (CUSTOMER/SUPPLIER/EMPLOYEE/TAG) | Escopos diferentes: o Lite importa **vendas**, o Full não. **O endpoint do Full está quebrado** (ver risco R1) |
| Relatórios | Vendas, vendedores (drill-down + gráficos), comissões, fluxo de caixa | Vendas, rentabilidade, pessoal, aging, fluxo de caixa, DRE, previsto x realizado | O Full é superconjunto; o "relatório de vendedor com drill-down" do Lite não tem equivalente direto |
| Dashboard | 12 widgets configuráveis pelo MASTER, calculados no escopo de quem vê | `DashboardPage` + `/financial/dashboard` (fixo) | A configuração por agência não existe no Full |
| Auditoria | `audit_logs` (append-only) | `audit_logs` + `audit-log.ts` | Equivalente; os tipos de evento diferem |
| Integração | `integration_outbox` + `external_id`/`sync_status` | `connectors`, `partners`, webhooks de plataforma | O gateway Lite → Full ainda não existe; o outbox é a preparação |
| Isolamento | RLS FORCE + FKs compostas + `withTenantTransaction` | Igual (mesmo padrão, espelhado) | Bem alinhado |
| Instalação | Local (Docker Compose + scripts PowerShell + ZIP) | Render + Vercel + Supabase | Modelos de execução diferentes, por desenho |

---

## 3. O que a Lite deve manter simples

1. **Venda de item único com categoria**, sem itens por serviço, propostas, ofertas, wishes ou trips.
2. **Regra de comissão no vendedor**: percentual sobre o bruto, sobre a margem, valor fixo ou manual. Sem plano, folha nem dedução.
3. **Financeiro de caixa**: receber, pagar, estornar e saldo por conta. Sem DRE, conciliação, centros de custo ou rateio.
4. **Uma tela de dashboard configurável**, sem builder de relatórios.
5. **Importação de clientes e vendas a partir de planilha**, sem o motor genérico de mapeamento do Full.
6. **Instalação local** com scripts. Nenhuma dependência de nuvem para a piloto operar.
7. **Perfis com poucas permissões claras.** O catálogo atual de 26 a 27 permissões não deve crescer sem necessidade.

## 4. O que deve ficar preparado para upgrade (Lite → Full)

| Capacidade | Preparação recomendada |
|---|---|
| Identidade de entidades | Manter `external_id`/`source_system`/`sync_status` em todas as entidades que migram (clientes, vendedores, vendas, contas a receber e a pagar, pagamentos). Garantir que a 005 seguiu o padrão nas tabelas novas |
| Outbox | Cobrir todos os eventos de escrita, inclusive importação, custos da venda e alterações de usuário e permissão, com payload mínimo e idempotente |
| Mapa de perfis | Documentar MASTER→OWNER, SELLER→AGENT e a tradução das exceções de permissão do Lite para area grants do Full, ou registrar que o Full precisa adotar permissões explícitas (ADR) |
| Vendedor ↔ funcionário | Guardar no vendedor os dados que o `employees` do Full exige (CPF, papel), para que a migração não perca nada |
| Carteira de clientes | Decidir no Full onde vive o `responsible_seller_id`. Sem isso, a carteira se perde no upgrade |
| Estorno | Documentar o estorno espelhado como contrato; o Full precisa aceitar ou converter esse formato |
| Exportação | Ter um export completo por tenant (JSON/CSV) versionado, como plano B do gateway |
| Categorias | Tabela de-para das categorias do Lite para tipos de serviço e produto do Full |
| Dinheiro e datas | Manter `NUMERIC(14,2)` e datas `DATE` sem fuso, compatíveis com o Full |

---

## 5. Riscos

| # | Severidade | Área | Risco |
|---|---|---|---|
| R1 | **Alta (produção)** | Segurança / Full | `services/api/src/routes/import.ts` registra `/api/import/*` **sem `preHandler: protectedHooks`**. O parâmetro é recebido mas nunca usado, e não há `requireRole`. Consequências: (a) qualquer requisição **sem autenticação** tem o multipart lido para a memória (até `MAX_ATTACHMENT_BYTES`) antes de falhar; (b) o serviço chama `getAgencyId()` sem contexto e falha **fechado**, sem dado de outra agência exposto, mas devolve **500 com `error.message` interno**, contrariando o `security-model.md`; (c) a importação fica **inutilizável** para usuários reais. Não encontrei teste HTTP para essas rotas. Vale também para `parse`, `validate`, `confirm`, `cancel`, `jobs` e `:jobId` |
| R2 | Média | Documentação | Visão do produto, AI_CONTEXT, stack e segurança descrevem um sistema mais antigo (ver §1). Agentes e auditores tomam decisões erradas a partir disso (o próprio AGENTS.md manda ler esses documentos primeiro) |
| R3 | Média | Arquitetura | Dois modelos de autorização: o Lite usa permissões explícitas mais escopo; o Full usa hierarquia mais area grants. Sem decisão (ADR), o upgrade ou a convergência vira reescrita |
| R4 | Média | Tenant / upgrade | IDs UUID (Lite) e TEXT (Full), e `tenant_id` vs `agency_id`: a migração precisa de tabela de mapeamento e de checagem de colisão. Isso ainda não foi especificado |
| R5 | Média | Produto | O patch estacionado do `apps/agency` (`D:\travel-platform-backups\parking\`) chama `POST /imports/upload`; o Full expõe `/api/import/upload`. Além do R1, o caminho difere e o contrato (`entityType` CUSTOMER/SALES vs CUSTOMER/SUPPLIER/EMPLOYEE/TAG) também |
| R6 | Baixa | Duplicação | O `apps/customer` mantém um 2º painel interno sobreposto ao `apps/agency`, sem decisão (já documentado). Isso aumenta a superfície que o PX1 precisa cobrir |
| R7 | Baixa | Comissão | Fato gerador e proporcionalidade diferem entre Lite (na confirmação) e Full (por lote/plano). Depende das 17 decisões pendentes da Gadotti |
| R8 | Baixa | Design | O Lite usa CSS próprio (`styles.css`) e o Full usa Tailwind v4 com `components/ui`. Os tokens do `design-system.md` não estão aplicados de forma uniforme em nenhum dos dois |

---

## 6. Recomendação para PX1 (Product Experience + Upgrade Readiness), sem executar

1. **Tratar o R1 antes de qualquer outra coisa**, numa rodada de segurança do Full separada do PX1. A correção é colocar `protectedHooks` e o perfil mínimo nas 7 rotas, sanitizar o erro 500 e adicionar teste HTTP com 401, 403 e isolamento entre agências. É uma ação na produção, então precisa de autorização explícita.
2. **Atualizar a documentação-fonte** (R2): `AI_CONTEXT.md`, as seções 21/23/30 do `PRODUCT-VISION`, a stack (Prisma vs SQL), o `security-model` (sessões, validação) e a `authorization` (area grants). É só documentação, com baixo risco e alto retorno para os próximos agentes.
3. **Abrir ADR "Modelo de autorização Lite ↔ Full"** (R3), com duas opções: (a) o Full adota permissões explícitas (o Lite vira referência); (b) o Lite traduz as permissões para area grants no upgrade. Escolher antes de escrever o gateway.
4. **Especificar o contrato de upgrade** a partir do mapa do §2: identidade, mapeamento de chaves (R4), de-para de categorias e de perfis, vendedor→funcionário, carteira, estorno. Registrar em `docs/travel-lite/UPGRADE-CONTRACT.md` e em `docs/decisions/`.
5. **Experiência (UX) no PX1:** começar pelo Lite, que é o que a Gadotti usa.
   - (a) Padronizar o Lite nos tokens do `design-system.md`, sem migrar para Tailwind.
   - (b) Revisar as jornadas venda → recebimento → comissão e importação, com teste de uso pela Patricia e uma vendedora.
   - (c) Mensagens de erro em pt-BR, hoje em inglês nas respostas da API.
   - (d) Estados vazios e onboarding no primeiro acesso.
6. **Não convergir código Lite ↔ Full no PX1.** Manter separado, com o mapa e o contrato como ponte. A convergência fica para depois das decisões da Gadotti e do ADR do item 3.

---

**Resultado:** auditoria concluída em modo somente leitura. Nenhuma mudança no repositório, na `main` (`2190f60`) nem na worktree do Lite (`e19db89`).
