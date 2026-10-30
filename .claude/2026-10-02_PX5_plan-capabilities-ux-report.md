# PX5 — UX de recursos do plano (Lite / Pro / Full)

- **Data/hora:** 2026-10-02 00:27
- **Prompt:** `.claude/NEXT-PROMPT-PX5-PLAN-CAPABILITIES-UX.md`
- **Onde:** checkout principal `D:\travel-platform`, branch `feature/px5-plan-capabilities-ux` (criada a partir da `main` em `9df0d6a`). Só frontend, em `apps/travel-lite`.
- **Estado:** implementado e verificado. **Nada commitado, enviado ou publicado.**

## 1. Auditoria

| Ponto | Achado |
|---|---|
| Documento | `PLAN-CAPABILITIES.md` traz a matriz Lite/Pro/Full (9 linhas), os princípios (bloqueio real no servidor, UI só sinaliza, mensagens que explicam valor) e as pendências de produto: limites numéricos, preço, se o Pro existe antes do Full e quem aprova upgrade |
| App | Sem nenhuma tela ou componente de plano. A Ajuda já citava planos em texto (`availability`) e tinha uma FAQ "Qual a diferença entre Lite, Pro e Full?" |
| Backend | Nenhum endpoint de plano no momento da auditoria. Os limites e o plano real teriam de vir da API |
| Textos desatualizados | A Ajuda ainda dizia que a identidade visual "está planejada como etapa seguinte" (3 trechos), mas o branding básico já existe desde o PX2. Corrigido nesta entrega |

## 2. O que foi implementado

### Fonte única dos dados — `src/planCapabilities.ts`
Catálogo estático com as 9 capacidades e os 3 planos, fiel à matriz do documento (rótulos idênticos). `CURRENT_PLAN = 'LITE'` é uma constante informativa. O arquivo diz explicitamente que é **informação, nunca autorização**, e que não traz números, preços nem limites, porque o produto ainda não os definiu.

### Componentes reutilizáveis — `src/planUi.tsx`
- `PlanBadge`: etiqueta discreta "Pro" ou "Full".
- `CapabilityMark`: ✓ (disponível por completo) ou ◐ (versão reduzida ou intermediária), sempre acompanhado do texto e, para leitor de tela, "(versão reduzida)".
- `PlanHint`: uma única linha silenciosa e informativa, com link para a matriz. **Nunca desabilita controle, bloqueia tarefa ou pede algo**; só aparece para capacidades que são reduzidas no plano atual.

### Tela "Recursos do plano" — `/plano`
- Aberta a **qualquer usuário autenticado**, somente leitura e igual para todos os perfis.
- Tabela da matriz com a coluna **Lite · seu plano** destacada; abaixo de 640 px vira um cartão por recurso (reaproveita o `lite-stack` do PX4).
- "Quando faz sentido considerar outro plano": lista objetiva derivada da própria matriz.
- "Quer saber mais sobre outro plano?": explica que valores, limites e condições ainda não estão definidos e que **nada é enviado**. Quem tem gestão de usuários ou de permissões (MASTER) vê o botão **"Copiar resumo para o responsável"**, que só copia um texto para a área de transferência (com plano de contingência: se o navegador negar, mostra o texto numa caixa para copiar à mão). Os demais perfis leem "Fale com o administrador da agência".
- Âncoras por recurso (`/plano#dashboard`).

### Pontos de upgrade leves, sem poluir a operação
- **Dashboard:** uma linha discreta no fim da tela.
- **Importações:** uma linha no topo, sem inventar limites.
- **Configurações › Identidade visual:** uma linha sobre branding básico, mantendo o editor intacto.
- **Configurações:** cartão "Plano e recursos" com o link.
- Nenhum item novo no menu lateral (a operação diária continua limpa).

### Integração com a Ajuda
- Novo artigo **"Planos e recursos"** (o que a tela resolve, passo a passo, erros comuns, permissões) com link para `/plano`, indexado na busca da Ajuda.
- O modelo dos artigos ganhou um campo opcional `link`.
- FAQ de planos aponta para a tela; FAQ do logo e os dois `availability` sobre identidade visual foram **corrigidos** para refletir o que existe hoje.

## 3. Testes

`src/plan.test.tsx` (novo) — **16 testes**:
- **Catálogo:** segue a matriz documentada, o Lite fica operacional para o trabalho diário (clientes, vendas e financeiro completos), resumo sem números inventados nem valores.
- **Página:** SELLER e VIEWER veem a matriz somente leitura e **sem ação administrativa**; um gerente com só `settings.manage` também não vê o botão; o MASTER copia o resumo e **nenhuma requisição de escrita nem endpoint de plano é chamado**; contingência sem área de transferência; **sem preço, checkout ou controle de desbloqueio**; cartões rotulados no celular; exige sessão.
- **Dicas:** dashboard (para todos, com link à linha certa), importação (mantendo a tela de importação intacta e sem números), branding (editor continua utilizável) e cartão em Configurações.
- **Ajuda:** artigo e link, busca, e ausência dos textos antigos de "etapa planejada".

Também ajustei 2 testes existentes que listam todos os links do app (entrou o link discreto do dashboard).

**Os testes de permissão protegem de verdade** (mutação temporária, revertida): ampliar quem vê o botão e mostrar o botão a todos derrubam testes.

## 4. Gates

| Etapa | Resultado |
|---|---|
| lint | **0 erros** (4 warnings `react-refresh` que já existiam) |
| typecheck | OK |
| testes | **83/83** (67 anteriores + 16 novos) |
| build | OK (`dist/` com `index.html`, `manifest.json`, `sw.js`, `icons/`, `assets/`) |

**Atenção, não foi o comando pedido:** `npx turbo run …` **não rodou**, porque o NVM bloqueou o `npx`/`npm` com *"NVM blocked package-manager execution because a delegated command could not be trusted … delegated script identity changed since it was trusted"* (evento `NVM4306`). Seguindo a regra do próprio prompt, rodei cada etapa pelos binários locais em `node_modules` (`eslint`, `tsc`, `vitest`, `vite`), com os mesmos comandos do `package.json`. O turbo chama o `npm` por baixo, então ele também ficaria bloqueado. Isso não é um problema do projeto, é do Node/NVM desta máquina (o `npx` funcionava horas atrás); como o sistema parece ter sido reinstalado em 28/09, vale rodar `nvm reshim` ou reinstalar essa versão do Node. Não mexi nisso. O gate "oficial" via turbo ainda deve ser repetido depois.

## 5. Verificação visual (navegador do app)

App em desenvolvimento contra uma **API de mentira local com dados fictícios** (sem credenciais reais; servidores encerrados e `localStorage` limpo):
- **Desktop (1280 px):** tabela sóbria, coluna "Lite · seu plano" destacada, marcas ✓ e ◐ discretas, aparência de ferramenta de trabalho (não de propaganda).
- **Celular (375 px):** um cartão por recurso, sem rolagem horizontal (largura da página = 375) e botão de 44 px.

## 6. Coordenação: backend em andamento por outro agente

Durante o trabalho apareceram no mesmo checkout, **não criados por mim**: `services/api-lite/src/capabilities.ts`, `services/api-lite/src/routes/plan.ts` (`GET /plan/capabilities`), `services/api-lite/tests/plan-capabilities.test.ts` e uma alteração em `services/api-lite/src/app.ts`. Aparentemente é o contrato de backend dessa mesma fase (o prompt previa esse trabalho para o Opencode). **Não toquei, não rodei e não incluí nada disso nesta entrega.**

- A matriz e a constante `LITE` dele coincidem com as minhas (e ele evolui o modelo com `none`, `status` e `upgradeTo`).
- **Risco de duas fontes:** o catálogo do frontend duplica o do backend. Quando `GET /plan/capabilities` for integrado, o frontend deve **passar a consumir a API** e este catálogo estático vira apenas contingência ou sai, para a fonte única ficar no servidor, como pede o `PLAN-CAPABILITIES.md`. Não liguei agora porque o endpoint ainda não está integrado e fora do meu escopo.
- **Atenção na hora de commitar:** os dois trabalhos estão na mesma árvore e na mesma branch. Devem ser commitados separados: o meu só em `apps/travel-lite`, o do backend só em `services/api-lite`.

## 7. Limites e decisões pendentes

1. **Plano real, limites e preço não existem:** a tela não mostra números nem valores de propósito. Depende das pendências de produto (limites do Lite, preço, se o Pro vem antes do Full).
2. **Quem aprova upgrade é indefinido.** Enquanto isso, só quem gerencia usuários ou permissões (MASTER) vê o botão de copiar o resumo. Se o produto escolher outro papel, é trocar uma linha.
3. **O "pedido" é só um texto copiado.** Não há fila, e-mail ou integração (como pedido).
4. A matriz do Lite descreve **capacidades**, mas a API **não impõe** nenhum limite de plano hoje: nada impede o uso além do "reduzido". A imposição real tem de ser feita no servidor.
5. O artigo de Ajuda e os textos dizem "Lite hoje" porque o plano atual é uma constante. Não há como saber o plano de cada agência até a API expô-lo.
6. Visual avaliado só no navegador do app; sem aparelho real.

## 8. Confirmações

- Não li `.env`; não acessei produção nem staging; não rodei migrations nem Prisma; não instalei dependências.
- **Nenhum recurso é liberado ou bloqueado pelo frontend:** a tela e as dicas só informam, nenhum controle é desabilitado e as permissões continuam vindo da API. SELLER e VIEWER não recebem nenhuma ação administrativa.
- Nada de cobrança, checkout, contrato ou integração externa.
- Meus arquivos: `apps/travel-lite/src` (alterados: `App.tsx`, `App.test.tsx`, `helpContent.ts`, `styles.css`, `pages/BrandingSection.tsx`, `pages/DashboardPage.tsx`, `pages/HelpPage.tsx`, `pages/ImportDataPage.tsx`, `pages/SettingsPage.tsx`; novos: `planCapabilities.ts`, `planUi.tsx`, `pages/PlanPage.tsx`, `plan.test.tsx`). **Sem tocar em `services/api-lite`.**
- **Sem commit, push, PR ou merge.**

## 9. Próximos passos

1. **Decisão:** autorizar o commit do PX5 (só `apps/travel-lite`) e, depois, PR e merge.
2. Corrigir o NVM (`nvm reshim` ou reinstalar o Node) e repetir o gate oficial `npx turbo run lint typecheck test build --filter=@travel-platform/travel-lite --force`.
3. Quando o backend `GET /plan/capabilities` for integrado, trocar a fonte do frontend para a API.
4. Fechar as pendências de produto (limites, preço, Pro antes do Full, quem aprova) para o texto da tela poder ganhar números.
