# Visual Reconstruction - Checkpoint 50%

Data: 2026-09-08
Worktree: current visual reconstruction worktree
Branch: `feature/visual-reconstruction`

## Escopo concluido neste bloco

- Reconstrucao visual do app `apps/customer` para separar melhor:
  - experiencia interna da agencia/CRM;
  - portal do cliente final.
- Shell interno do customer app com:
  - sidebar escura de agencia;
  - grupos de navegacao por area;
  - topbar com busca, data, notificacao, CTA e identidade do usuario.
- Lista de clientes reconstruida como tela CRM:
  - cabecalho operacional;
  - filtros;
  - tabela mais densa e escaneavel;
  - acao de detalhes preservada para compatibilidade.
- Formulario de cliente reconstruido em secoes:
  - dados pessoais;
  - contato;
  - acoes fixas no rodape da tela.
- Customer 360 reconstruido como perfil de relacionamento:
  - header com avatar, status, acoes e contatos;
  - dados pessoais imediatos;
  - KPIs;
  - resumo comercial;
  - preferencias;
  - enderecos, dependentes e documentos;
  - confronto OCR;
  - linha do tempo.
- Portal do cliente ajustado para linguagem e visual mais acolhedores:
  - navegacao lateral warm/coral;
  - icones lucide no lugar de emojis;
  - home com proxima viagem, avisos, pagamento, documentos e resumo.

## Arquivos alterados neste bloco

- `apps/customer/src/components/layout/AppShell.tsx`
- `apps/customer/src/components/layout/Sidebar.tsx`
- `apps/customer/src/components/commercial/Customer360.tsx`
- `apps/customer/src/pages/CustomerDetailsPage.tsx`
- `apps/customer/src/pages/CustomersPage.tsx`
- `apps/customer/src/pages/CustomerFormPage.tsx`
- `apps/customer/src/customer-portal/CustomerNav.tsx`
- `apps/customer/src/customer-portal/CustomerPortalShell.tsx`
- `apps/customer/src/customer-portal/pages/CustomerHomePage.tsx`
- `apps/customer/src/index.css`

## Evidencias geradas

Screenshots atualizados:

- `docs/visual-reconstruction-delivery/screenshots/customer-list.png`
- `docs/visual-reconstruction-delivery/screenshots/customer-360.png`
- `docs/visual-reconstruction-delivery/screenshots/customer-form.png`
- `docs/visual-reconstruction-delivery/screenshots/customer-portal-home.png`

Script de QA visual:

- `docs/visual-reconstruction-delivery/visual_customer_qa.py`

## Verificacao executada

- `npm --workspace @travel-platform/customer run test -- --run src/pages/CustomersPage.test.tsx src/pages/CustomerFormPage.test.tsx src/pages/CustomerDetailsPage.test.tsx src/customer-portal/pages/CustomerHomePage.test.tsx`
  - Resultado: passou, 27 testes.
- `npm --workspace @travel-platform/customer run typecheck`
  - Resultado: passou.
- `npm --workspace @travel-platform/customer run lint`
  - Resultado: passou com 5 avisos existentes em arquivos fora deste recorte direto.
- `git diff --check`
  - Resultado: passou; Git exibiu apenas avisos de normalizacao LF/CRLF.

## Guardrails preservados

- Nao houve mudanca de backend.
- Nao houve mudanca de API contract.
- Nao houve mudanca de autenticacao, autorizacao, tenancy, RLS ou regra financeira.
- Nao houve migracao, dependencia nova, commit, push ou PR.
- Alteracoes mantidas no escopo visual/UX do frontend.

## Observacoes de worktree

O `git status` ainda mostra modificacoes pre-existentes fora do escopo visual deste bloco:

- `apps/agency/vite.config.ts`
- `apps/customer/vite.config.ts`
- `apps/marketing/vite.config.ts`
- `apps/platform-admin/vite.config.ts`
- `infrastructure/docker-compose.local-postgres.yml`
- `services/api/scripts/bootstrap-local-db.cjs`

Esses arquivos nao foram revertidos nem tratados como parte da reconstrucao visual.

## Ponto para continuar

Proximo bloco: avancar para 75%.

Ordem recomendada:

1. Revisar e capturar as telas da agencia ja existentes, principalmente dashboard, financeiro, servicos aereos/terrestres e operacao.
2. Ajustar divergencias visuais contra o pacote V2/V3/V4.
3. Validar platform admin como experiencia separada, com identidade violeta/governanca.
4. Rodar QA visual por viewport desktop/mobile.
5. Atualizar `CHECKPOINT_75_PERCENT.md`.
