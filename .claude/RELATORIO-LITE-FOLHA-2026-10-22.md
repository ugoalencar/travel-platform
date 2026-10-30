# Relatório — Controle salarial / folha gerencial do Travel Lite

Data: 2026-10-22 (leitura iniciada ~10:28 GMT-3)
Autor: Claude (auditoria e especificação; sem implementação)
Prompt de origem: `.claude/NEXT-PROMPT-LITE-FOLHA-2026-10-22.md`
Coordenação: `.claude/COORDENACAO-LITE-FINANCEIRO-2026-10-22.md`

**Status final: HOLD para implementação.** Nada foi implementado, instalado,
migrado, commitado ou consultado em banco. Testes **não foram executados**
(escopo só de leitura; nenhuma afirmação abaixo depende de rodar suíte).

## 0. Estado do ambiente

- cwd: `D:/travel-platform`; branch: `wip/organizacao-2026-10-20` (não é `main`).
- `git status --short` no início: apenas os 3 arquivos novos de coordenação
  (`.claude/COORDENACAO-…`, `.claude/NEXT-PROMPT-LITE-FOLHA-…`,
  `.opencode/NEXT-PROMPT-LITE-CEP-…`). Único arquivo que escrevi: este relatório.
- Não li `.env`, não li dados reais de salário, não consultei banco remoto.
- Nota de rastreabilidade: o `audit-log.ts` desta branch **não** tem a flag
  `required` (auditoria obrigatória) que registros de sessões anteriores
  associam à branch `feat/gadotti-online-provision`. Tudo abaixo descreve o
  checkout atual; antes de implementar, confirmar qual versão de
  `audit-log.ts` será a base.

## 1. O que existe de fato

Convenção: **[IMPL]** = código com backend + persistência; **[UI]** = tela que
chama API real; **[DOC]** = comentário/texto; **[AUSENTE]** = não existe.

### 1.1 Travel Platform Full

| Item | Situação | Evidência |
| --- | --- | --- |
| Funcionário com `base_salary`, `user_id` (opcional), dados bancários | [IMPL] | `infrastructure/migrations/042_employees_commission_plans.sql:90` (`user_id`), `services/api/src/employees.ts:27,73`; comentário 042:8 declara que funcionário é registro de pessoal distinto de `users` |
| Descontos por competência (`ADVANCE`, `ABSENCE`, `BENEFIT`, `LOAN`, `ADJUSTMENT`, `OTHER`) | [IMPL] | migração `043…sql` (tabela `employee_deductions`, CHECK de tipo), `payroll.ts:57-135`; rotas `routes/commissions.ts:369-399` |
| Folha por funcionário+mês (`OPEN→APPROVED→PAID/CANCELLED`) | [IMPL] | `payroll.ts:250-449`; tabela `payroll_entries` em 043:150, `UNIQUE (agency_id, employee_id, competence)` em 043:179 |
| Pagamento da folha cria `payables` (`beneficiary_type='EMPLOYEE'`, `payroll_entry_id`) | [IMPL] | `payroll.ts:423-439`; colunas em 043:20-23 |
| Comissão (`commission_entries`) → aprovação → payable próprio | [IMPL] | `commissions.ts:267-371` |
| DRE gerencial subtrai `commissions_total` da folha para não contar comissão duas vezes | [IMPL] (apenas relatório) | `financial.ts:1551-1562` (doc), `:1670-1680` (query), `:2657-2669` |
| Tela "Comissões e Folha de Pagamento" | [UI] chamando API real (`listPayrollEntries`, `generatePayrollEntry`, `approvePayrollEntry`, `payPayrollEntry`) | `apps/agency/src/pages/PayrollPage.tsx:15-32,106,186,199,208`; sem mock |
| Texto "folha líquida de comissões para evitar dupla contagem" | [DOC]/UI | `DrePage.tsx:138,148-149` — explica o **relatório**, não impede dupla contagem **de pagamento** |
| **Testes automatizados da folha** | **[AUSENTE]** | `grep -il payroll services/api/tests tests` encontra só `financial*.test.ts`/`partners.test.ts` (listam a migração 043 como fixture, comentários nas linhas 36-53/39-50) e `database.integration.test.ts:146,309` (lista a tabela em verificação de RLS). Nenhum teste chama `generatePayrollEntry`, `approvePayrollEntry`, `payPayrollEntry` nem as rotas `/payroll-entries*` |
| Auditoria (`recordAuditEvent`) nas operações de folha | **[AUSENTE]** | nenhuma ocorrência de "audit" em `payroll.ts`, `routes/commissions.ts`, `commissions.ts`, `employees.ts` |
| Quem aprovou/pagou a folha | **[AUSENTE]** | `payroll_entries` não tem `approved_by`/`approved_at`/`paid_by` (043:150-171); `approvePayrollEntry` só muda status (`payroll.ts:378-382`) |

### 1.2 Travel Lite (`services/api-lite`, `infrastructure/migrations-travel-lite`)

| Item | Situação | Evidência |
| --- | --- | --- |
| Folha, funcionário, salário, desconto | **[AUSENTE]** | `grep -i employee/payroll/salary/salario/funcionario` em `services/api-lite/src`, `migrations-travel-lite`, `apps/travel-lite/src` → 0 arquivos |
| Vendedor ≠ usuário (vínculo opcional, 1 login → no máx. 1 vendedor) | [IMPL] | `001_initial_schema.sql:99-101,118`; `004…sql` (`uq_sellers_tenant_user`); `sellers.ts:111-124`; `users.ts:109-126` |
| Comissão do vendedor com snapshot da regra | [IMPL] | `001…sql:201-238`; índice único ativo por venda+vendedor `ux_seller_commissions_active` (:236) |
| Aprovar comissão cria `payables` (único ponto automático) | [IMPL] | `routes/commissions.ts:137-206` (UPDATE status + INSERT payable em :171-187, com `FOR UPDATE` em :60 e checagem `status==='PENDING'` em :153) |
| Pagar payable com pagamento parcial; comissão vira `PAID` ao pagar | [IMPL] | `cash-flow.ts:419-522`; `commissions.pay` exigido se `commission_id` (:445); comissão `PAID` em :487-492 (note: **mesmo em pagamento parcial** — o UPDATE roda sempre que há `commission_id`, ver §2 item L3) |
| Estorno de pagamento com espelho, volta comissão a `APPROVED` | [IMPL] | `finance.ts:203-325` (:262-269); `003_payment_reversals.sql` (índices únicos de reversão) |
| Auditoria (append-only) | [IMPL, best-effort] | `audit-log.ts:63-110`: falha de auditoria é engolida por design; `audit_logs` só `SELECT, INSERT` (`002…sql:136`) |
| Permissões | [IMPL] | catálogo de 32 em `access.ts:12-45`; MASTER `grants_all`; MANAGER recebe `finance.read/manage`, `commissions.*` (`004…sql`); **VIEWER recebe `finance.read` e `reports.finance`** |
| Isolamento por tenant (RLS + `tenant_id` em toda query) | [IMPL] | `002_rls_policies.sql`; rotas filtram `tenant_id = $1` |

## 2. Revisão crítica da referência Full (sem copiar, sem afirmar bug além da evidência)

Legenda: **C** = comprovado por leitura de código; **H** = hipótese plausível
que exige teste para confirmar (não afirmo defeito).

**F1 (C) — A folha soma comissão sem "consumi-la".** `generatePayrollEntry`
(`payroll.ts:267-275`) soma `commission_entries.amount` com status
`APPROVED|PAYABLE|PAID` do mês e grava `commissions_total`, mas não marca nem
vincula nenhuma comissão. Nada impede que a mesma comissão também vire payable
próprio (`createPayableFromCommissionEntry`, `commissions.ts:305-371`, exige
`APPROVED`). Resultado possível: a mesma comissão paga uma vez no payable da
comissão e outra dentro do `net_amount` da folha (`payroll.ts:424-436` cria
payable com `net_amount`). O DRE "corrige" a conta subtraindo
`commissions_total`, o que **mascara a dupla despesa na visão gerencial, mas
não evita a dupla saída de caixa**. A evidência de código é completa; a
ocorrência em produção do Full não foi observada (não li dados).

**F2 (C) — A competência da comissão é o mês de `created_at`, não da venda,
aprovação ou pagamento** (`payroll.ts:272`). A folha de um mês pode mudar se
uma comissão for criada/aprovada depois; o DRE usa períodos diferentes para
cada fonte (comissão por `created_at` em `financial.ts:1655-1662`, folha por
`competence` :1675-1677).

**F3 (C) — Comissão no Full nunca chega a `PAID` por código.** Os únicos
`UPDATE commission_entries` são `commissions.ts:288` (→APPROVED),
`commissions.ts:365` (→PAYABLE) e `employee-commissions.ts:503` (→CANCELLED);
não há atualização para `PAID` nem `paid_at` ao pagar o payable. A folha
trata `PAID` como elegível, mas o estado é inatingível pelo fluxo de código.
Implicação: no Full não há como saber, pela própria comissão, se foi paga.

**F4 (C) — `payPayrollEntry` marca a folha `PAID` ao criar a conta a pagar.**
`payroll.ts:423-445`: INSERT em `payables` com `status 'OPEN'` e, na mesma
transação, `payroll_entries.status='PAID'` + `paid_at=now()`. A folha fica
"paga" sem que haja pagamento registrado, sem conta bancária/forma. O nome do
endpoint (`/pay`) e o estado `PAID` descrevem a criação da obrigação, não a
baixa. É exatamente o que o prompt manda não reproduzir.

**F5 (C, impacto H) — Sem trava de concorrência nem unicidade de payable.**
`approve` e `pay` fazem `SELECT` sem `FOR UPDATE` (`payroll.ts:369-372,398-401`)
e `payables` não tem índice único em `payroll_entry_id` (migrações 043/010/041
só criam índices comuns). Duas chamadas simultâneas a `/pay` podem, em tese,
ambas ler `APPROVED` e inserir dois payables. Não testado.

**F6 (C) — Folha `OPEN` é recalculada (reescrita) a cada `generate`**
(`payroll.ts:309-332`), inclusive `base_salary` atual do cadastro; salário do
funcionário é coluna mutável (`employees.base_salary`), sem histórico/vigência.
Alterar o salário depois não altera folha `APPROVED/PAID` (bom), mas a folha
`OPEN` regenerada reflete o salário atual e não há registro de qual valor foi
usado em cada geração.

**F7 (C) — Descontos podem ser apagados depois do fechamento.**
`deleteEmployeeDeduction` (`payroll.ts:125-135`) é `DELETE` físico sem checar
folha existente; `createEmployeeDeduction` (:86-123) também aceita lançar em
mês já `PAID` (sem efeito na folha paga, mas com divergência silenciosa).

**F8 (C) — Sem validação do resultado líquido.** `net_amount` pode ser
negativo (`payroll.ts:290-294`; coluna sem CHECK em 043:150-171) e vira
`payables.amount`; o Lite hoje tem `CHECK (amount > 0)` em `payables`
(`001…sql:321`), então a transposição direta falharia ou exigiria tratamento.

**F9 (C) — Permissões de leitura salarial = papel hierárquico.** Gerente
(`MANAGER`) lê todas as folhas e `GET /employees` (com `base_salary` e dados
bancários) via `requireRole(UserRole.MANAGER)` (`routes/commissions.ts:146-148,
370,405,418`). Exatamente o comportamento que o Lite não pode herdar
("ser gerente não concede salário da equipe").

**F10 (H) — Cancelamento de venda não cancela comissão já `PAYABLE`.**
`cancelCommissionsForSale` só cancela `PENDING|APPROVED`
(`employee-commissions.ts:503-507`). Combinado com F1/F3, uma folha que já
somou a comissão não é atualizada. Hipótese; exige teste de ciclo completo.

**F11 (C) — Auditoria ausente** em geração, aprovação, pagamento, cadastro e
exclusão de desconto (ver §1.1).

**F12 (C) — Ausência de testes** do módulo inteiro (ver §1.1). Qualquer
alegação de "funciona" no Full é só leitura de código.

**Conclusões úteis para o Lite:** reaproveitar os *conceitos* (competência
mensal única por pessoa, componentes — base, benefícios, bônus, reembolsos,
adicionais, descontos —, estados, obrigação via `payables`, DRE sem dupla
contagem), **não** o comportamento de F1, F2, F4, F5, F7, F8, F9.

Lite — achados relacionados que condicionam o desenho:

- **L1 (C)** `payables` não tem índice único em `commission_id`
  (`001…sql:342-343` é índice comum; `005…sql:179-180` só cobre
  `sale_cost_item_id`). `POST /payables` (`cash-flow.ts:350-415`) aceita
  `commission_id` arbitrário com `finance.manage`; combinado com
  `POST /payables/:id/pay` (:419-522) é possível criar uma segunda obrigação
  para a mesma comissão. A aprovação normal evita duplicidade (`FOR UPDATE` +
  estado), mas o endpoint genérico não. **Tratar na frente de comissões
  (Codex): unicidade `(tenant_id, commission_id) WHERE status <> 'CANCELLED'`
  e rejeitar `commission_id` em `POST /payables` — a folha depende disso.**
- **L2 (C) — Vazamento por canal lateral.** `GET /payables` e `GET /payments`
  exigem só `finance.read` (`cash-flow.ts:289,582`), `/transactions` também
  (:645); o fluxo diário agrega saídas por data com `reports.finance`
  (`reports.ts:343-366`). VIEWER tem `finance.read` por padrão. Se a folha usar
  `payables`/`payments` como estão, **valor e descrição do salário individual
  ficariam visíveis a quem tem só `finance.read`**.
- **L3 (C)** O UPDATE de comissão para `PAID` em `cash-flow.ts:487-492` roda
  em qualquer pagamento do payable (inclusive parcial); a comissão vira `PAID`
  com saldo ainda aberto. Isso afeta qualquer conceito de "valor já pago /
  saldo" do contrato da §6 e é frente do Codex (motor de comissões).
- **L4 (C)** Auditoria best-effort (`audit-log.ts:101-109`): inadequada para
  fechamento/pagamento de folha — exigir auditoria obrigatória nesses eventos.

## 3. Proposta mínima de folha gerencial mensal (NÃO aprovada)

Rótulos: **[SOLICITADO]** = pedido pelo usuário/coordenação; **[CONCEITO]** =
existe no Full; **[PROPOSTA]** = minha sugestão, ainda sem aprovação.

Objetivo [SOLICITADO]: visibilidade de **custo total** por competência. É folha
**gerencial**, não folha legal. **Fora de escopo:** INSS, FGTS, IRRF, férias,
13º, eSocial, rescisão. Se o usuário quiser "encargos", registrar como linha
manual com origem e valor informados pela agência/contador; o sistema não
calcula. Quaisquer requisitos legais exigem validação especializada e fontes
oficiais vigentes, fora desta especificação.

Componentes por pessoa e competência:

| Componente | Tipo | Observação |
| --- | --- | --- |
| Salário-base | ganho [SOLICITADO][CONCEITO] | vem de **vigência** (§3.2), não de coluna mutável |
| Adicionais fixos / benefícios | ganho [CONCEITO] | lançamento manual com motivo; sem regra tributária |
| Bônus | ganho [CONCEITO] | manual; bônus por meta de venda pertence ao motor de comissões (Codex), não à folha |
| Reembolsos | ganho (não remuneratório gerencialmente) [CONCEITO] | exibir em linha própria para não distorcer "remuneração" |
| Descontos | dedução [CONCEITO] | tipos do Full (`ABSENCE`, `LOAN`, `ADJUSTMENT`, `OTHER`, `BENEFIT`) como ponto de partida |
| Adiantamentos | dedução com origem [SOLICITADO][CONCEITO] | ver §3.3 |
| Comissões | **referência**, nunca somada/paga pela folha por padrão | ver §6 |
| Encargos informados | custo da empresa [PROPOSTA] | só linha manual; não entra no líquido do funcionário |

### 3.1 Estrutura proposta (apenas desenho; migração a ser proposta, não criada)

Convenção do Lite (`tenant_id UUID`, FK composta tenant-safe, RLS igual a
`002_rls_policies.sql`). Nomes provisórios.

- `employees` — id, tenant_id, nome, `user_id` NULL, `seller_id` NULL,
  status (ATIVO/INATIVO), data de admissão/desligamento. **Sem CPF/RG/banco
  na v1** (LGPD: minimizar dado pessoal; o pagamento é registrado manualmente
  pela conta financeira existente). Dados bancários = pergunta §10 (Q7).
- `employee_compensation_terms` — employee_id, `effective_from`, valor
  base, motivo, `created_by`, `created_at`. **Append-only** (nova vigência,
  nunca UPDATE). Folha de competência X usa a vigência válida em X.
- `payroll_periods` — competência (1º dia do mês), status
  `OPEN → IN_REVIEW → APPROVED → CLOSED`, `closed_at/by`, `reopened` (log).
- `payroll_entries` — period_id, employee_id, totais derivados (ganhos,
  deduções, líquido a pagar), `status`, `version`, `approved_by/at`;
  `UNIQUE (tenant_id, period_id, employee_id)` para a entrada principal.
- `payroll_entry_lines` — entry_id, `kind`, `direction` (EARNING|DEDUCTION),
  `amount > 0`, `source_type`, `source_id`, motivo, autor; **imutável** após
  `APPROVED`. Índice único parcial `(tenant_id, source_type, source_id)`
  onde `source_type = 'COMMISSION'` (§6) e para adiantamento.
- `employee_advances` — employee_id, valor, payable/pagamento de origem,
  saldo a recuperar; linhas de dedução apontam para ele. [PROPOSTA]
- `payables` ganha `payroll_entry_id` NULL (+ índice único parcial
  `(tenant_id, payroll_entry_id) WHERE status <> 'CANCELLED'`) e uma marca
  que impeça listagem/pagamento sem permissão salarial (§7).

Valores monetários: `NUMERIC(14,2)`, arredondamento half-up documentado em
um ponto (hoje o Lite arredonda em `Math.round(x*100)/100` espalhado — ex.
`cash-flow.ts:451,462`); definir função única junto ao motor de comissões.

### 3.2 Salário por vigência

O Full guarda `employees.base_salary` mutável (F6). No Lite, alterar salário
cria nova vigência; folhas já `APPROVED/CLOSED` guardam *snapshot* da linha
(`kind='BASE_SALARY'`) e nunca mudam. Retroatividade de salário = ajuste
explícito em competência aberta (§4), jamais reescrita.

### 3.3 Adiantamentos

Adiantamento pago em mês anterior é saída de caixa real (payable/pagamento
normal, categoria própria) e cria saldo a recuperar. Na folha, a recuperação é
uma linha de dedução com `source_type='ADVANCE'`. Regras mínimas: recuperação
não excede saldo; folha estornada devolve saldo; nunca apagar o adiantamento
(cancelar com motivo). Parcelamento de recuperação = pergunta §10 (Q5).

## 4. Ciclo da competência (proposta)

| Fase | Estado | Ação / regra |
| --- | --- | --- |
| Preparação | `OPEN` | gerar rascunho por pessoa (idempotente por pessoa+competência); linhas manuais editáveis; comissões aparecem como **referências** |
| Revisão | `IN_REVIEW` | congela edição de linhas; mostra diferenças vs. mês anterior; só `payroll.review` |
| Aprovação | `APPROVED` | exige `payroll.approve` **diferente** do autor do rascunho (separação de funções, configurável); grava aprovador/horário; auditoria obrigatória |
| Obrigação financeira | `APPROVED` + payable `OPEN` | criar `payables` **depois** de aprovada (um por pessoa, valor = líquido a pagar > 0, descrição neutra) — **não** marca "paga" |
| Baixa | payable `PARTIALLY_PAID/PAID` | pagamento via fluxo financeiro existente (`recordPayment`); folha é considerada `PAID` **derivando** do payable quitado, não por flag escrita à mão |
| Fechamento | `CLOSED` | competência travada; auditoria; somente `payroll.close` |
| Correção posterior | novo lançamento | nunca editar período `CLOSED`: criar **ajuste** (entrada complementar tipo `ADJUSTMENT`) na competência corrente ou reabrir com permissão específica, motivo e auditoria; pagamento anterior preservado, diferença vira nova obrigação/dedução |

Valor líquido ≤ 0: não gera payable (o CHECK `amount > 0` do Lite,
`001…sql:321`, impõe isso); saldo negativo vira dedução/saldo a recuperar
(pergunta §10 Q6).

## 5. Vínculo funcionário × usuário × vendedor

Realidade a respeitar: no Lite o vendedor já é entidade comercial com vínculo
opcional a um usuário (`001…sql:99-101`); usuário é identidade de acesso. Não
existe o conceito de funcionário.

Proposta: três identidades independentes, ligadas por FKs **opcionais**:

- `employees.user_id` NULL (funcionário sem login — ex.: faxineira, contador
  CLT interno, sócio sem acesso);
- `employees.seller_id` NULL (funcionário que não vende);
- vendedor autônomo/parceiro sem registro de funcionário (recebe só comissão,
  sem salário);
- usuário sem funcionário (acesso externo/consultor).

Restrições: `UNIQUE` parcial para `user_id` e `seller_id` por tenant (uma
pessoa-folha por login/vendedor); FK composta tenant-safe. Desvincular não
apaga histórico. **Não presumir** assalariado = vendedor nem usuário =
funcionário. O vínculo `employees.seller_id` é o que permite à folha *exibir*
(não pagar) as comissões do vendedor correspondente (§6). Quem define
vínculos precisa de permissão salarial própria (vincular revela remuneração).

## 6. Contrato de integração com comissões (proposta para o Codex)

Princípio: **a comissão tem uma única obrigação financeira**, criada pelo
motor de comissões (hoje: payable criado na aprovação,
`routes/commissions.ts:171-187`). A folha **referencia**, não recria nem soma
no líquido a pagar, salvo decisão explícita pela alternativa B.

Campos mínimos que a folha precisa ler de cada direito de comissão
(identificador estável a cargo do motor de comissões):

| Campo | Significado |
| --- | --- |
| `commission_id` (UUID, único) | identificador do direito |
| `seller_id` / `employee_id` (via vínculo) | beneficiário |
| `competence_month` | competência **definida pelo motor** (data-base a decidir: confirmação, aprovação, liberação por recebimento — Q1) |
| `recognized_amount` | valor reconhecido (derivado do `commission_amount` + ajustes rastreáveis) |
| `paid_amount` | soma de pagamentos efetivos (não confundir com status) |
| `balance_amount` | `recognized − paid` (≥ 0) |
| `obligation_id` | payable único da comissão (hoje `payables.commission_id`) |
| `status` | `PENDING_RULE/PENDING/APPROVED/PAID/CANCELLED` (+ novos do motor) |

Regras do contrato:

1. **Fonte única:** `UNIQUE` em `payables(tenant_id, commission_id)` onde não
   cancelado e bloqueio de `commission_id` em `POST /payables` (achado L1).
2. **Folha só referencia:** linha `kind='COMMISSION_REF'`, `source_type=
   'COMMISSION'`, `source_id=commission_id`, com índice único parcial
   `(tenant_id, source_type, source_id)`: **a mesma comissão aparece no
   máximo uma vez em toda a folha**, em uma única competência.
3. **Nunca criar segundo payable** por comissão por causa da folha. A folha
   não chama "gerar comissão" nem "gerar payable de comissão".
4. **Valor exibido na folha** = `recognized_amount` (custo/remuneração
   bruta); **valor a pagar na folha** = 0 para comissão (já tem obrigação
   própria); o saldo/pago vêm de `paid_amount/balance_amount`.
5. **Mudança posterior** (override, recálculo, retroatividade, cancelamento,
   estorno): o motor emite lançamento de ajuste rastreável; a folha *fechada*
   não muda — a diferença aparece na competência corrente como linha
   `kind='COMMISSION_ADJUSTMENT'` apontando para o `commission_id` e o
   lançamento de ajuste. Pagamento anterior não é sobrescrito.
6. **Estorno de pagamento** (`finance.ts:262-269` devolve a comissão a
   `APPROVED`): o saldo reabre; a folha mostra o saldo, não se reescreve.

Distinções contábeis exigidas pelo prompt:

| Conceito | Definição proposta |
| --- | --- |
| Remuneração bruta | salário-base + adicionais/benefícios/bônus + comissões reconhecidas da competência |
| Líquido a pagar (folha) | ganhos de **folha** − deduções − adiantamentos recuperados; **exclui** comissões (têm obrigação própria) |
| Despesa (competência) | remuneração bruta + encargos informados; comissão entra **uma vez** (pela fonte comissão) |
| Fluxo de caixa | só `payments/financial_transactions` OUT efetivos (salário via folha; comissão via payable da comissão) |

Alternativa B (não recomendada): liquidar comissões *dentro* do payable da
folha e cancelar os payables de comissão. Mais "uma conta só" para o
funcionário, mas: exige cancelar/realocar obrigações já criadas, quebra o
fluxo aprovado→pago→`PAID` do Lite, mistura permissões (`commissions.pay` vs
`payroll.pay`) e amplia o raio da dupla saída (F1). Só considerar com decisão
explícita (Q2).

## 7. Segurança, isolamento, auditoria, fechamento, concorrência

**Permissões novas propostas** (catálogo exige migração + atualização de
`access.ts:12-45` e do teste espelho; fora do meu escopo editar):
`payroll.read_own` (a própria remuneração, se for funcionário com login),
`payroll.read_all`, `payroll.manage` (lançar/editar linhas), `payroll.review`,
`payroll.approve`, `payroll.pay`, `payroll.close`, `payroll.reopen`,
`employees.manage_compensation` (vigências/vínculos). Marcar
`payroll.approve/pay/close/reopen` e `employees.manage_compensation` como
`master_only` (só quem tem `grants_all` concede), ao estilo de
`permissions.manage` (`004…sql`). **Nenhum papel recebe `payroll.*` por
padrão**; nem MANAGER nem ADMIN — a concessão é explícita por usuário
(`user_permissions`). Pergunta §10 Q4 sobre MASTER.

**Isolamento por tenant:** `tenant_id` em todas as tabelas, FK composta,
RLS + `FORCE ROW LEVEL SECURITY` igual ao padrão do Lite; nunca aceitar
`tenant_id` do cliente (já é regra do Lite via `getTenantContext()`).

**Vazamento lateral (L2):** (a) descrição do payable da folha neutra (sem nome
nem competência individual), (b) `GET /payables`, `/payments`, `/transactions`
e o dashboard ocultam/mascaram linhas de folha para quem não tem
`payroll.read_all`, (c) agregados da folha por dia/categoria só com
permissão — com poucos funcionários o agregado identifica o salário
individual (Q3), (d) `POST /payables/:id/pay` exige `payroll.pay` quando o
payable tem `payroll_entry_id` (mesmo padrão de `commissions.pay` em
`cash-flow.ts:445`). Sem isso, `finance.read` (inclusive VIEWER) enxerga
salário.

**Auditoria:** eventos novos obrigatórios (não best-effort — a transação
falha se a auditoria falhar): geração, edição de linha, revisão, aprovação,
criação de obrigação, pagamento, estorno, fechamento, reabertura, mudança de
vigência, vínculo funcionário↔usuário/vendedor, leitura em lote de salários
(exportação). Metadados: antes/depois, motivo, autor; sem salário em texto
livre de log técnico (`audit-log.ts` sanitiza só tipos, não conteúdo — não
gravar valores em campos genéricos acessíveis a quem lê `audit_logs`).

**Bloqueio de alterações pagas/fechadas:** gatilho de banco (BEFORE
UPDATE/DELETE) que recusa mudança em linhas de entrada `APPROVED+` e em
`payroll_periods CLOSED`, além da checagem de aplicação. Correções só por
ajuste (§4). Sem `DELETE` físico de nenhuma tabela de folha (padrão
append-only, como `audit_logs`).

**Concorrência/idempotência:** `SELECT … FOR UPDATE` no período e na entrada
(padrão já usado em `commissions.ts:60`, `cash-flow.ts:440`); geração
idempotente por `(period, employee)`; `Idempotency-Key`/token de versão
(`version`) em aprovar/pagar; unicidade de payable por `payroll_entry_id`;
transição de estado só por `UPDATE … WHERE status = esperado` conferindo
`rowCount`.

**Salário na UI:** esconder valores por padrão, não colocar salário em URL,
`localStorage`, console ou resposta de erro; exportação CSV só com
`payroll.read_all` e auditada.

## 8. Plano de testes (cenários sintéticos; não executados)

Para `services/api-lite/tests/payroll.test.ts` (novo) e ajustes em
`commissions.test.ts`, `access.test.ts`, `finance.test.ts`,
`hardening.test.ts`. Uso do banco de teste isolado existente (porta do README
de testes) — **não** rodar em paralelo com outras suítes que usem o mesmo
Postgres.

1. **Fechamento repetido:** gerar/aprovar/fechar duas vezes seguidas e em
   paralelo (`Promise.all`) → um único efeito; segunda chamada = 409/idempotente;
   um payable por entrada.
2. **Sem comissão duplicada:** comissão aprovada com payable; gerar folha da
   competência → linha `COMMISSION_REF` única; tentar vincular a mesma
   `commission_id` a outra linha/outra competência → violação; folha **não**
   cria payable; `POST /payables` com `commission_id` → recusado.
3. **Pagamento parcial/separado:** pagar parte do salário → payable
   `PARTIALLY_PAID`, folha não vira "paga"; quitar → paga; pagar comissão e
   salário separadamente → saídas independentes, soma = esperado, nenhum
   valor duplicado no fluxo de caixa.
4. **Estorno:** estornar pagamento de salário → payable reabre, saldo
   correto, entrada deixa de estar "paga", período fechado não é reescrito;
   estorno de pagamento de comissão (já existe em `finance.ts`) reabre saldo
   e a folha mostra saldo, sem alterar linhas fechadas.
5. **Período fechado:** editar linha/entrada/vigência retroativa/criar
   desconto na competência `CLOSED` → recusado (aplicação **e** gatilho de
   banco, testando via SQL direto com o papel de runtime); ajuste na
   competência corrente funciona e mantém rastreio.
6. **Sem permissão:** MANAGER sem `payroll.*` recebe 403 em ler/gerar/aprovar/
   pagar; `finance.read`/VIEWER não vê salário em `/payables`, `/payments`,
   `/transactions`, dashboard, exportações; SELLER vê só a própria
   remuneração com `payroll.read_own`; `payroll.approve` não permite
   aprovar o que o próprio usuário elaborou (se separação de funções ativa).
7. **Outro tenant:** com dois tenants, ID de entrada/funcionário/período do
   outro tenant → 404 (não 403 com dados); vínculo `user_id`/`seller_id` de
   outro tenant → recusado; RLS: consulta direta com `current_tenant` errado
   retorna zero linhas.
8. **Vínculos:** funcionário sem login e sem vendas recebe folha; vendedor
   sem funcionário só aparece em comissões; dois funcionários para o mesmo
   usuário/vendedor → recusado.
9. **Auditoria obrigatória:** simular falha do `INSERT audit_logs` → a
   operação de aprovação/pagamento/fechamento **falha e faz rollback**.
10. **Valores:** líquido ≤ 0 não cria payable; arredondamento em R$ 0,01;
    adiantamento > saldo recusado; mudança de vigência não altera folha
    aprovada.

## 9. Arquivos que uma implementação futura alteraria

Dependência explícita do **Codex** (motor de comissões, perfil financeiro,
catálogo de permissões, inicialização). A folha só começa após o contrato
comissão↔obrigação (§6) estar fechado.

Migrações (apenas **propor**; nada criado): `infrastructure/migrations-travel-lite/008_…`
(employees, vigências, períodos, entradas, linhas, adiantamentos, índices
únicos, gatilhos de imutabilidade, RLS/grants) e `009_…` (permissões
`payroll.*`, `payables.payroll_entry_id`, unicidade `payables(commission_id)`,
CHECKs). Última migração hoje: `007_password_reset_tokens.sql`; numeração a
confirmar no momento. Migrações aplicadas são imutáveis.

Backend (`services/api-lite/src`): `access.ts` (catálogo), `audit-log.ts`
(eventos + auditoria obrigatória), `routes/payroll.ts` (novo),
`routes/employees.ts` (novo), `routes/cash-flow.ts` (ocultar folha em
`/payables|/payments|/transactions`, bloquear `commission_id` em
`POST /payables`, exigir `payroll.pay`), `routes/commissions.ts` e
`finance.ts` (contrato §6, achado L3), `routes/reports.ts` e
`routes/dashboard.ts` (agregados), `app.ts` (registro), `capabilities.ts`
(plano/feature flag da folha), `migration-readiness.ts` (se checar versões).
Frontend (`apps/travel-lite/src`): página de Folha, cadastro de
funcionários/vigências, navegação, i18n de erros. Testes: `payroll.test.ts`,
`access.test.ts` (espelho do catálogo), `commissions.test.ts`,
`finance.test.ts`, `hardening.test.ts`, `reports.test.ts`. Docs: ADR da folha
gerencial em `docs/adr/`, regra de produto em `docs/00-product/`, segurança
em `docs/03-security/`, `SCRIPTS.md` se houver script.

Sequência sugerida (pós-aprovação do desenho):
1. Codex fecha contrato de comissões (§6) + unicidade de payable de comissão.
2. Catálogo de permissões `payroll.*` e auditoria obrigatória.
3. Migrações de funcionário/vigência/períodos (testes de RLS e imutabilidade).
4. API de período/entradas/linhas + testes 1, 2, 5, 7, 9.
5. Obrigação financeira e baixa + ocultação lateral (L2) + testes 3, 4, 6.
6. UI e relatório de custo total.
7. Revisão de segurança antes de qualquer publicação.

Nada disso libera publicação online (regra da coordenação).

## 10. Perguntas de negócio realmente bloqueantes

| # | Pergunta | Alternativas | Recomendação |
| --- | --- | --- | --- |
| Q1 | Data-base da competência da comissão? | (a) mês da confirmação da venda; (b) mês da aprovação; (c) mês da liberação por recebimento | Definir junto ao motor/perfil financeiro (já pendente na coordenação). Recomendo (c)/(b) conforme o perfil `META_E_LIBERACAO/SOMENTE_LIBERACAO`; **não** `created_at` (F2) |
| Q2 | Comissão paga em obrigação própria ou dentro da folha? | A: própria (referência na folha); B: consolidada | **A** (menor risco; reaproveita o Lite atual) |
| Q3 | Quem pode ver *agregados* da folha (custo total) sem ver salário individual? | só `payroll.read_all`; dono via permissão financeira separada; sem agregado quando < N pessoas | permissão própria `payroll.read_totals` ou só `read_all`; ocultar agregado para poucos funcionários |
| Q4 | O perfil MASTER (grants_all) lê/aprova folha? | sim por padrão; ou também exigir concessão explícita | MASTER já recebe todo o catálogo (`grants_all`); aceitável, mas **auditado**. Confirmar |
| Q5 | Adiantamento: recuperação em parcela única ou parcelada? | única; parcelas fixas; livre | única na v1; parcelamento depois |
| Q6 | Saldo líquido negativo: bloquear, carregar para o mês seguinte ou aceitar saldo a recuperar? | bloquear; carry-forward; gerar recebível | carry-forward registrado como dedução do mês seguinte |
| Q7 | Registrar dados bancários/PIX do funcionário no sistema? | não (v1); só PIX; completo | **não na v1** (LGPD/minimização); pagamento manual |
| Q8 | Separação de funções: quem prepara pode aprovar? | permitido; proibido; configurável | proibido por padrão, com exceção para agência de uma pessoa (configuração auditada) |
| Q9 | Reabertura de período fechado é permitida? | nunca (só ajuste); com permissão e motivo | com permissão `payroll.reopen`, motivo e auditoria; preferir ajuste |
| Q10 | Quem são, hoje, as pessoas da folha da primeira agência piloto (só quantidade, sem salários)? | — | necessária para decidir Q3 (agregado identifica salário se há 1–2 pessoas) |

Estas perguntas **bloqueiam** o desenho final de §3/§4 apenas em Q1, Q2, Q3,
Q4 e Q8; as demais têm default razoável e podem ser confirmadas na
implementação.

## 11. Riscos e pendências

- Riscos principais: dupla saída de caixa de comissão (F1/L1/L3); vazamento
  de salário por `finance.read` (L2); auditoria best-effort (L4); folha sem
  testes no Full (não há base para "paridade").
- Não verifiquei por execução: F5 (concorrência), F10 (cancelamento de venda)
  e qualquer comportamento em runtime — apenas leitura de código.
- Não analisei: front-end do Lite (nenhuma tela de folha existe), `imports.ts`,
  `sale-costs.ts` (impacto de custo de venda no cálculo gerencial de custos),
  nem integração com a frente de aprovações de vendas.
- Requisitos legais (INSS, FGTS, IRRF, férias, 13º, eSocial): **fora**;
  exigiriam validação especializada e fontes oficiais atuais.
- Dependências externas deste relatório: relatório do OpenCode (CEP) e o
  desenho do Codex (motor de comissões, perfil financeiro, competência).

## 12. Encerramento

- Relatório: `D:/travel-platform/.claude/RELATORIO-LITE-FOLHA-2026-10-22.md`.
- **HOLD para implementação** até: consolidação com os outros relatórios,
  respostas a Q1–Q4 e Q8, aprovação do desenho e autorização explícita para
  migrações/código/instalação.
- Nenhuma mensagem enviada a outros agentes; o humano encaminha.
