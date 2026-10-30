# Travel Lite — Especificação do motor de comissões

Status (atualizado em 2026-10-22, após a revisão do Codex): documento **vivo**.
As seções 1 a 11 são o desenho original; a **seção 12 e a tabela abaixo** dizem o que
está implementado e o que mudou. Em caso de conflito, vale a seção 12.

| Item | Estado |
| --- | --- |
| Fase 1 (roundMoney, cancelar payable de comissão) | implementada |
| Fase 2 (regras versionadas, tela) | implementada |
| Fase 3 (progressão por faixas de meta mensal) | implementada |
| Fase 4 (liberação por forma de pagamento) | implementada |
| Fase 5 (revisão retroativa com prévia/reautenticação/ajustes) | **não implementada** |
| D7 (bônus e teto), D8 (ajuste negativo / recuperação) | **não implementados** |
| Folha gerencial do Lite, fila de aprovação de venda | **não implementadas** (outras frentes, HOLD) |
| Perfil financeiro global (seção 4) | **descartado** por decisão do usuário (12.3); aguarda confirmação do usuário, não verificada pelo Codex |
| ADR-LITE-COMMISSION-001 | **Proposta** — não aceita |

Decisões marcadas **ABERTO** nas seções 1 a 11 que não aparecem na seção 12 continuam sem resposta. Complementa `ACCESS-CONTROL.md` e
`COSTS-AND-MARGIN.md`; decisão arquitetural em
`docs/adr/ADR-LITE-COMMISSION-001-motor-de-comissoes.md` (proposta).

Origem das regras: decisões do usuário registradas em
`.claude/COORDENACAO-LITE-FINANCEIRO-2026-10-22.md` e relatório de folha
`.claude/RELATORIO-LITE-FOLHA-2026-10-22.md`. Mudanças já entregues que esta
spec pressupõe: comissão só `PAID` na quitação total do payable, auditoria
obrigatória em eventos financeiros e unicidade de payable por comissão
(`migrations-travel-lite/008`).

## 1. Estado atual (verificado no código)

- A regra vive **no vendedor**: `sellers.commission_rule_type`
  (`UNDEFINED|PERCENTAGE_ON_GROSS|PERCENTAGE_ON_MARGIN|FIXED`), `commission_rate`,
  `commission_fixed_amount` (`001_initial_schema.sql:107-123`). Uma regra por
  vendedor, sem vigência, categoria, faixa ou meta.
- Na confirmação da venda (`routes/sales.ts:310-376`) a regra do vendedor é lida
  e **congelada** em `seller_commissions.rule_snapshot`; regra futura não
  recalcula (`001…sql:206-207`). Sem regra → `PENDING_RULE`.
- Percentual = pontos percentuais (`amount = round(base × taxa)/100`,
  `sales.ts:346`), base bruta ou margem.
- Ciclo: `PENDING → APPROVED (cria payable) → PAID (quitação)`; `CANCELLED`.
  Uma comissão ativa por venda+vendedor (`ux_seller_commissions_active`).
- Forma de pagamento (`payment_methods`) é só nome/ativo/ordem: **não há
  atributo "exige recebimento"**. Não há perfil financeiro da agência.
- Lacuna conhecida: cancelar venda marca a comissão `CANCELLED`
  (`sales.ts:749-753`) mas **não cancela o payable já criado**; o payable
  continua pagável. Deve ser tratada na Fase 1 (§10).

## 2. Princípios

1. **Direito de comissão imutável**: o cálculo original e a regra aplicada são
   preservados; mudanças viram **lançamentos de ajuste** rastreáveis, nunca
   UPDATE do valor original.
2. **Uma obrigação por direito**: a comissão tem no máximo um payable ativo;
   ajuste positivo posterior gera obrigação complementar própria, ligada ao
   ajuste (ver §7).
3. **Servidor decide**: tenant, vendedor, regra, vigência e valores nunca vêm do
   cliente; o cliente envia apenas intenção (ex.: criar revisão de regra).
4. **Falha fechada**: sem regra aplicável → `PENDING_RULE` (nunca R$ 0 válido,
   como hoje); sem perfil financeiro → comportamento atual (desacoplado).
5. **Incremento de 3% para 4% = +1 ponto percentual**, nunca ×1,01.

## 3. Modelo de regras

### 3.1 Entidades (propostas; migração futura)

- `commission_rules` — identidade estável da regra: `tenant_id`, `seller_id`
  (nullable = regra padrão da agência: **ABERTO** D1), `category_id` (nullable =
  todas), `name`, `status` (ATIVA/ARQUIVADA).
- `commission_rule_versions` — **append-only**; uma por revisão:
  `rule_id`, `effective_from` (data de início da vigência), `effective_to`
  (derivada/nula), `revised_at`, `revised_by`, `reason`, `calculation_base`
  (`GROSS|MARGIN`), `mode` (`PERCENTAGE|FIXED`), `value` (padrão), `apply_on`
  (`TOTAL|EXCESS`, padrão `TOTAL`), `progressive` (bool),
  `goal_period` (§3.4), `bonus_policy`, `cap_amount` (**ABERTO** D7).
- `commission_rule_tiers` — só quando `progressive`: `version_id`, `from_amount`,
  `to_amount` (nulo = sem teto), `mode`, `value`, `increment_points` (pontos
  percentuais adicionais por faixa/degrau — nome explícito para evitar a
  leitura de aumento relativo).
- Os campos de regra em `sellers` (`commission_*`) passam a **legado**: migração
  cria a versão inicial equivalente (vigência na data da migração, sem
  retroatividade) e a leitura passa a usar o motor. Remoção só em migração
  posterior, após validação.

Linha inicial = valor padrão (percentual ou fixo). Marcar "progressivo" revela
faixas, metas e incrementos (UI); salvar sem marcar ignora/rejeita campos de
progressão (validação no servidor).

### 3.2 Seleção da regra (determinística)

Para venda confirmada em `D` (data-base: **ABERTO** D2 — recomendação:
`sale_date` da confirmação): candidatas = versões do vendedor com
`effective_from ≤ D` e (`effective_to` nulo ou `> D`), `category` = da venda ou
nula. Precedência: (1) vendedor+categoria; (2) vendedor sem categoria;
(3) padrão da agência+categoria; (4) padrão da agência. Empate no mesmo nível
é erro de configuração **impedido na gravação** (sem sobreposição de vigência
no mesmo escopo, garantido por constraint/exclusion + validação).

### 3.3 Cálculo

- Base: `GROSS` ou `MARGIN` (como hoje).
- `TOTAL`: taxa/valor aplicado sobre o total da base.
- `EXCESS`: aplicado só sobre a parcela acima do limiar da faixa/meta.
- Progressivo por faixa: valor acumulado do período de meta determina a faixa.
  **ABERTO** D3: faixa vale para (a) a venda inteira que cruzou o limiar, ou (b)
  fatiada marginalmente (parte em cada faixa). Recomendação: (b) marginal para
  `EXCESS`; para `TOTAL`, a faixa atingida aplica-se ao acumulado
  (recalculando diferença como ajuste, §6).
- Arredondamento: **ABERTO** D4 — recomendação: half-up em centavos, uma
  função única `roundMoney`, aplicada uma vez por componente (nunca em soma
  de componentes já arredondados sem registrar). Hoje o Lite arredonda
  ad hoc (`sales.ts:346`).
- Resultado gravado com **todos os insumos**: versão da regra, base, faixas
  tocadas, valores intermediários, `calc_version` (versão do algoritmo), para
  reprodutibilidade.

### 3.4 Período de meta e competência (ABERTO — bloqueante)

- D2: data-base da venda para vigência e período (confirmação, `sale_date`,
  liberação por recebimento).
- D5: período da meta (mês civil, trimestre, janela móvel) e se vendas que
  atravessam meses contam no mês da confirmação ou do recebimento.
  Recomendação: mês civil da data-base de D2.
- Acumulação de bônus, teto (`cap`) e conflito entre regras: D7. Recomendação:
  bônus de meta soma-se; teto aplica-se ao total do direito da competência;
  conflitos já eliminados pela seleção determinística (§3.2).

## 4. Perfil financeiro da agência

Tabela `tenant_financial_profiles` (uma linha ativa por vigência), **global da
agência, sem override por vendedor/regra/venda/usuário**:

| Campo | Valores |
| --- | --- |
| `receipt_requirement_effect` | `META_E_LIBERACAO` \| `SOMENTE_LIBERACAO` |
| `effective_from`, `revised_by`, `revised_at`, `reason` | rastreio (append-only) |

- A **forma de pagamento** continua definindo *se* há exigência de recebimento:
  novo atributo `payment_methods.requires_receipt` (bool, padrão `false`;
  nunca inferido de Cartão/Pix/Boleto — é configuração).
- `META_E_LIBERACAO`: venda com forma que exige recebimento só entra no
  acumulado da meta (e na liberação) quando/na proporção recebida.
- `SOMENTE_LIBERACAO`: a meta acompanha vendas **confirmadas**; a exigência
  afeta só quando a comissão fica disponível para aprovação.
- Alterar o perfil exige: nova vigência futura (ou retroativa com §6), prévia
  de impacto, motivo, reautenticação e auditoria obrigatória; **não altera
  silenciosamente** comissões ou períodos existentes.

### 4.1 Política de recebimento (ABERTO D6 — bloqueante para implementar)

A coordenação pede explicitar antes de codar: recebimentos **parciais**,
**parcelas** e **estornos**. Opções para a liberação:

- A. Proporcional: libera `comissão × recebido/total` a cada recebimento.
- B. Total: só libera após quitar todas as parcelas.
- C. Por parcela: cada parcela recebida libera a fração da sua parcela.

Recomendação: **A** (reaproveita `receivables.paid_amount`). Estorno de
recebimento (`finance.ts` `reversePayment`) **reduz** a parte liberada; se já
foi aprovada/paga, gera ajuste negativo/saldo a recuperar, nunca apaga o pago.
Vencimento de boleto **não** é recebimento — só baixa efetiva conta.

## 5. Ciclo de vida do direito

`PENDING_RULE → PENDING → (liberação) → APPROVED (payable) → PAID`, mais
`CANCELLED`. Novos conceitos (proposta): campo de **liberação** separado do
status (`released_amount`, `released_at`) para a política de §4.1, sem
multiplicar status. Aprovação continua exigindo `commissions.approve`;
pagamento `commissions.pay`. Cancelamento de venda **cancela também o payable
em aberto** (Fase 1); se há pagamento parcial/total, vira ajuste negativo
(§6) e exige decisão (D8: recuperar do vendedor ou perda da agência).

## 6. Revisão de regra, retroatividade e ajustes

- Nova versão com `effective_from` futuro: afeta só vendas confirmadas a partir
  da vigência. Sem efeito nas existentes.
- **Retroatividade** (`effective_from` ≤ hoje, vendas já com direito): fluxo em
  duas etapas — (1) **prévia** (somente leitura) listando vendas/direitos
  afetados, valor original, novo valor e diferença por direito, totais por
  vendedor e por status (pendente/aprovado/pago); (2) **confirmação** com
  motivo obrigatório, confirmação explícita, **reautenticação do próprio
  aprovador** (credencial dele; não senha compartilhada) e auditoria
  obrigatória. A confirmação revalida que a prévia não mudou (token de prévia
  / hash do conjunto) para evitar executar sobre dados alterados.
- Efeito: **nunca sobrescreve** `commission_amount` original nem pagamento.
  Cria `commission_adjustments` (append-only): `commission_id`, `rule_version_id`,
  `delta_amount` (±), `reason`, `created_by`, `reason_ref` (revisão), com índice
  único `(commission_id, rule_version_id)` para **idempotência** (reexecutar a
  mesma revisão não duplica). Valor reconhecido = original + soma dos ajustes.
- Direito `PENDING/APPROVED` sem payable pago: ajuste altera o que será pago.
  Com payable parcial/pago: delta positivo → **obrigação complementar** (payable
  próprio ligado ao ajuste); delta negativo → saldo a compensar em pagamentos
  futuros do vendedor (D8), sem estorno automático de pagamento.
- Períodos fechados (§ folha) e obrigações aprovadas não são reescritos; a
  diferença entra na competência corrente.
- Concorrência: `SELECT … FOR UPDATE` no direito e na versão; transição de
  versões com exclusão de sobreposição no banco.

## 7. Integração com folha (contrato de §6 do relatório de folha)

O motor expõe por direito: `commission_id`, beneficiário, competência (D2),
`recognized_amount` (original+ajustes), `paid_amount`, `balance_amount`,
`obligation_id(s)`, status. A folha **referencia, não paga nem recalcula**;
mesma comissão no máximo uma vez na folha (índice único por `source_id`).
Pagamento sempre pelo payable da comissão; comissão nunca é despesa duas
vezes (DRE usa a fonte comissão).

## 8. Segurança, auditoria, permissões

- Leitura/gestão: reutilizar `commissions.read_all/read_own/approve/pay`;
  **novas**: `commissions.rules.manage` (criar/revisar regras), 
  `commissions.rules.retroactive` (confirmar retroatividade, `master_only`),
  `finance.profile.manage` (perfil financeiro, `master_only`). Catálogo exige
  migração + `access.ts` + teste espelho (`docs/travel-lite/ACCESS-CONTROL.md`).
- Vendedor vê só o próprio extrato e regras que o afetam (D9: pode ver a regra
  aplicada? recomendação: sim, a própria).
- Auditoria **obrigatória** (`REQUIRED_AUDIT_EVENTS`) para: criar/revisar
  regra, prévia gerada (metadados), confirmação de retroatividade, mudança de
  perfil, ajuste criado, liberação por recebimento. Estender
  `audit-log.ts` com os novos tipos.
- Tenant: `tenant_id` + FK composta + RLS idêntica ao padrão do Lite; nenhuma
  entrada aceita `tenant_id`/`agency_id`.
- Reautenticação: endpoint dedicado que valida a senha do **usuário logado** e
  emite token de curta duração, uso único e vinculado à operação/prévia;
  falhas contam no `rate-limit` existente.

## 9. Testes (cenários sintéticos)

Seleção por vigência/categoria/precedência e rejeição de sobreposição; cálculo
total vs excedente; 3%→4% = +1 p.p.; progressivo com venda que cruza faixa e
virada de mês; arredondamento; `PENDING_RULE`; perfil `META_E_LIBERACAO` vs
`SOMENTE_LIBERACAO` (mesmos dados, resultados distintos); forma que exige
recebimento: parcial, parcelas, estorno de recebimento; revisão futura não
altera existentes; retroatividade: prévia = efeito, execução repetida
idempotente, prévia desatualizada recusada, sem reautenticação recusada,
original preservado, pago preservado, delta positivo/negativo; cancelamento de
venda cancela payable aberto; concorrência (duas confirmações/revisões);
usuário sem permissão; outro tenant (404/RLS); auditoria obrigatória faz
rollback; sem duplicidade de payable por direito/ajuste.

## 10. Plano de entrega (fases; cada fase com testes e sem publicar)

- **Fase 0 (esta)**: aprovar spec e responder D1–D9.
- **Fase 1 — saneamento**: cancelar payable aberto ao cancelar venda; função
  única `roundMoney`; testes. Sem mudança de modelo.
- **Fase 2 — regras versionadas (IMPLEMENTADA no backend; sem UI): migração 009, seleção determinística, TOTAL/EXCESS, espelho do cadastro legado do vendedor, `/commission-rules`. Sem retroatividade (Fase 5). Decisões D1–D9 adotadas conforme recomendação em 2026-10-22.** Original: tabelas §3.1, migração do legado, seleção
  determinística, cálculo `TOTAL/EXCESS`, UI de regras (sem progressão).
- **Fase 3 — progressão e metas**: faixas, incrementos, período de meta.
- **Fase 4 — perfil financeiro e liberação por recebimento**: `requires_receipt`,
  perfil, política D6.
- **Fase 5 — revisão retroativa**: prévia, reautenticação, ajustes.
- **Fase 6 — integração com folha** (depende do relatório de folha aprovado).

Arquivos principais afetados (previstos): `infrastructure/migrations-travel-lite/
009…`, `services/api-lite/src/{access,audit-log,commissions-engine*,rounding}.ts`,
`routes/{sales,commissions,sellers,cash-flow}.ts`, novo `routes/commission-rules.ts`,
`apps/travel-lite/src/*` (regras, extrato, prévia), testes correspondentes.
Migrações são **aditivas**; aplicadas são imutáveis.

## 11. Decisões em aberto (bloqueiam as fases indicadas)

| # | Decisão | Recomendação | Bloqueia |
| --- | --- | --- | --- |
| D1 | Regra padrão da agência (sem vendedor) existe? | sim, como último recurso | F2 |
| D2 | Data-base de vigência/competência | `sale_date` da confirmação | F2 |
| D3 | Faixa: venda inteira vs. marginal | marginal | F3 |
| D4 | Arredondamento | half-up, uma função, por componente | F1 |
| D5 | Período da meta | mês civil | F3 |
| D6 | Liberação: proporcional/total/por parcela | proporcional | F4 |
| D7 | Bônus acumulável, teto, conflito | soma bônus; teto por competência | F3 |
| D8 | Ajuste negativo após pago | saldo a compensar | F5 |
| D9 | Vendedor vê a própria regra | sim | F2 |

## 12. Atualizações de 2026-10-22 (pós-aprovação)

### 12.1 Fase 3 implementada (progressão por faixas de meta mensal)

- Migração `010_commission_rule_tiers.sql`: `commission_rule_versions.progressive` e
  `commission_rule_tiers` (append-only, faixas contíguas começando em 0, última aberta).
- Cálculo marginal (D3): a base acumulada do vendedor no mês civil (D5) é fatiada nas faixas; a
  venda que cruza a meta é dividida entre a taxa antiga e a nova. Comissões anteriores **não mudam**
  (por isso não há ajuste retroativo na progressão). Aumento 3% -> 4% = +1 ponto percentual.
- O acumulado considera as vendas já confirmadas do vendedor no mês (CONFIRMED, PARTIALLY_PAID, PAID),
  restritas à categoria da regra quando ela tem categoria. Vendas canceladas não contam. Trava
  `pg_advisory_xact_lock` por vendedor+mês serializa confirmações simultâneas.
- Snapshot da comissão guarda `slices`, `accumulated_before` e a versão da regra.
- Ainda fora: bônus/teto (D7), conflito entre regras além da precedência, e a contagem por
  recebimento (12.2).

### 12.2 Regra de recebimento é da FORMA DE PAGAMENTO (decisão do usuário, 2026-10-22)

- Se a forma de pagamento da venda tiver a regra "exige recebimento efetivado", a comissão (e a
  contagem para a meta progressiva) só vale sobre o que foi efetivamente recebido.
- Se a forma de pagamento **não** tiver essa regra, a comissão se aplica na efetivação (confirmação)
  da venda, como hoje.
- Estado atual: nenhuma forma tem o atributo (`payment_methods.requires_receipt` ainda não existe),
  então tudo se comporta como "sem regra" (na confirmação). O atributo, a contagem por recebimento
  na meta e a liberação (D6: proporcional ao recebido) entram na Fase 4.
- ABERTO: esta decisão substitui o perfil financeiro global META_E_LIBERACAO / SOMENTE_LIBERACAO
  (§4)? Ou seja, forma com exigência afeta sempre meta e liberação? A spec original mantinha a escolha
  global; aguardando confirmação antes de implementar a Fase 4.

### 12.3 Fase 4 implementada: liberação por forma de pagamento (decisão do usuário, 2026-10-22)

Resposta à pergunta de 12.2: **não existe perfil financeiro global**. O comportamento é:

- **Meta:** sempre conta a venda INTEIRA na confirmação (R$ 50.000 em 10x entra como 50.000, não como
  parcelas de 5.000). O perfil global META_E_LIBERACAO / SOMENTE_LIBERACAO (§4) foi descartado.
- **Valor da comissão:** decidido na confirmação, pela meta atingida (faixas da Fase 3).
- **Liberação do pagamento:** depende da forma de pagamento da venda (`payment_methods.requires_receipt`):
  - marcada: a comissão é paga em parcelas, proporcional ao recebido da venda
    (liberado = comissão x recebido / total dos recebíveis não cancelados);
  - não marcada: a comissão é paga direto sobre o total da venda.
- `seller_commissions.release_mode` (`ON_SALE` | `ON_RECEIPT`) congela a política na confirmação.
- Implementação: um único payable por comissão (`008`); `POST /payables/:id/pay` limita o pagamento ao
  liberado menos o já pago (409 sem nada liberado; 400 se exceder). Estorno de recebimento reduz o liberado;
  se já foi pago além disso, o excedente fica como saldo a compensar (D8, ainda sem fluxo próprio).
- Migração `011_commission_release_by_receipt.sql`. Lista de comissões mostra `release_mode` e `released_amount`;
  Cadastros > Formas de pagamento ganhou a opção "Comissão só é liberada conforme o recebimento".

### 12.4 Correções da revisão do Codex (2026-10-22)

- **Detalhe da venda**: `GET /sales/:id` passou a devolver `customer`, `seller`, `category` e `payment_method` como a listagem.
- **Override de comissão**: só comissões `PENDING`/`PENDING_RULE` podem ser sobrescritas; aprovada, paga ou cancelada devolve 409
  (o ajuste de comissão aprovada depende de lançamentos de ajuste, Fase 5). O override preserva o snapshot original
  (`rule_snapshot` recebe `overridden`, `manual` e `previous_amount`) e a auditoria guarda o valor anterior.
- **Campos legados do vendedor**: `POST/PATCH /sellers` com `commission_*` exigem `commissions.rules_manage`; o espelhamento gera
  auditoria obrigatória (`COMMISSION_RULE_CREATED/REVISED`, `metadata.source = seller_legacy_fields`).
- **Estorno de recebimento**: bloqueado (409) quando liberaria menos do que a comissão `ON_RECEIPT` já paga; nada é revertido.
  A recuperação/compensação (D8) continua pendente — o bloqueio é a medida segura até lá.
- **Arredondamento progressivo**: o valor da comissão é a soma das fatias já arredondadas (memória de cálculo reconcilia com o total).
