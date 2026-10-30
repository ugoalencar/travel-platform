# PROMPT — Finalizar o Full (comissões, pagamentos, receita, importação, backup) — implementar direto

Você é o ÚNICO escritor no checkout `D:\travel-platform` durante esta rodada (Claude e Codex só leem). Escreva o código, os testes e as migrations. Não pergunte nada: onde a decisão já está abaixo, aplique; onde não está, escolha a opção mais simples e segura e registre em uma linha no relatório. Ao final o Claude testa de ponta a ponta; entregue tudo funcionando.

## Limites (só estes)
1. Só o **Full** (`services/api`, `apps/agency`, `packages/domain`, `infrastructure/migrations`, `tests/`). NÃO toque em `services/api-lite`, `apps/travel-lite`, `infrastructure/migrations-travel-lite`.
2. Migrations: só arquivos **novos** a partir da `112_*` (a 111 já existe), aditivos, com GRANT ao runtime dentro da própria migration no padrão da 106/111 (`travel_app_runtime`, `travel_app_runtime_local`), RLS forçada em toda tabela com `agency_id`, append-only onde for histórico. Nunca edite migration existente.
3. Banco: aplique migrations novas só no banco descartável `travel-full-teste-20261025` (porta 55644, usuário `teste_admin`, senha `teste_admin_local`, banco `travel_platform_teste`) com `docker exec -i travel-full-teste-20261025 psql -U teste_admin -d travel_platform_teste -v ON_ERROR_STOP=1 < arquivo.sql`. Não toque nos containers `travel-full-presentation-20261023` (55438), `travel-lite-*`, Supabase, Render, Vercel, Gadotti, `.env`.
4. Sem commit, push, deploy, instalação de pacote. Preserve alterações existentes de outras frentes (nada de reset/checkout/stash/clean).
5. Segurança do produto não se negocia: `agency_id` nunca vem do cliente, autorização no servidor, RLS, auditoria (`recordAuditEvent`, chaves permitidas do allow-list), snapshots históricos, sem dupla contagem.

## Decisões fechadas (DEC-008, `docs/decisions/DEC-008-comissoes-primeiro-teste-full.md`)
1. `SOMENTE_LIBERACAO`: meta conta a venda confirmada. `META_E_LIBERACAO`: meta conta o **recebimento proporcional** (no mês do recebimento).
2. Faixas continuam **marginais**. Modos "sobre o total" e "só excedente" são explícitos e distintos.
3. Venda sem forma de pagamento: comissão BLOQUEADA (409 `COMMISSION_RELEASE_POLICY_MISSING`), mensagem clara.
4. Folha só recebe comissão 100% liberada; liberação parcial vai pelo canal avulso. Um canal por obrigação.
5. **Estorno de recebimento controlado**: implementar. Reversão que deixe pago > liberado → 409.
6. Histórico preservado (0,55 legado). Motor novo (0,56) só em cálculos futuros, a partir de uma **data de corte por agência** (configurável; sem data = motor atual de cada fluxo).
7. A política de liberação é **congelada na obrigação** (`release_policy_snapshot` na entrada) no momento da geração; mudanças valem só para novas.
8. Venda antiga inserida depois não recalcula cálculos fechados; continuidade por `seq` da atribuição.
9. Receita do fornecedor: **por venda** (padrão) ou **lotes/janelas**, configurável por agência; sem calendário presumido.
10. Lite fica para depois (não mexer).

## Já feito (não refaça)
Migrations 100–111; motor `commission-calculation.ts`; regras versionadas (`commission-rule-versions.ts`, `routes/commission-rule-versions.ts`); `PENDING_RULE` resolvido no mesmo registro; liberação por recebimento (`commission-release*.ts`); receita da agência (`agency-revenue*.ts`) com restrição de pessoal; condições de pagamento no banco/API (`payment-schedule.ts`, `sale-payment-schedules.ts`, rotas `/payment-conditions`, `/sales/:id/payments`, `/balance`, `/payment-schedule`); projeções; IMP-01; BAK-01 parcial; telas `CommissionRulesPage` (editor de faixas), `CommissionReleasePage`, `AgencyRevenuePage` (consulta), `ProjectionsPage`, `SalesImportPage`, `SalePaymentPanel`.

## Demandas (execute nesta ordem; cada uma com testes e gates antes da próxima)

### D4 — Um motor por obrigação (convivência versionado × legado por produto/passageiro/bilhete)
- Regra: para o par (venda, funcionário) existe **um** motor. Se há atribuição ativa + regra versionada → só `generateVersionedCommission`; a geração legada (`employee-commissions.ts`/`commissions.ts`, por plano/produto/passageiro/bilhete) para o mesmo par responde 409 com mensagem "esta venda usa regras versionadas". Se não há atribuição → fluxo legado intacto (não quebrar nenhum teste legado).
- Índices da migration 080/107: garanta que nenhuma combinação gera duas entradas vivas para a mesma obrigação; teste de DB para venda com item por produto + atribuição versionada.
- Adicione `PENDING_RULE` aos tipos de `packages/domain/types.ts` e `apps/agency/src/lib/api.ts`.
- `isEffective` na listagem de versões: calcule "em vigor **hoje**" (data atual), e marque versões futuras como "agendada" (campo novo `state: 'EFFECTIVE'|'SCHEDULED'|'SUPERSEDED'`); ajuste `CommissionRulesPage` para exibir isso.
- Data de corte do motor novo (decisão 6): tabela/coluna de configuração por agência (migration 112) + uso no cálculo; UI na página de regras.

### D4B — Tela de cadastro de condições de pagamento
- API: completar (listar todas incl. inativas, criar, **revisar** gerando nova versão, desativar) sem apagar histórico; vendas existentes mantêm o snapshot.
- UI: nova página "Condições de pagamento" (rota e item de menu) com: nome; tipo (à vista / parcelas iguais / entrada + saldo); máx. parcelas; parcela mínima; sem juros; entrada (nenhuma/%/valor) e obrigatória; prazo do saldo (âncora data da venda ou início da viagem + dias, aceitar negativo = antes do embarque); aceita pagamentos parciais; ativa. Funções em `lib/api.ts`.
- Cenários que devem funcionar pela tela: "Cartão 10x sem juros, parcela mínima R$100" e "Boleto/Pix: entrada 30% obrigatória + saldo até 15 dias antes do embarque, pagamentos parciais".

### D5 — Metas e COM-02
- `accumulatedBefore` (e demais usos) passa a respeitar o perfil financeiro vigente: `SOMENTE_LIBERACAO` conta o valor da venda confirmada; `META_E_LIBERACAO` conta o **recebimento proporcional** dos recebimentos reais (tabela de alocações), no mês em que o recebimento ocorreu. Recalcule só obrigações futuras; entradas já geradas guardam `accumulated_before` e snapshot.
- Mantenha faixa marginal; adicione modo explícito "sobre o total" (`tier_mode = 'TOTAL'`: ao cruzar a faixa, a taxa da faixa atingida vale sobre todo o acumulado do mês) como opção distinta, com testes numéricos (45.000 + 20.000 marginal = 750,00 já existente; novo caso total). Valide no servidor e exponha na UI (seleção de modo na `CommissionRulesPage`).
- Testes: perfis × vendas com recebimento parcial, mês de competência, continuidade por `seq`, concorrência (advisory lock existente).

### D6 — Liberação, canais e estorno
- Coluna `release_policy_snapshot` (jsonb) em `commission_entries` preenchida na geração (versionada e legada); `commission-release-service` lê o snapshot da obrigação, não a configuração atual (decisão 7). Entradas antigas sem snapshot: usam a política atual e gravam o snapshot no primeiro uso.
- Estorno: rota `POST /sales/:id/payments/:paymentId/reverse` (MANAGER+, motivo obrigatório, auditoria obrigatória, idempotente). Registro append-only (tabela nova migration), recompõe saldo, parcela e receita da agência (volta de ENTITLED/AVAILABLE conforme regra, nunca apaga); se o liberado cair abaixo do pago de comissão → 409 `COMMISSION_PAID_EXCEEDS_RELEASED`. UI: botão "Estornar" por pagamento no `SalePaymentPanel` com motivo.
- Testes de banco: parcial → folha integral/avulso parcial → pagamento parcial/integral → estorno → reabertura; concorrência (`commission-settle:{agência}:{entrada}`); troca de política não altera obrigação já gerada.

### D7 — Comissões e receita pela tela
- `PayrollPage`/venda: ações "Atribuir a funcionário" (categoria/competência), "Gerar comissão" (versionada quando há atribuição), lista de pendências `PENDING_RULE` com ação "Resolver" (reexecuta a geração) e link para criar regra; mostrar por entrada: reconhecido, liberado, pago e saldo; folha gera só 100% liberadas (mensagem explicando as demais).
- `AgencyRevenuePage`: completar CRUD de regras de receita (fornecedor/produto/categoria; modos PERCENTAGE e FIXED_PER_PASSENGER/SALE/ITEM; bases LINE_TOTAL, NET_FARE, TAXES, FEES, TAXES_AND_FEES, MARGIN; evento de direito), lista de entradas com filtros, ações "Registrar recebimento", "Cancelar" e "Reativar" (motivo, 1–128 caracteres); tratar campos de comissão/diferença **omitidos** (usuário com restrição de pessoal).
- Testes de componente + um teste HTTP por ação nova.

### D8 — Lotes e janelas de recebimento da receita (decisão 9)
- Configuração por agência: `SETTLEMENT_MODE = PER_SALE | BATCH_WINDOW`; em BATCH_WINDOW, janelas (dia de fechamento do mês e dias para pagamento) configuráveis.
- Tabela de lotes (append-only por fechamento): fechar lote agrupa entradas `ENTITLED` da janela e as marca `AVAILABLE` com `expected_payment_date`; "Registrar recebimento do lote" leva as entradas a `RECEIVED`. Unicidade por (agência, janela). Auditoria obrigatória. Sem política = PER_SALE (comportamento atual).
- UI na `AgencyRevenuePage` (aba/seção Lotes) e projeções passam a usar `expected_payment_date` real.

### D9 — Projeções e relatórios
- `report-projections*`: usar datas reais de lote; filtros restantes sem ignorar nenhum (`saleFrom/To`, `travelFrom/To`, origem, destino, categoria, fornecedor, funcionário, status); previsto × liberado × pago de comissão e receita conferindo com o financeiro; CSV com os mesmos filtros. Teste de DB com dados reais de comissão.

### D10 — IMP-01 "a completar" e Dashboard
- Importação: a venda importada incompleta recebe `form_snapshot` com os campos pendentes, para o filtro "a completar" da listagem de vendas achá-la; ao completar os dados a pendência sai. Teste: importar → filtrar → completar → some do filtro.
- `DashboardPage` consome os widgets configurados (ordem/visibilidade) via API existente, respeitando permissões; teste de componente.

### D11 — Backup por agência (BAK-01) — escopo fechado
- Classifique **todas** as tabelas de `tenant-backup-pending.ts` em `BACKUP_TABLES` ou `EXCLUDED_WITH_REASON` (não deixe `PENDING_INVENTORY` com itens de negócio). Entram no backup obrigatoriamente: comissões (entradas, regras, versões, faixas, atribuições, perfis, eventos de liberação), folha e payables/receivables e alocações, condições/cronogramas/histórico de pagamento, receita da agência e lotes, estornos, permissões individuais, configurações de campos/dashboard/categorias, chaves de importação.
- Restauração assistida cobrindo as mesmas tabelas em ordem de dependência, validando integridade e isolamento por agência; UI em Configurações (exportar/baixar/restaurar com reautenticação já existente).
- O teste `tenant-backup.integration` deve provar: exporta agência A, apaga/ensaia em banco descartável, restaura e confere contagens e totais financeiros; agência B intacta.

### D12 — Ambiente por abas (configuração financeira)
- Página "Configuração financeira" com abas (usar os componentes existentes, sem duplicar): Condições de pagamento · Formas de pagamento (regra de recebimento) · Receita da agência (regras e lotes) · Regras de comissão · Liberação/perfil financeiro · Categorias de venda. Item de menu único; rotas antigas continuam funcionando.

## Testes e gates (rode você, antes de entregar)
- Por demanda: unitário + HTTP + banco (container próprio, uma suíte de banco por vez, porta distinta de 55438/55644) + componentes.
- Final: `npm run lint`, `npm run typecheck`, `npm run test` (raiz, `services/api`, `apps/agency`), `npm run test:db` (um arquivo por vez se houver colisão de container), `npm run build`. As 4 suítes que falharam por colisão de container (`financial`, `proposal-routes`, `sale-routes`, `customer-platform-auth-http`) devem passar isoladas; corrija a causa se for código.
- Atualize `tests/integration/database/*` (listas de tabelas esperadas, `002_prepare_local_roles.sql`) e o inventário de rotas (`route-inventory.ts`) para tudo que criar.

## Cenário de ponta a ponta que o Claude vai executar (tem que passar)
1. Admin cria condições "Cartão 10x mín. R$100" e "Boleto/Pix 30% entrada + saldo até 15 dias antes do embarque".
2. Cria categoria Rodoviário, regra de receita 7% sobre total do fornecedor da excursão; evento de direito = quitação.
3. Cria regra de comissão do funcionário (progressiva com 2 faixas) e perfil financeiro `META_E_LIBERACAO`; forma de pagamento "Cartão" marcada como não exige recebimento e "Boleto/Pix" como exige.
4. Vende excursão R$1.000 (data da venda, origem, destino), atribui ao funcionário.
5. Paga entrada R$300 (boleto/Pix) → comissão liberada proporcional a 30%; paga R$700 em duas baixas → 100%; receita da agência vira ENTITLED na quitação.
6. Estorna uma baixa → liberado cai; pagamento de comissão acima do liberado → 409.
7. Fecha lote de receita, registra recebimento; projeções e CSV conferem.
8. Importa CSV de vendas (uma incompleta) → aparece em "a completar"; completa.
9. Backup da agência → restauração em banco descartável confere totais.
10. Usuário com restrição de pessoal não vê comissão em receita/projeções.

## Entrega
- Relatório curto em `.opencode/RELATORIO-FINALIZACAO-FULL-2026-10-25.md`: o que fez por demanda, arquivos, migrations (números), comandos de teste e resultado de cada gate, e qualquer decisão tomada por você (1 linha cada).
- Para reiniciar o ambiente de teste do Claude: nada a fazer (o Claude recompila). Se criar migration, aplique-a no banco 55644 como descrito.
