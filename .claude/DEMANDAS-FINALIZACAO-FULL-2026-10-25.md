# Demandas para finalizar o Full (comissões em primeiro) — 25/10/2026

Fonte: levantamento do Codex (somente leitura, `.claude/codex-pendencias-out.txt`, linhas 8189-8343) sobre o checkout atual. Testes citados são históricos, não reexecutados pelo Codex. Escopo: **só Full**; Lite depois da aprovação do Full.

## Ambiente de teste no ar (local, descartável)
- Agência Full: http://127.0.0.1:5183 (API 4100), banco `travel-full-teste-20261025` porta 55644, 110 migrations. Acesso: `Documents\Travel-Full-Demo\Acesso-local-Full-TESTE-comissoes.md`. Demo (5173/55438) e Gadotti intocados.
- Só há agência, 4 usuários e 15 clientes (seed de demonstração quebrou em `wishes`). Falta massa de comissões (funcionário, categoria, regra, venda).

## Decisões de comissões (recomendação do Codex; aguardando aceite do usuário)
1. Meta: venda x recebimento. Rec.: `SOMENTE_LIBERACAO` conta venda; `META_E_LIBERACAO` conta recebimento proporcional (definir mês).
2. Faixas: marginal (por partes) x sobre o total x só excedente. Rec.: manter marginal atual, opções distintas e explícitas.
3. Venda sem forma de pagamento: bloquear. Rec.: confirmar bloqueio (já no código).
4. Folha: só comissão 100% liberada; parcial vai por avulso. Rec.: confirmar para o 1º teste.
5. Estorno de recebimento: Rec.: implementar estorno controlado antes de declarar paridade financeira; bloquear reversão que deixe pago > liberado.
6. Arredondamento 0,55 (antigo) x 0,56 (novo): Rec.: preservar histórico, novo motor só em cálculos futuros com data de corte.
7. Mudar a regra de recebimento: Rec.: congelar a política na obrigação já gerada; mudanças só futuras.
8. Venda antiga inserida depois: Rec.: não recalcular cálculos fechados; ordem estável de continuidade.
9. Receita do fornecedor: por venda x lotes. Rec.: política explícita por configuração, sem calendário presumido (hoje não há lotes).
10. Lite: manter agências existentes em `SOMENTE_LIBERACAO`. Não bloqueia o teste do Full.

## Demandas (ordem)
1 Contrato mínimo de comissões (Claude, doc) · 2 Grants das migrations 103/104/108/109 (Codex) · 3 Encerrar Onda D e restrição de pessoal na receita (Codex) · 4 COM-01 ciclo completo + PENDING_RULE (Claude) · 5 Metas e COM-02 (Claude) · 6 COM-03 e canais, estorno (Codex) · 7 Comissões pela tela (Claude) · 8 Lotes de receita (Claude) · 9 Receita e projeções na UI (Claude) · 10 IMP-01 "a completar" na listagem + dashboard consumindo widgets (Claude) · 11 Escopo mínimo BAK-01 (Codex) · 12 Integração, gates, 4 suítes isoladas, roteiro (Codex).

## Bloqueantes técnicos para o teste completo
Grants (103/104/108/109 só na fixture), comissão exposta na consulta de receita, Onda D sem gates, fluxo novo de comissões sem tela, `PENDING_RULE` sem resolução, `META_E_LIBERACAO` sem efeito. Backup: 134 tabelas pendentes.

## Execução (25/10/2026)
- Decisões 1-10 aceitas pelo usuário e registradas em `docs/decisions/DEC-008-comissoes-primeiro-teste-full.md` (demanda 1 concluída).
- Demandas 2+3 enviadas ao Codex (workspace-write; prompt `.claude/codex-demanda-2-3-prompt.txt`, saída `.claude/codex-demanda-2-3-out.txt`). Aguardando; diff será revisado antes do aceite.
- Demanda 4 (parte 1, feita): `generateVersionedCommission` resolve `PENDING_RULE` no mesmo registro quando surge regra, e é idempotente sem regra (antes: 409). Teste novo em `commission-accrual-http.test.ts`: 18/18. Pendente da 4: convivência com motor por produto/passageiro e tipos de UI com `PENDING_RULE`.

## Atualização (25/10/2026, ~09:10)
- Demandas 2+3 (Codex) entregues e revisadas: migration `111_grants_103_104_108_109.sql` (aplicada e conferida no banco de teste 55644), restrição de pessoal em `getSaleRevenue`, teste `agency-revenue-restriction.test.ts` (27/27 nas duas suítes unitárias). Itens 1-8 da Onda D confirmados no código com teste. Lacunas do Codex: `AgencyRevenuePage.tsx:173` assume comissão presente; faltam testes de motivo >128, reativação mantendo PENDING_RULE e `mark-paid` idempotente. `database.integration` e `agency-revenue.integration` rodando em série (`.claude/imp-db1.log`, `imp-db2.log`).
- Tela "Regras de comissão" do Full (apontada pelo usuário: progressiva abria um campo de texto): reescrita com o mesmo editor do Lite — faixas em linhas (até R$ / %), adicionar/remover faixa (2 a 10), tipo percentual/fixo/sem regra, "só sobre o excedente" com limite, e "Nova revisão" com motivo obrigatório. Testes da página 6/6.

## Demanda 4B (incluída a pedido do usuário em 25/10/2026, logo após a 4)
**Tela de cadastro de condições de pagamento (Full).** Hoje `payment_conditions` (migration 105) e `GET/POST /payment-conditions` existem, mas a UI só lista e escolhe (`SalePaymentPanel`); `lib/api.ts` não tem criar/editar.
- Escopo: UI `apps/agency/src/pages` (nova página/aba de condições) + `lib/api.ts` (criar, listar todas, revisar/desativar) + rota/menu; API só se faltar PUT/desativação (versão, sem apagar histórico).
- Campos: nome; tipo (à vista / parcelas iguais / entrada + saldo); máx. de parcelas; parcela mínima; sem juros; entrada (nenhuma / % / valor) e se é obrigatória; prazo do saldo (âncora data da venda ou início da viagem + dias, ex.: -15); aceita pagamentos parciais; ativa.
- Pronto quando: administradora cria "Excursão 10x mín. R$100" e "Entrada 30% + saldo até 15 dias antes do embarque" pela tela, escolhe na venda, e o cronograma e as baixas refletem; testes de componente e de API; cenário da excursão R$1.000 de ponta a ponta (cartão 10x; boleto/Pix 30% + R$700 em baixas parciais).
- Executor: Claude. Depende da 4 (resto) apenas por ordem; arquivos disjuntos.
