# PROMPT CODEX — Comissão por fornecedor (receita real da agência) e comissão do funcionário derivada dela

Modo workspace-write. Você é o ÚNICO escritor no checkout `D:/travel-platform`. Execute TUDO em sequência, sem parar para perguntas, com testes a cada demanda. Se o limite de uso cortar, o trabalho já gravado em arquivos deve estar coerente (typecheck/lint verdes dos arquivos tocados antes de passar à demanda seguinte) e o relatório deve dizer exatamente onde parou.

Leia antes: `AGENTS.md`, `docs/decisions/DEC-008-comissoes-primeiro-teste-full.md`, `artifacts/full-finalization/RELATORIO-FINALIZACAO-FULL-2026-10-25.md`, `docs/AJUSTES-23-10-2026-GADOTTI.MD`, `services/api/src/agency-revenue*.ts`, `commission-rule-versions.ts`, `commission-calculation.ts`, `commission-release*.ts`, `payroll.ts`, `suppliers.ts`, `apps/agency/src/pages/{SuppliersPage,AgencyRevenuePage,CommissionRulesPage,PayrollPage,DashboardPage}.tsx`.

## O princípio de negócio (fonte: o usuário, dono do produto)
Agência de viagens REVENDE serviços. O valor cheio da venda NÃO é dinheiro da agência: serve para metas, discussões e histórico. O que entra na contabilidade da agência é a COMISSÃO que o fornecedor paga. O funcionário também ganha por comissão, calculada sobre o valor vendido (ex.: 1% de R$10.000 = R$100), mas esse valor SAI da comissão que a agência recebeu do fornecedor (ex.: 10% de R$10.000 = R$1.000; sobram R$900). O funcionário NÃO sabe quanto a agência ganha; só sabe quanto ele vai ganhar.
Cada FORNECEDOR tem seu acordo: percentual (ex. 10%) ou fixo (ex.: viagem intermunicipal diária paga valor fixo por passageiro) ou sobre parte do produto (ex.: cruzeiro MSC: R$12.000 de pacote, mas a comissão incide só sobre as TAXAS de R$4.000); e QUANDO recebe: na confirmação da venda, na quitação (todas as parcelas) ou até X dias antes da viagem; o fornecedor pode pagar em datas aleatórias (lotes/janelas já existem). O dono da agência também pode unificar a DATA em que paga as comissões dos funcionários.

## O que já existe (aproveite, não duplique)
- Receita da agência: `agency_revenue_scopes/rule_versions/entries` (migration 106) com supplier/product/category, modos PERCENTAGE e FIXED_PER_PASSENGER/SALE/ITEM, bases LINE_TOTAL/NET_FARE/TAXES/FEES/TAXES_AND_FEES/MARGIN, evento de direito ON_SALE_CONFIRMATION/ON_FULL_SETTLEMENT/ON_BALANCE_DEADLINE, modelo AGENCY_COLLECTS/SUPPLIER_COLLECTS, lotes/janelas (114), API `/agency-revenue/*`, tela `AgencyRevenuePage`.
- `sale_items` têm `unit_price` (tarifa), `taxes`, `fees`, `discount`, `supplier_id`, `line_total`.
- Comissão do funcionário: regras versionadas (107/112), atribuição, liberação por recebimento (108), estorno (113), folha, avulso.
- UI: popup com abas é o layout aprovado pelo usuário (manter o padrão visual).
## O que FALTA (lacunas confirmadas no código)
1. O cadastro do fornecedor (`SuppliersPage`, `suppliers.ts`) NÃO tem área de comissão. A negociação só é configurável em `AgencyRevenuePage`, solta, sem ligação ao fornecedor.
2. Regras de comissão do funcionário só têm escopo funcionário/categoria; não há dimensão fornecedor, nem base “valor vendido do fornecedor”, nem vínculo com a receita que a agência recebeu.
3. Não existe política de DATA de pagamento das comissões dos funcionários (unificar: dia fixo do mês / janela de fechamento).
4. Painéis/relatórios mostram “Vendas (mês)” (volume bruto) como indicador principal e não separam volume (meta) × receita da agência × caixa recebido × custo de comissões.

## DEMANDAS (nesta ordem)

### S1 — Área “Comissão” no cadastro do fornecedor
- No popup/edição do fornecedor (abas): **Dados | Comissão da agência | Regras por produto/categoria | Histórico**. Na aba de comissão: tipo (percentual / fixo por passageiro / fixo por venda / fixo por item / sem comissão); base (valor total do item, tarifa líquida, taxas, tarifas+taxas, margem — com rótulos em português e ajuda com o exemplo do cruzeiro); valor; quando recebe (na confirmação da venda / na quitação / até X dias antes da viagem — campo de dias); quem cobra (agência cobra do cliente e repassa / fornecedor paga a agência); vigência com revisão e motivo (nunca apaga a anterior); prazo/lote de pagamento do fornecedor (usar a política de lotes existente, sem inventar calendário).
- Sobreposições: regra do fornecedor + produto/categoria vence a do fornecedor geral (a hierarquia já existe em 106; confirme e documente a ordem na tela).
- Reaproveite `/agency-revenue/rules` (supplierId) e o serviço de versões; crie rotas finas por fornecedor só se necessário (`GET/POST /suppliers/:id/commission-terms`), com permissão ADMIN para escrever e MANAGER+ para ler; nunca aceitar agency_id do cliente; auditoria já existente.
- Venda: no item da venda os valores **tarifa, taxas e demais componentes** ficam em destaque (campos e subtotais visíveis), pois a base da regra pode ser só taxas. Garanta que o cálculo da receita use exatamente esses campos (teste: cruzeiro MSC pacote 12.000 = tarifa 8.000 + taxas 4.000; regra 10% base TAXES → receita 400,00, não 1.200).
- Fornecedor sem acordo cadastrado: a venda cria receita `PENDING_RULE` com aviso claro na lista de fornecedores (“sem acordo de comissão”).

### S2 — Comissão do funcionário herdando a negociação do fornecedor
- Adicionar dimensão **fornecedor** ao escopo da regra do funcionário (migration nova 116+, aditiva, GRANT na migration e em `002_prepare_local_roles.sql`, listas esperadas, `tenant-backup` BACKUP_TABLES): hierarquia funcionário+fornecedor > funcionário+categoria > funcionário > fornecedor padrão > categoria > padrão da agência (documente e teste a ordem).
- Nova base de cálculo `SUPPLIER_SOLD_TOTAL`: percentual (ou fixo) sobre o total VENDIDO daquele fornecedor na venda (soma dos `line_total` dos itens do fornecedor), não sobre o total da venda inteira que pode ter vários fornecedores. Snapshot completo do cálculo (memória) na entrada de comissão.
- Opção por regra “pagar só depois que o fornecedor pagar a agência” (`release_after_supplier_payment`): a parcela liberada ao funcionário fica limitada à proporção da receita da agência já `RECEIVED` para aquela venda/fornecedor; sem a opção, vale a liberação por recebimento do cliente que já existe (DEC-008).
- Trava de custo: a comissão do funcionário calculada sobre um fornecedor não pode superar a receita da agência dos mesmos itens sem aviso: configuração por agência `WARN` (padrão: marca a entrada e mostra “acima da receita”) ou `BLOCK` (409 `COMMISSION_EXCEEDS_AGENCY_REVENUE`). Exemplo base: venda 10.000, fornecedor 10% = receita 1.000; funcionário 1% = 100; resultado da agência 900.
- **Privacidade (crítico):** nenhuma resposta destinada ao funcionário (`/commissions/mine`, telas do AGENT/VIEWER) pode conter receita da agência, percentual do fornecedor ou diferença. Teste HTTP negativo para cada papel.
- Tela `CommissionRulesPage`: escolher fornecedor opcional, base “valor vendido do fornecedor”, opção “aguardar pagamento do fornecedor”.

### S3 — Data unificada de pagamento das comissões dos funcionários
- Configuração por agência (e override por funcionário), versionada/append-only: `PER_ENTRY` (padrão, como hoje) | `FIXED_DAY` (todo dia N do mês paga tudo que já estiver liberado até o corte) | `WINDOW` (dia de fechamento + dias para pagar, igual à ideia dos lotes de receita). Cada entrada liberada recebe `expected_pay_date` calculada pela política vigente.
- A folha/“Gerar pagamentos” agrupa as comissões liberadas até o corte numa data única; pagamento avulso continua possível para exceções (um canal por obrigação, DEC-008). Projeções (`commissions-projection`) passam a usar `expected_pay_date`.
- UI: aba “Pagamento das comissões” em Configuração financeira e coluna “previsão de pagamento” na folha.

### S4 — Volume × receita × caixa × custo (relatórios e painel)
- Rotular e separar em todas as telas e CSVs: **Volume vendido** (metas/histórico), **Receita da agência** (comissão dos fornecedores: contratada/prevista/disponível/recebida), **Caixa recebido** (dinheiro realmente recebido), **Comissões de funcionários (custo)** e **Resultado** (receita − custo). Troque “Vendas (mês)” por “Volume vendido (mês)”, com dica de que não é receita; adicione os KPIs de receita da agência e custo de comissões no painel (widgets e configuração do painel). Nunca somar volume bruto com receita.
- Relatório por fornecedor: volume, receita esperada × recebida, diferença, comissão paga a funcionários, resultado (reaproveitar `supplier-balances`/projeções). Filtros existentes (data da venda, viagem, origem, destino, categoria, fornecedor, funcionário, status) + CSV.
- Metas continuam usando o volume vendido (decisão 1 da DEC-008 não muda).

### S5 — Exemplos obrigatórios (viram testes e dados do ambiente)
1. Fornecedor A: 10% sobre o total; recebe na confirmação; venda 10.000 → receita 1.000; funcionário 1% do total do fornecedor → 100; resultado 900; funcionário NÃO vê 1.000.
2. MSC Cruzeiros: 10% base TAXES, recebe na quitação; pacote 12.000 (tarifa 8.000 + taxas 4.000) → receita 400 só na quitação; comissão do funcionário 1% sobre o vendido do fornecedor (12.000) = 120 com trava de custo `WARN` (120 < 400, OK) e outro caso em que excede e marca “acima da receita”.
3. Rodoviário intermunicipal: fixo por passageiro (ex.: R$ 30), 3 passageiros → 90; recebe até 15 dias antes da viagem.
4. Aéreo com dois fornecedores (5% e 8%) na mesma venda: receita por item/fornecedor correta, sem dupla contagem; comissão do funcionário só sobre o fornecedor da regra.
5. Fornecedor paga em lote: receita AVAILABLE no fechamento da janela e RECEIVED no recebimento do lote; funcionário com `release_after_supplier_payment` só libera depois disso.
6. Política FIXED_DAY (dia 10): comissões liberadas até o corte viram uma data única de pagamento; avulso excepcional respeita o canal único.
7. Estorno de recebimento do cliente: receita/comissão recompõem sem apagar histórico.

## TESTES E EXECUÇÃO (peça nesta ordem, sem parar)
- Por demanda: testes unitários (cálculo), HTTP (permissões, privacidade, isolamento entre agências), componente (UI) e de banco (escritos; rode se o sandbox permitir).
- Seu sandbox já alcançou 127.0.0.1:4100 (API de teste) e 127.0.0.1:55644 (PostgreSQL descartável `travel_platform_teste`, usuário `teste_admin`, senha `teste_admin_local`) na última rodada. Use Bun (`bun --no-env-file`). Para aplicar migrations novas: cliente `pg` contra 55644 (só migrations NOVAS, nunca editar existentes). Para recompilar e reiniciar a API de teste: `bun --no-env-file node_modules/typescript/bin/tsc -p services/api/tsconfig.build.json` em `services/api`, encerrar os PIDs de `.tmp/full-teste-pids.json` e subir de novo com `.tmp/full-teste-start.cjs`. Se algo disso for bloqueado, deixe o comando exato no relatório.
- Estenda `artifacts/full-finalization/seed-full-teste.cjs` (idempotente) e `e2e-full-teste.cjs` com os 7 exemplos acima, fornecedores reais de teste (MSC Cruzeiros, rodoviária intermunicipal, duas cias aéreas, hotel) com acordos preenchidos, regras de funcionário ligadas a fornecedor e a política de pagamento; atualize `COBERTURA-DADOS-FULL-TESTE.md`. Nenhuma tela de fornecedor/comissão/receita pode ficar sem dados.
- Rode ao final: tsc (api, agency), eslint, vitest unitário/componente completos de `services/api` (arquivos sem banco) e `apps/agency`, builds e o e2e. Corrija o que falhar (sem enfraquecer segurança).
- Limites: só o Full e o ambiente de teste (4100/5183/55644). NÃO toque em Lite, demo (55438/5173), Gadotti, Supabase, Render, Vercel, `.env`. Sem commit, push, deploy.
- Relatório final: `artifacts/full-finalization/RELATORIO-COMISSAO-FORNECEDOR-2026-10-25.md` (a pasta `.codex/` recusou escrita antes): por demanda, arquivos, migrations, comandos executados com resultado, o que ficou NÃO EXECUTADO (com comando) e decisões suas em uma linha cada.
