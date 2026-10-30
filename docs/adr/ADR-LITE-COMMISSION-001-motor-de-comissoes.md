# ADR-LITE-COMMISSION-001 — Motor de comissões versionado do Travel Lite

- Status: **Proposta** (não aceita; depende de aprovação do usuário). Fases 1 a 4 já estão implementadas em código local
  (não publicado); a aceitação do ADR continua pendente. Ver estado em `COMMISSION-ENGINE-SPEC.md` (cabeçalho e seção 12).
- Data: 2026-10-22
- Contexto detalhado: `docs/travel-lite/COMMISSION-ENGINE-SPEC.md`

## Contexto

A regra de comissão do Lite hoje é um conjunto de colunas no vendedor, sem
vigência, categoria, faixas ou metas; a regra é congelada em `rule_snapshot` na
confirmação da venda. O usuário pediu várias regras por vendedor/categoria/
vigência, progressividade opcional, revisão retroativa auditada, exigência de
recebimento por forma de pagamento e integração com folha.

## Decisão proposta

1. Regras passam a ser **entidades versionadas append-only**
   (`commission_rules` + `commission_rule_versions` + faixas), com vigência,
   autor, data da revisão e motivo; seleção **determinística** sem sobreposição.
2. O direito de comissão é **imutável**; mudanças (inclusive retroativas) são
   **lançamentos de ajuste** idempotentes por `(comissão, versão)`; pagamentos
   anteriores nunca são sobrescritos.
3. A escolha de como a exigência de recebimento afeta metas/liberação é um
   **perfil financeiro global da agência** versionado, sem override por
   vendedor/regra/venda/usuário.
4. Retroatividade exige prévia, confirmação explícita, reautenticação do
   aprovador e auditoria obrigatória (fail-closed).
5. A folha **referencia** comissões; a obrigação financeira é única por direito.

## Consequências

- Mais tabelas e migrações aditivas; campos de regra em `sellers` tornam-se
  legado e são migrados para a versão inicial.
- Cálculo reprodutível (insumos + versão do algoritmo gravados).
- Custo: complexidade de seleção de vigência e de prévia/ajustes; mitigada por
  fases e testes (spec §9–§10).

## Alternativas consideradas

- Manter regra no vendedor e adicionar colunas: não suporta vigência/histórico.
- Recalcular comissões ao mudar a regra: viola preservação do original.
- Override de exigência de recebimento por vendedor: rejeitado pelo usuário.
