# DEC-008 — Comissões: decisões para o primeiro teste do Full

Status: aceita pelo usuário em 2026-10-25 (aceite integral das 10 recomendações do levantamento Codex em `.claude/DEMANDAS-FINALIZACAO-FULL-2026-10-25.md`). Escopo: Full; o Lite recebe o contrato depois da aprovação do Full (DEC-007).

| # | Decisão |
|---|---|
| 1 | Perfil financeiro `SOMENTE_LIBERACAO`: a meta conta a venda confirmada. `META_E_LIBERACAO`: a meta conta o recebimento proporcional, no mês em que o recebimento ocorre. |
| 2 | Faixas progressivas permanecem **marginais** (taxa maior só na parte da faixa). "Sobre o total" e "só excedente de um limite" são modos distintos e explícitos; nenhum é apresentado como o outro. |
| 3 | Venda sem forma de pagamento informada: comissão **BLOQUEADA** (409 `COMMISSION_RELEASE_POLICY_MISSING`), com orientação para completar. |
| 4 | Folha só recebe comissão 100% liberada. Liberação parcial segue pelo canal avulso. Um canal por obrigação. |
| 5 | Implementar estorno controlado de recebimento no Full. Reversão que deixe pago > liberado é bloqueada (409) até existir ajuste aprovado. Auditoria obrigatória. |
| 6 | Histórico preservado (0,55 no motor antigo). O motor novo (0,56, meia-unidade para longe de zero) vale só para cálculos futuros, a partir de uma data de corte configurada. Nada é recalculado automaticamente. |
| 7 | A política de liberação é **congelada** na obrigação no momento da geração (`release_policy_snapshot`). Mudanças valem só para obrigações futuras. |
| 8 | Cálculos fechados não são recalculados por venda antiga inserida depois. Ordem de continuidade estável por `seq` da atribuição. |
| 9 | Receita do fornecedor: política configurável por agência (por venda ou em lotes/janelas), sem calendário presumido. Sem política = comportamento atual (por venda). |
| 10 | Lite: agências existentes ficam em `SOMENTE_LIBERACAO` quando o contrato for incorporado. |

Consequências: o serviço de liberação deve ler o snapshot da obrigação (decisão 7) e não a configuração atual; a lista de demandas do Full está no documento de acompanhamento.
