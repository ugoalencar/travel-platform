# NEXT PROMPT — Go-live Travel Lite no Render

Voce esta trabalhando no repositorio `D:\travel-platform`.

## Contexto

O Travel Lite esta pronto localmente e sera publicado como versao inicial online.
O DNS `travellite.travelplataforma.com.br` ja foi criado no Registro.br e resolve para o Render.

Use `docs/travel-lite/RELEASES.md` como baseline oficial da versao inicial
`0.1.0 Inicial — 2026-10-02`. Esta versao deve ser tratada como o estado
fechado para go-live: Gadotti preservado, Demo separado com dados ficticios,
branding/login por tenant, Help Center/onboarding/manual/apresentacao e
evidencias locais ja documentadas.

Decisao de produto/URL para este primeiro go-live:

- Gadotti: `https://travellite.travelplataforma.com.br/gadotti`
- Demo: `https://travellite.travelplataforma.com.br/demo`
- Raiz: `https://travellite.travelplataforma.com.br` deve ser login neutro ou uma entrada segura sem listar clientes publicamente.

O login deve apontar o tenant pelo caminho quando existir `/gadotti` ou `/demo`, mas a seguranca real deve continuar vindo do backend, usuario autenticado, agencia vinculada e isolamento por tenant/RLS.

## Objetivo

Preparar um relatorio tecnico e, se for seguro, pequenas alteracoes versionaveis para deixar o Travel Lite pronto para deploy online no Render, sem tocar em segredos reais e sem acessar producao.

Nao reabrir escopo funcional da versao `0.1.0`. O foco agora e publicar com
seguranca o que ja foi versionado. Qualquer melhoria fora de deploy deve ser
registrada como backlog/risco residual, nao implementada automaticamente.

## Escopo permitido

Voce pode:

1. Revisar `Dockerfile.travel-lite`, `docker-compose.travel-lite.yml`, `services/api-lite`, `apps/travel-lite`, `scripts/travel-lite-migrate.cjs` e docs de go-live.
2. Confirmar se o app aceita `PORT` dinamico do Render e `HOST=0.0.0.0`.
3. Confirmar se o frontend buildado e servido corretamente via `FRONTEND_DIST_DIR`.
4. Revisar variaveis necessarias para producao:
   - `NODE_ENV=production`
   - `HOST=0.0.0.0`
   - `DATABASE_URL`
   - `FRONTEND_DIST_DIR`
   - `TRAVEL_LITE_APP_URL`
   - `TRAVEL_LITE_CORS_ORIGINS`
   - `TRAVEL_LITE_RESEND_API_KEY`
   - `TRAVEL_LITE_EMAIL_FROM`
   - `TRAVEL_LITE_EMAIL_REQUIRE_REAL`
5. Revisar o processo de migrations online.
6. Se necessario, propor ou implementar um runner separado/seguro para migrations online, com trava explicita, para evitar rodar acidentalmente contra banco errado.
7. Atualizar documentacao de deploy/go-live se encontrar lacunas.

## Restrições obrigatorias

Nao faca:

- Nao leia `.env` real.
- Nao exponha secrets, tokens, cookies, senhas ou URLs privadas de banco.
- Nao acesse producao/staging.
- Nao rode migrations contra banco remoto.
- Nao altere DNS.
- Nao faça push/commit.
- Nao sobrescreva o servico Render existente se ele estiver sendo usado por `api.travelplataforma.com.br`.
- Nao reduza nenhuma protecao de tenant isolation, RLS, rate limit, auth ou CSP.

## Pontos de atencao

Hoje existe `scripts/travel-lite-migrate.cjs`, que foi feito para ambiente local e recusa:

- `NODE_ENV=production`
- hosts remotos em `DATABASE_URL`/`MIGRATIONS_DATABASE_URL`

Isso e bom para seguranca local, mas bloqueia deploy real se nao houver um processo de migration online aprovado.

Avalie a melhor solucao:

- manter esse runner local intacto e criar outro script especifico para deploy online, ou
- adicionar uma trava explicita muito forte para permitir banco remoto somente com variaveis de aprovacao, ou
- apenas documentar um processo manual seguro se a mudanca de codigo nao for recomendada agora.

Qualquer proposta deve ser fail-closed.

Outro ponto importante: `docs/travel-lite/RELEASES.md` lista credenciais locais
de demonstracao. Para ambiente online, recomende credenciais proprias, com senha
temporaria e troca obrigatoria no primeiro acesso. Nao copie senhas locais como
credenciais finais de producao.

## Entregavel

Crie um arquivo de relatorio em:

`.claude/2026-10-02_GOLIVE-TRAVEL-LITE-RENDER-REPORT.md`

O relatorio deve conter:

1. Resumo executivo.
2. Estado atual do deploy.
3. Bloqueios encontrados.
4. Alteracoes feitas, se houver.
5. Variaveis de ambiente finais recomendadas para Render.
6. Passo a passo para criar/configurar o Web Service no Render.
7. Plano seguro de migrations online.
8. Checklist antes de liberar para a Gadotti.
9. Comandos de validacao executados e resultado.
10. Riscos residuais.

Se fizer alteracoes de codigo/documentacao, liste todos os arquivos alterados e rode validacoes relevantes.

