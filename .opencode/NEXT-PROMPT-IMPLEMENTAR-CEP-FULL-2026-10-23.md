# OpenCode: implementar CEP no Full, somente local

Esta tarefa sucede o HOLD documental somente para CEP-01. Leia `AGENTS.md`,
`docs/AI_CONTEXT.md`, `QUALITY-GATES.md`, seu relatorio de paridade e
`.opencode/REVISAO-CODEX-PARIDADE-FULL-LITE-2026-10-23.md`.

Implemente o desenho de CEP revisado, primeiro testes falhando e depois codigo.
Sem instalar dependencias, .env, banco, migrations, dados reais, acesso remoto,
deploy, reset, commit/push ou mudanca na main. Gadotti permanece no Lite.
Confirme cwd/branch/diff e preserve todas as alteracoes preexistentes.

## Escopo de escrita exclusivo desta tarefa

- Novos: `services/api/src/cep.ts`, `services/api/src/routes/cep.ts`,
  `services/api/tests/cep.test.ts`, `services/api/tests/cep-routes.test.ts`.
- Novos: `apps/agency/src/components/customer/CustomerCepField.tsx` e seu
  teste `.test.tsx` no mesmo diretorio.
- Adaptar: `services/api/src/app.ts`, `services/api/src/server.ts`,
  `apps/agency/src/lib/api.ts`, `apps/agency/src/pages/CustomerDetailPage.tsx`
  e seus testes, mais mock de CustomersPage se realmente necessario.
- Documentacao somente em `.opencode/RELATORIO-IMPLEMENTACAO-CEP-FULL-2026-10-23.md`.

Estes arquivos de inicializacao/cliente ficam reservados ao OpenCode durante
esta tarefa. Nao refatorar o cliente inteiro nem substituir trabalho existente.
Nao editar `errors.ts`, modulo de relatorios/CSV, types compartilhados, schema,
comissoes/financeiro/folha, Lite ou o plano coordenador.

## Contrato e aceite

- Proxy ViaCEP com URL fixa, validacao de CEP, timeout e teto de resposta,
  cache limitado e limites por contexto autenticado, como o desenho revisado.
- `lookupCep(cep, signal?)` reutiliza o cliente Full existente, sem segundo
  mecanismo de sessao. Erros do provider sao traduzidos explicitamente na rota.
- Producao fail-closed pela flag aprovada; tests usam fetch falso e nenhuma
  chamada real ao ViaCEP. Nunca enviar nome/CPF/identidade ao provedor.
- Integrar no modal Novo endereco de CustomerDetailPage, sem redesenhar tela.
  Mapear bairro, manter numero/complemento manual, reconsultar ao mudar CEP,
  preservar edicao manual, descartar resposta atrasada e abortar ao fechar.
- Endereco com rua -> CEP generico: nao deixar rua automatica antiga como se
  pertencesse ao novo CEP; campos manuais continuam preservados.
- Salvar manualmente continua possivel quando o provedor estiver indisponivel.
- Nao endurecer gravacao de CEP legado nesta etapa. Sem alteracao de schema.
- Testar 401/403 antes de fetch, contexto do tenant, no-store e erros tipados.

Executar apenas testes puros/componentes/HTTP com dependencias falsas, sem
fixtures que recriam banco. Rodar lint/typecheck/build dos workspaces afetados.
Relatar comandos, exit codes, contagem de testes, arquivos e verificacoes nao
realizadas. Nao declarar teste de banco/online ou aceite visual sem executa-los.

Ao terminar, entregar codigo e relatorio para revisao Codex. Nao publicar nem
iniciar CSV, DASH-01 ou os ajustes futuros `AJUSTES-23-10-2026-GADOTTI.MD`.
