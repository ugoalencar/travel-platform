# Relatório — comissão por fornecedor e reconciliação financeira

Data da validação: 2026-10-26 (horário local de São Paulo)

## Escopo e isolamento

- Implementação e validação somente no produto Full.
- Banco usado: `travel_platform_teste`, PostgreSQL local em `127.0.0.1:55644`.
- Migration 116 consta uma vez no registro e é a versão mais recente desse banco.
- Nenhum banco remoto, Lite, demo, Gadotti, Supabase, Render ou Vercel foi acessado ou alterado. Nenhum deploy, commit ou push foi feito.
- O checkout já continha muitas alterações locais de outras frentes. Esta execução preservou esses arquivos; o teste novo foi limitado a `services/api/tests/report-projections.test.ts`.

## Entrega verificada

- Cadastro de fornecedor com termos de comissão, regra geral e regras por produto/categoria, vigência versionada e histórico, reaproveitando o domínio de receita da agência.
- Comissão de funcionário com escopo por fornecedor, precedência de regra documentada na interface e base de cálculo sobre o total vendido daquele fornecedor.
- Opção de reter/liberar a comissão do funcionário conforme o fornecedor paga a agência, com limite proporcional à receita recebida.
- Política de custo WARN/BLOCK, com aviso de comissão acima da receita e snapshot do cálculo; respostas do funcionário não expõem receita da agência, taxa do fornecedor ou resultado.
- Políticas de data de pagamento versionadas; geração de folha usa a data prevista para agrupar regras FIXED_DAY/WINDOW, mantendo PER_ENTRY.
- Projeções e relatório por fornecedor mantêm volume vendido, receita esperada/recebida, diferença, comissão de funcionário e resultado em campos distintos.
- Cenário aritmético explícito incluído: venda R$ 10.000, receita da agência R$ 1.000, custo de comissão R$ 100 e resultado R$ 900.
- Matriz de cobertura regenerada: 53 áreas e nenhuma coleção vazia. Ver `COBERTURA-DADOS-FULL-TESTE.md`.

## Evidências de validação

| Verificação | Resultado |
|---|---:|
| E2E local Full (papéis, isolamento/RLS, vendas, receitas, lotes, comissão, folha e relatórios), sem repetir rota de backup | 80/80 |
| Testes focados API (projeções, cálculo de receita, comissão, política de fornecedor e liberação) | 64/64 |
| Testes de componente Agency | 277/277 em 45 arquivos |
| Auditoria local das telas | 69/69, sem erros JS, HTTP ou telas sem fixture |
| Typecheck API | passou |
| Build TypeScript API | passou |
| ESLint dos arquivos de API envolvidos | passou |
| Health API local | `200`, `{"status":"ok","service":"api"}` |
| Migration no banco descartável | versão máxima 116; migration 116 registrada uma vez |

O backup e verificação dry-run já estavam cobertos pelo seed; o E2E final foi executado com `--skip-backup`, portanto não afirma que houve restauração. Não foi executada a suite completa de integração DB, pois seus helpers podem iniciar bancos descartáveis em portas distintas; a autorização vigente cobre somente a porta 55644.

## Gate da suite API completa

Uma execução integral anterior do Vitest API registrou 229/232 arquivos aprovados e três arquivos com falha: duas variantes de `customer-platform-auth-http` e `reports-csv-db`. O resultado armazenado não reteve mensagens detalhadas das falhas. A suite Agency integral e os testes focados API deste escopo passaram. Portanto, a suite API completa não é declarada verde; as três falhas precisam de diagnóstico separado antes de usar esse gate como aprovação geral do Full.

## Ambiente local

- API: `http://127.0.0.1:4100/health` responde saudável.
- App Agency: servidor local ativo na porta 5183.
- PostgreSQL de teste: porta 55644.
- Os processos locais foram mantidos em execução ao final para apresentação/teste.

## Limites da validação

- Os dados são fixtures SEED fictícias do tenant local `alpha-viagens`; não são dados de cliente.
- O E2E usa SQL apenas para preparar fixtures SEED quando não há rota de domínio para a operação histórica; as transições financeiras cobertas foram feitas via API.
- A auditoria de interface confirma carregamento e ausência de erros de console/rede, não substitui revisão visual humana de cada fluxo.
- Nenhuma funcionalidade foi implantada online.
