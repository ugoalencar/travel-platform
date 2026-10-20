# Relatório — PX3-HELP-CENTER-ONBOARDING

- **Prompt:** `.opencode/NEXT-PROMPT-PX3-HELP-CENTER-ONBOARDING.md`
- **Data/hora:** 2026-10-01 20:11 (America/Sao_Paulo)
- **Local de trabalho:** `D:\travel-platform` (checkout principal, branch `main`)
- **Escopo:** Evoluir a Central de Ajuda (`/ajuda`) e o onboarding do Travel Lite, conforme
  `docs/travel-lite/product-experience/HELP-CENTER.md` e `ONBOARDING.md`. Frontend/API-lite apenas;
  sem CMS remoto, sem novas rotas de backend, sem migrations, sem dependências novas, sem `.env`.

## 1. O que foi entregue

### 1.1 Central de Ajuda (`/ajuda`)

- **Busca simples** no topo: campo `Buscar na ajuda` filtra artigos e FAQ em tempo real,
  com normalização pt-BR (minúsculas, sem acentos, flexão `ão`→`ões`), contador de resultados e
  mensagem de “Nenhum resultado para …” com sugestões.
- **Índice navegável** (âncoras por área), ocultado enquanto o usuário busca.
- **9 artigos** no padrão de conteúdo da spec, cada um com blocos: *O que tela resolve*,
  *Quando usar*, *Campos obrigatórios*, *Exemplo preenchido*, *Passo a passo*, *Erros comuns*,
  *Permissões necessárias*, *Se algo não aparecer*:
  `Primeiros passos`, `Dashboard`, `Clientes`, `Vendas`, `Importação de planilhas`,
  `Financeiro`, `Comissões`, `Vendedores`, `Configurações e permissões`.
- Blocos extras de status preservados/adaptados do conteúdo anterior: **Status das vendas**,
  **Status das comissões**, **Perfis e permissões**, **Nenhum indicador disponível para o seu perfil**.
- **FAQ (11 perguntas)** — menu/botão ausente, primeira venda, desfazer cancelamento, comissão
  “Sem regra”, dry-run da importação, carteira de clientes, fail-closed sem vendedor vinculado,
  aprovação/pagamento de comissão, diferença Lite/Pro/Full, logo e cores, senha de usuário.
- **Citação Lite/Pro/Full** em notas de disponibilidade (`availability`) por artigo (dashboard,
  importação, financeiro, branding/migração) derivadas de
  `product-experience/PLAN-CAPABILITIES.md`, sem poluir o fluxo principal.
- **Navegação por hash**: `Link` para `/ajuda#<área>` (checklist, empty states, acesso negado)
  rola até o artigo (`scrollIntoView`) e realça via CSS `section:target`.
- Conteúdo 100% estático em `src/helpContent.ts` — sem chamadas de rede, sem segredos, sem dados
  reais (exemplos fictícios: Maria Souza, Ana Souza, VND-0001, Banco do Brasil — CC 1234).

### 1.2 Onboarding (checklist “Prepare sua agência”)

- Componente extraído de `DashboardPage.tsx` para **`src/FirstRunChecklist.tsx`** e reutilizado em
  **Dashboard**, **Configurações** e **página de Ajuda** (os três pontos previstos em ONBOARDING.md).
- **Etapas detectadas por dados reais** (não por clique), na ordem do ONBOARDING:
  1. Vendedores (`GET /sellers`, gating `sellers.read`/CTA `sellers.manage`)
  2. Conta financeira (`GET /financial-accounts`, `settings.manage`)
  3. Categorias de venda (`GET /categories`, `settings.manage`)
  4. Primeiro cliente (`GET /customers`, `customers.create`)
  5. Primeira venda (`GET /sales`, `sales.create`) — **nova**
  6. Abrir a área de ajuda (flag `travel_lite_help_seen` gravada ao montar `/ajuda`) — **nova**
- **Indicador de progresso**: “N de M etapas concluídas” + barra `role="progressbar"` com
  `aria-valuemin/max/now`.
- **Exemplo do que preencher** por etapa (ex.: “Ex.: Ana Souza — 5% sobre o bruto.”) —
  conteúdo mínimo da spec.
- **Link “Ver na ajuda”** por etapa pendente, apontando para o artigo correspondente
  (`/ajuda#vendedores`, `#financeiro`, `#vendas`, `#clientes`).
- **Permissões respeitadas**: SELLER vê apenas cliente/venda/ajuda; requisições falham com
  `allSettled` e a linha falha some (regressão preservada); o card some quando tudo concluído.
- O card nunca bloqueia o uso (aparece como card comum).

### 1.3 Ajuda contextual (links a partir de estados existentes)

- **Acesso negado** (`App.tsx`): novo link `Ver permissões na ajuda` → `/ajuda#configuracoes`,
  ao lado de `Voltar ao dashboard`; o painel in-place e a explicação de permissão continuam.
- **Empty states** com link `Ver na ajuda` (ghost): Clientes, Vendedores, Vendas, Comissões,
  Financeiro (A receber, A pagar, Pagamentos), e `Ver primeiros passos na ajuda` em Cadastros.
- **Dashboard**: mensagem de “Nenhum indicador disponível para o seu perfil” ganha
  `Ver permissões na ajuda`.

## 2. Decisões e desvios documentados

- **ONBOARDING itens 1 e 2 (“Conferir nome da agência” e “Configurar logo e cores”)** ficaram
  **fora do checklist**: não existe hoje nem endpoint de nome do tenant na API-lite nem tela de
  branding; incluí-los violaria a regra “itens concluídos detectados por dados reais” (ficariam
  pendentes para sempre). O artigo `Primeiros passos` cita a identidade visual como etapa
  planejada (básica no Lite, avançada no Pro, completa no Full).
- **“Abrir a área de ajuda”** usa `localStorage` (`travel_lite_help_seen`) por ser evento de
  frontend sem backend novo; é lida de forma lazy (resolved dentro do `allSettled`, após os
  efeitos de montagem), então visitar `/ajuda` marca a etapa como concluída no mesmo ciclo.
- A etapa de ajuda só entra no card quando existe ao menos uma etapa de dados visível —
  evita um card de checklist órfão em perfis sem tarefas administrativas.
- Conteúdo de permissões derivado de `ACCESS-CONTROL.md` + `services/api-lite/src/routes/*`
  (`imports.manage` confirmado como MASTER/ADMIN/MANAGER na migration 005) — sem inventar
  regras de negócio.
- Sem alterações em backend, migrations, `packages/domain`, segurança ou tenant isolation.

## 3. Arquivos

**Novos**
- `apps/travel-lite/src/helpContent.ts` — artigos, FAQ e índice de busca.
- `apps/travel-lite/src/FirstRunChecklist.tsx` — checklist extraído e enriquecido.

**Modificados**
- `apps/travel-lite/src/pages/HelpPage.tsx` — reescrito (busca, índice, artigos, FAQ, flag, hash).
- `apps/travel-lite/src/pages/DashboardPage.tsx` — checklist removido (importa o novo), link de ajuda.
- `apps/travel-lite/src/pages/SettingsPage.tsx` — renderiza o checklist.
- `apps/travel-lite/src/App.tsx` — link de ajuda no `AccessDenied`.
- `apps/travel-lite/src/pages/{CustomersPage,SellersPage,SalesPage,CommissionsPage,FinancePage,CatalogPage}.tsx`
  — links `Ver na ajuda` nos empty states.
- `apps/travel-lite/src/styles.css` — estilos de busca/índice/blocos, progresso e linhas do checklist,
  realce `section:target`.
- `apps/travel-lite/src/App.test.tsx` — 3 testes novos + 6 estendidos.

## 4. Testes

- `apps/travel-lite`: **24/24** (`App.test.tsx` 19 + `ui.test.tsx` 5).
  - Novos: filtro da busca + FAQ + mensagem de vazio; checklist em Configurações; (estendidos)
    progresso/exemplos/etapas novas no Dashboard, flag de ajuda vista, link do acesso negado,
    link de ajuda no empty state de clientes, esconder checklist com base populada + `/sales`.
  - Regressões preservadas: menu labels exatos, SELLER só vê o que pode, linha com request
    falho some, estados vazios pt-BR, confirms de cancelamento/desativação.
- `services/api-lite`: **97/97** (inalterado).

## 5. Gates

| Gate | Resultado |
|---|---|
| `npx turbo run lint typecheck test build --filter=@travel-platform/api-lite --filter=@travel-platform/travel-lite --force` | **8/8 OK** (lint: 0 erros, 4 warnings pré-existentes em `auth.tsx`/`charts.tsx`/`ui.tsx`) |
| `npx tsc -p tsconfig.json --noEmit` | **ROOT-TSC-OK** |
| `npx vitest run` (apps/travel-lite) | **24/24** |

## 6. Fora de escopo / próximos passos

- Itens de branding (logo/cores) e nome da agência: aguardam tela + endpoint (ver desvio §2).
- Manual do usuário em Markdown/PDF (`USER-MANUAL-PLAN.md`): depende de branding/login,
  help center real, mobile/PWA e readiness de migração — este entrega o “help center real”.
- CMS remoto, chatbot e vídeos: explicitamente fora do escopo da spec.
- Gate `npm run test` da plataforma permanece FAIL estrutural/ambiental (57 testes
  `services/api/tests/` com container hardcoded) — alheio à Lite, já reportado.

## 7. Documentação atualizada (pós-implementação)

- `docs/travel-lite/product-experience/HELP-CENTER.md` — linha
  `Status: implemented (2026-10-01)` + seção *Implementação* (rota, conteúdo, busca,
  FAQ, links contextuais, testes).
- `docs/travel-lite/product-experience/ONBOARDING.md` — linha
  `Status: implemented (2026-10-01)` + seção *Implementação* com as 6 etapas detectadas
  por dados e os **2 desvios** (itens 1–2 fora; etapa 8 via `localStorage`).
- `docs/travel-lite/PILOT-READINESS-CHECKLIST.md` — 2 itens novos em Product
  (help center e checklist de onboarding).
- Total: 3 arquivos, +57 linhas, sem alteração de código.
