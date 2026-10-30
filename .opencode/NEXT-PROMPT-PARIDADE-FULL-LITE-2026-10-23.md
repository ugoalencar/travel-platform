# OpenCode: alinhamento CEP e CSV Full / Lite

Trabalhe em `D:/travel-platform`. Leia `AGENTS.md`, `docs/AI_CONTEXT.md`,
`QUALITY-GATES.md` e `docs/00-product/FULL-LITE-ALIGNMENT-PLAN.md` primeiro.
Confirme cwd, branch, worktree e diff; preserve alteracoes existentes.

## Missao desta rodada

Especificar CEP-01 e CSV-01 para o Full, tomando o comportamento Lite como
referencia e respeitando os contratos e a interface existentes do Full.
Entregar dois planos pequenos e independentes, prontos para revisao Codex.
Esta rodada e documental; nao alterar codigo nem iniciar redesenho visual.

Pode escrever somente:
`.opencode/RELATORIO-PARIDADE-FULL-LITE-2026-10-23.md`.
Nao editar coordenador, fontes, relatorios do Claude, tipos compartilhados,
migrations, permissoes ou lockfiles. Sem acesso online ou dados reais,
deploy, .env, instalacao, commit/push, prisma ou reset de banco.

## CEP-01

Ler `apps/travel-lite/src/CustomerCepField.tsx`, `pages/CustomersPage.tsx`,
testes de CEP, `services/api-lite/src/cep.ts` e `routes/cep.ts`.
Comparar com `apps/agency/src/pages/CustomersPage.tsx`, componentes usados,
`services/api/src/customers.ts`, `routes/customers.ts` e `lib/api.ts` do Full.

Propor contrato e arquivos exatos para busca autenticada e preenchimento do
endereco Full. Incluir CEP alterado depois da primeira consulta, respostas
fora de ordem, cancelamento, CEP generico/invalido, indisponibilidade,
preservacao de alteracoes manuais e nova pesquisa. Provedor ViaCEP aprovado;
nao presumir que o frontend possa chamar diretamente sem analisar politica
atual. Nao instalar dependencia nem mudar formato de endereco sem justificativa.
Definir testes puros/API/componente e integracao da tela sem regressao.

## CSV-01

Ler `services/api-lite/src/routes/reports.ts`, cliente CSV e
`apps/travel-lite/src/pages/ReportsPage.tsx`; comparar com
`services/api/src/routes/reports.ts`, `reports.ts`,
`apps/agency/src/pages/ReportsPage.tsx` e `DetailedReportsPage.tsx`.

Mapear relatórios correspondentes e propor exportacao preservando filtro,
escopo de acesso, formato monetario/data, encoding e nome de arquivo.
Incluir escaping de delimitadores, aspas/quebras de linha e protecao contra
formulas em planilha. Nao alterar contrato JSON existente silenciosamente.
Nao tratar CSV como PDF; PDF e demanda separada. Propor testes que comparem
linhas/valores do CSV com os resultados autorizados do mesmo filtro.

## Formato da entrega

Para cada frente: evidencia atual, contrato proposto, componentes/arquivos,
passos de implementacao, testes com resultados esperados, limites de escrita
e dependencias compartilhadas reservadas ao Codex.
Nao executar fixtures DB; informar explicitamente testes nao realizados.

DASH-01 fica para depois de SEC-01; pode registrar dependencias, mas nao
iniciar dashboard nesta rodada. Nao tocar comissoes, folha ou financeiro.
Permanecer em HOLD para implementacao ate consolidacao. Gadotti permanece
no Lite, bancos separados e nenhuma migracao autorizada.
