# Comissionamento por Funcionário e Produto

## 1. Estado atual do comissionamento (auditoria realizada antes de qualquer alteração)

Antes de qualquer migration ou código novo, foi feita uma auditoria completa do domínio de comissão já existente no projeto. Resultado:

- **`commission_plans`** (migração 042): planos de comissão **globais por agência**, com tipos `PERCENT_SALE`, `PERCENT_MARGIN`, `FIXED`, `PRODUCT` (stub, nunca implementado), `DESTINATION`, `TIERED_TARGET`.
- **`employees.default_commission_plan_id`**: cada funcionário tinha, no máximo, **um único plano global** vinculado — este era exatamente o gap relatado pelo usuário ("comissão não pode ser configuração global única aplicada igualmente a todos os vendedores").
- **`commission_entries`** (migração 043): a tabela real de lançamentos de comissão gerados, com ciclo de vida de status `PENDING → APPROVED → PAYABLE → PAID`, mais `CANCELLED`. Esta é a **tabela autoritativa de comissões geradas** — não existia (nem foi criada) uma segunda tabela paralela.
- **`commission_entries_agency_sale_employee_active_uidx`** (migração 044): guarda de deduplicação original, 1 comissão ativa por (agência, venda, funcionário) — **estendida**, não removida, para permitir múltiplos produtos na mesma venda.
- **Tabela legada `commissions`** (migrações 001/007): tabela morta, não usada por nenhum código ativo — não confundida com `commission_entries`.
- **`commercial_partners` / `partner_commissions`** (migração 054): domínio de **parceiros externos/afiliados da Travel Plataforma** (Platform Admin Comercial & Parcerias) — deliberadamente **não tocado**. É um conceito diferente de comissão de funcionário de agência e não foi misturado com este trabalho.

**Conclusão da auditoria**: já existia estrutura de plano/comissão e proteção contra duplicidade, mas nenhuma estrutura por **funcionário + produto + vigência com snapshot histórico**. Por isso, foi criada uma tabela nova e mais estreita (`employee_commission_rules`), **ao lado** de `commission_plans` (que continua existindo para planos globais legados), e `commission_entries` foi **estendida** (não substituída) para também suportar lançamentos originados por regra de funcionário/produto.

## 2. Modelo final

### 2.1 `employee_commission_rules` (nova tabela, migração 080)

Tenant-scoped (`agency_id`), com RLS forçado e política completa. Colunas:

`id, agency_id, employee_id, product_type, calculation_type, calculation_basis, percentage_rate, fixed_amount, currency, valid_from, valid_until, status, created_by_user_id, created_at, updated_at`

- `calculation_type = PERCENTAGE` exige `percentage_rate`; `calculation_type = FIXED` exige `fixed_amount` (CHECK constraint).
- `status`: `ACTIVE` / `INACTIVE`.
- Precedência determinística: no máximo **uma** regra "em aberto" (`valid_until IS NULL`) `ACTIVE` por (funcionário, tipo de produto), garantida por índice único parcial. Criar uma nova regra em aberto **fecha automaticamente** a anterior (define `valid_until`), nunca escolhe aleatoriamente nem sobrescreve silenciosamente.

### 2.2 `commission_entries` (estendida)

Colunas novas, todas opcionais para preservar as linhas legadas geradas por `commission_plans`:

`commission_rule_id, product_type, source_item_id, source_item_type, quantity`

- `commission_plan_id` passou a ser **anulável** (antes era `NOT NULL`).
- **`commission_entries_lineage_check`**: CHECK que garante que cada linha pertence a **exatamente uma** linhagem — ou o caminho legado (`commission_plan_id` preenchido), ou o novo caminho (`commission_rule_id` + `product_type` preenchidos) — nunca ambos, nunca nenhum.
- Guarda de deduplicação **ampliada** (não removida): duas novas constraints parciais substituem a antiga — uma para o caminho legado (por venda+funcionário) e uma para o caminho novo (por venda+funcionário+tipo de produto), permitindo múltiplos produtos comissionados na mesma venda sem permitir duplicidade dentro do mesmo produto.

## 3. Produtos suportados

Mapeados para as necessidades funcionais do pedido (AIR/EXCURSION/LAND/PACKAGE/HOTEL/INSURANCE/TRANSFER), sem criar produto fictício:

| Produto | Origem dos valores reais |
|---|---|
| `EXCURSION` | `excursion_departures` + `excursion_customers.sale_value` (por passageiro) |
| `AIR` | `air_services` (valor da passagem/venda) |
| `LAND` | `land_services` |
| `INSURANCE` | `insurance_policies.sale_amount` |
| `PACKAGE` | `sales.total` (não existe tabela própria de pacote — o pacote é a própria venda) |
| `HOTEL` | **gap documentado**: não existe tabela estruturada de precificação por venda para hotel avulso; geração exige valor-base informado manualmente pelo gestor no momento da geração (o valor final ainda é sempre calculado no backend a partir da regra, nunca aceito pronto do navegador) |
| `TRANSFER` | mesmo gap/mesma mitigação do HOTEL |

## 4. Bases de cálculo

`PRODUCT_TOTAL, PACKAGE_TOTAL, PER_PASSENGER, PER_TICKET, FIXED_PER_PASSENGER, FIXED_PER_TICKET, FIXED_PER_SALE`

Margem não foi implementada como base nesta fase (não há regra de negócio equivalente comprovada no domínio atual).

## 5. Evento de reconhecimento

A regra vigente aplicada é a que está ativa em **`sales.created_at`** — não existe, no domínio atual, um conceito separado de "data de confirmação"; `sales.created_at` foi adotado como o evento de reconhecimento por ser o único timestamp de origem de venda já existente e estável.

## 6. Snapshot (regra mais importante do pedido)

Cada `commission_entries` gerada grava um snapshot completo e imutável: `employee_id, sale_id, source_item_id, product_type, commission_rule_id, calculation_basis, base_amount (via campos existentes), quantity, percentage_rate/fixed_amount, commission_amount, earned_at (created_at), status`.

Alterar uma `employee_commission_rules` no futuro **nunca** recalcula comissões já geradas — o cálculo já persistido não lê mais a regra. Validado pelo teste `rule change does not alter historical commissions` (cenário Janeiro 5% / Fevereiro 7%, idêntico ao exemplo do usuário).

## 7. Cancelamento

Gap auditado: `cancelSale()` nunca tocava em `commission_entries`. Política adotada (conservadora, documentada, não inventada como política financeira nova):

- Comissões em `PENDING` ou `APPROVED` de uma venda cancelada são automaticamente movidas para `CANCELLED`.
- Comissões já em `PAYABLE` ou `PAID` (dinheiro já enfileirado/pago) **não são tocadas** — reverter dinheiro já desembolsado é uma decisão financeira fora do escopo deste fechamento.

## 8. Permissões

- Gestão de regras (`POST/PATCH /employee-commission-rules*`): `ADMIN+` (papéis administrativos).
- Leitura de regras: `MANAGER+`.
- `AGENT` **não pode** alterar sua própria regra (testado explicitamente).
- Novo endpoint `GET /commissions/mine`: estritamente escopado ao próprio usuário autenticado (via `employees.user_id`), liberado para `AGENT+` — adição de privilégio pequena, explícita e documentada, não uma ampliação silenciosa.
- Relatório (`GET /commissions/report`): `MANAGER+`.
- Tudo tenant-scoped por RLS; nenhum endpoint confia em `tenant_id` vindo do navegador.

## 9. Backend autoritativo

`generateEmployeeCommission()` sempre lê os valores reais nas tabelas de produto no backend. O cliente escolhe **apenas** venda/funcionário/produto/item de origem — nunca envia `commission_amount`, `percentage_rate` ou `base_amount` como valor final aceito (testado em `backend is authoritative — client-supplied amount/rate are ignored`).

## 10. Atribuição do vendedor e split

Nesta fase, assume-se **um único vendedor principal por venda** (o funcionário informado explicitamente na geração da comissão). Split entre múltiplos vendedores **não foi implementado** — fora do escopo desta rodada, conforme instrução explícita do usuário.

## 11. Exemplos (com números reais dos testes)

- **Excursão**: João, `EXCURSION`, `PERCENTAGE`, `PER_PASSENGER`, 5%. Passageiros A=R$2000, B=R$2000, C=R$1800 → comissões 100+100+90 = **R$290**.
- **Aéreo**: 3% sobre valor da passagem (`PRODUCT_TOTAL`) ou valor fixo por ticket (`FIXED_PER_TICKET`), usando o valor real de `air_services`.
- **Pacote**: 4% sobre `sales.total` (`PACKAGE_TOTAL`).

## 12. Fora do escopo (não implementado nesta rodada, por instrução explícita)

Marketplace, Amadeus, comissão de fornecedor externo, split entre múltiplos vendedores, folha de pagamento, billing SaaS, pagamento automático de comissão. Também não foi implementada a cadeia futura Fornecedor→comissão→Agência→comissão interna→Vendedor mencionada pelo usuário como visão de médio prazo.
