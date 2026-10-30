# Cenário financeiro local e UX de comissão — Plano de Implementação

> **Para agentes de implementação:** executar este plano em sequência no checkout atual. Preservar todas as alterações preexistentes; não resetar, limpar, trocar de branch, fazer commit, push, deploy ou editar arquivos fora do escopo descrito.

**Objetivo:** Tornar o cenário local integralmente navegável e filtrável e oferecer configuração de comissão visual e intuitiva no Travel Platform Full, sem JSON ou fórmulas para a agência.

**Arquitetura:** Manter o motor de comissões versionado e o DSL de segmentação existentes. Acrescentar filtros tenant-scoped nas consultas existentes; adicionar uma condição de notas do cliente à segmentação dinâmica para selecionar o cenário; expor as áreas já implementadas na navegação; e permitir vincular uma viagem à venda para popular passageiros no banco descartável.

**Tecnologias:** React + TypeScript, Fastify, PostgreSQL, Vitest, migrations SQL existentes somente se necessárias para a implementação local.

## Restrições globais

- Escopo somente Travel Platform Full em `D:\travel-platform`.
- Banco local descartável autorizado na porta `55648`; confirmar nome/projeto e estado antes de qualquer escrita.
- Não acessar nem modificar Lite, banco Gadotti, demo `5183`, Supabase, Vercel, Render, produção, DNS ou qualquer serviço remoto.
- Não ler `.env` real nem exibir segredos, tokens, credenciais ou dados pessoais em saídas.
- Não sobrescrever alterações anteriores do checkout; examinar diffs dos arquivos compartilhados antes de editar.
- Não executar `prisma migrate`, `prisma db push` ou `prisma generate`.
- Não criar/alterar migration sem necessidade confirmada pelo schema atual; nenhuma migration remota.
- Não fazer commit, push, deploy ou alteração da `main`.
- Toda consulta e mutação deve derivar `agencyId` do contexto autenticado e usar parâmetros SQL.
- O cenário de teste pode usar o cliente da venda como passageiro principal, sem criar acompanhantes ou documentos.
- Interface de comissão de agência não pode expor JSON, variáveis, expressões ou fórmulas; não criar área avançada separada para Super Admin.

---

## Mapa de arquivos e responsabilidades

- `services/api/src/sales.ts`: filtros de lista de vendas no SQL existente.
- `services/api/src/routes/sales.ts`: validar e encaminhar filtros de query string.
- `services/api/src/financial.ts`: filtros de recebíveis e contas a pagar.
- `services/api/src/routes/financial.ts`: validar filtros e preservar contratos antigos.
- `services/api/src/customer-segmentation.ts`: DSL validado; adicionar somente o campo de observações necessário ao cenário.
- `services/api/src/customer-segments.ts`: resolução tenant-scoped de segmento salvo quando necessária por um filtro financeiro.
- `services/api/src/trips.ts` e `services/api/src/routes/trips.ts`: associação opcional de viagem/venda com validação de agência e cliente.
- `services/api/src/operations-queries.ts`: preservar agregação existente de passageiros; corrigir somente se o cenário revelar lacuna.
- `apps/agency/src/lib/api.ts`: tipos e parâmetros opcionais para filtros.
- `apps/agency/src/pages/SalesJourneyPages.tsx`: controles e estado de filtros de vendas.
- `apps/agency/src/pages/ReceivablesPage.tsx` e `PayablesPage.tsx`: filtros financeiros acessíveis.
- `apps/agency/src/pages/CommissionRulesPage.tsx`: experiência visual guiada usando os contratos versionados.
- `apps/agency/src/pages/CommissionPlansPage.tsx`, `App.tsx` e `components/layout/Sidebar.tsx`: impedir entrada da agência na configuração JSON legada e encaminhar o menu à experiência intuitiva.
- `apps/agency/src/pages/AgencyRevenuePage.tsx`: trocar filtros por ID técnico por seletores de cadastro e expor link na navegação.
- Testes existentes junto às páginas/serviços acima: ampliar regressões no padrão local.
- `scripts/` (novo script local apenas se necessário): criar/atualizar viagens do cenário idempotentemente usando API autenticada ou banco descartável, sem credenciais impressas.
- `docs/superpowers/specs/2026-10-27-scenario-finance-local-and-commission-ux-design.md`: manter a especificação aprovada coerente com o comportamento implementado.

## Tarefa 1: Preparar baseline sem perturbar o checkout

1. Confirmar branch/cwd e rever `git diff` dos arquivos que serão modificados; não reverter nem formatar mudanças de terceiros.
2. Confirmar processos e health local de API/UI e identificar o nome real do banco descartável em `55648`, sem ler conteúdo de `.env`.
3. Registrar contagens e amostras agregadas do cenário; não imprimir emails, telefones ou nomes pessoais desnecessários.
4. Rodar apenas os testes focados preexistentes antes da mudança para separar falhas de baseline.

## Tarefa 2: Filtros tenant-scoped na API

1. Criar testes para `GET /sales` combinando intervalo de datas, fornecedor, funcionário/status e segmentação, com um caso de outra agência excluído.
2. Estender `listSales` com filtros opcionais e SQL parametrizado; manter `listSales(database)` compatível para consumidores atuais.
3. Validar query params em `routes/sales.ts`; datas inválidas, status não permitido e IDs malformados devem retornar erro de validação.
4. Criar testes HTTP para `GET /financial/receivables` e `/financial/payables` com filtros por datas, situação, fornecedor e funcionário quando aplicável.
5. Estender `listReceivables`/`listPayables` preservando cálculo de valores pagos, estornos, ordenação e isolamento por agência.
6. Para segmento salvo, validar existência/visibilidade no tenant e compor o predicado com o compilador allowlisted existente. Não materializar snapshot de clientes nem confiar em IDs recebidos sem validação.
7. Rodar os testes focados da API e typecheck da API.

Comandos de referência:

```powershell
npm run test --workspace=@travel-platform/api -- services/api/tests/sales-list-filters.test.ts services/api/tests/financial-list-filters.test.ts
npm run typecheck --workspace=@travel-platform/api
```

Os nomes dos testes novos podem seguir os arquivos existentes de rotas e domínio quando a auditoria confirmar o padrão mais próximo.

## Tarefa 3: Filtros e navegação no Full

1. Criar testes de componente para datas, fornecedor, funcionário, situação, aplicar/limpar filtros e estado vazio.
2. Adicionar seletor de filtros de vendas mantendo o filtro existente de itens incompletos; disparar consulta de novo ao aplicar filtros, sem filtrar apenas a lista já carregada no navegador.
3. Adicionar filtros de contas a receber/pagar; preservar busca textual e estados de pagamento existentes.
4. Garantir `label`/`htmlFor`, foco por teclado, botões com nome acessível e comunicação textual de filtros/resultado; cor não será o único indicador de estado.
5. Adicionar filtros por funcionário à lista de comissões/folha sem alterar cálculo nem aprovação.
6. Expor Regras de Comissão e Receita da Agência na navegação para papéis já autorizados pelas rotas.
7. Substituir IDs de fornecedor/categoria em Receita da Agência por opções selecionáveis com nomes legíveis, mantendo valores de ID somente no contrato API.
8. Executar testes focados de Sales, Receivables, Payables, Payroll, AgencyRevenue e Sidebar; Agency typecheck e lint escopado.

Comandos de referência:

```powershell
npm run test --workspace=@travel-platform/agency -- src/pages/SalesJourneyPages.test.tsx src/pages/ReceivablesPage.test.tsx src/pages/PayablesPage.test.tsx src/pages/CommissionRulesPage.test.tsx src/pages/AgencyRevenuePage.test.tsx
npm run typecheck --workspace=@travel-platform/agency
npm run lint --workspace=@travel-platform/agency
```

## Tarefa 4: Tornar comissões intuitivas

1. Adicionar teste que demonstre que a rota/menu “Planos de Comissão” da agência não oferece editor JSON ou a mensagem de “motor futuro”.
2. Redirecionar o item de navegação e deep-link legado para a tela de regras versionadas, sem remover rota de API ou registros históricos.
3. Reorganizar a tela em passos: escopo da regra; forma de cálculo (percentual, valor fixo, meta por faixas, excedente ou sem regra); valores; vigência; revisão e confirmação.
4. Mostrar campos dependentes da escolha, com descrições comuns e exemplos monetários; metas/faixas têm botões para adicionar/remover e opções visuais para faixa sobre o total ou excedente.
5. Não aceitar JSON, nomes de variáveis, expressões ou fórmulas na UI da agência; preservar os tipos e payloads usados pelo motor atual.
6. Manter a imutabilidade das versões e as validações atuais, incluindo justificativa de revisão e regras de início de vigência.
7. Incluir filtros de funcionário, fornecedor, categoria e estado de vigência na listagem com nomes, mantendo todos os controles acessíveis por teclado.
8. Rodar testes de cálculo/contrato já existentes e testes de componente da tela; nenhum recálculo histórico.

## Tarefa 5: Segmentação e cenário nas áreas relacionadas

1. Adicionar `customer.notes` ao registro de campos da segmentação com operadores de texto já allowlisted e sem aceitar SQL/expressões do usuário.
2. Testar validação, SQL parametrizado e consulta tenant-scoped do filtro por observação.
3. Criar no banco descartável um segmento compartilhado “Cenário financeiro de demonstração” usando `CONTAINS` para `DEMO-FIN-2026-10`.
4. Aplicar esse segmento nos filtros de vendas, recebíveis, pagar quando o vínculo permitir, comissões e receitas; registrar totais agregados por tela para reconciliação.
5. Caso um domínio não possua vínculo seguro com venda/cliente, deixar explícita essa limitação na interface/relatório em vez de incluir itens por heurística.
6. Validar que clientes fora do marcador e registros de outro tenant nunca entrem no resultado.

## Tarefa 6: Viagens e passageiros

1. Criar testes de criação de viagem com venda válida, cliente/agência correspondentes, venda já vinculada, cliente incompatível e venda inexistente.
2. Adicionar `saleId?` à entrada de viagem e persistir em `trips.sale_id`, que já possui chave estrangeira tenant-scoped e unicidade por agência.
3. Validar no backend que a venda pertence à mesma agência e ao mesmo cliente; não confiar no `agencyId` do payload.
4. Usar cliente comprador como passageiro primário das vendas de viagem do cenário local; evitar registros para itens sem data/destino confiáveis.
5. Gerar viagens uma única vez por venda de viagem elegível, usando a data real de embarque e destino/produto já armazenados; executar em transação/auditoria e tornar o script idempotente.
6. Conferir que a página de passageiros exiba viajantes vinculados e que viagens sem passageiros elegíveis não sejam fabricadas.

## Tarefa 7: Verificação integrada local

1. Rodar testes focados da API e Agency e os typechecks/lint citados acima.
2. Confirmar que o serviço local usa o banco descartável autorizado, validar a aplicação local e autenticar com a sessão já existente sem imprimir credenciais.
3. Percorrer vendas, filtros financeiros, segmento, fornecedores, regras de comissão, folha, receita, pipeline, viagens e passageiros.
4. Conferir totais contra o estado inicial: vendas outubro R$ 350.000; novembro R$ 380.000; receita da agência esperada R$ 71.935, recebida R$ 15.100 e projetada R$ 56.835; nenhuma mutação a bancos/hosts remotos.
5. Atualizar a especificação e o estado de trabalho com arquivos, comandos, resultados, limites e qualquer falha de baseline.

## Limites para conclusão

- Não afirmar que dados de passageiros existem se a viagem correspondente falhar validação ou não houver data/destino suficiente.
- Não declarar filtros corretos somente com testes de UI; validar API, SQL tenant scope e resultado no banco descartável.
- Não tratar o botão/menu como prova do funcionamento: abrir a página e aplicar filtros reais no Full local.
- Não declarar sucesso global se qualquer teste/gate focado falhar; reportar exatamente a falha e deixar o item aberto.
