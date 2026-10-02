# Travel Lite — Onboarding

Status: implemented on 2026-10-01 with two documented deviations (see “Implementação”).

## Objetivo

Fazer a agência começar a operar rapidamente, sem integração longa como na plataforma Full. O onboarding do Lite deve ser prático, guiado e orientado a tarefas.

## Experiência recomendada

O primeiro acesso do MASTER deve mostrar um checklist:

1. Conferir nome da agência.
2. Configurar logo e cores.
3. Cadastrar ou revisar vendedores.
4. Cadastrar conta financeira.
5. Cadastrar categorias de venda.
6. Cadastrar primeiro cliente.
7. Criar primeira venda.
8. Abrir a área de ajuda.

## Onde aparece

- Dashboard com base vazia.
- Configurações.
- Página de ajuda.

## Regras

- O checklist não deve bloquear o uso do sistema.
- Cada item deve apontar para a tela correta.
- Itens concluídos devem ser detectados por dados reais, não por clique manual.
- O onboarding deve respeitar permissões. Um SELLER não deve ver tarefas administrativas.

## Conteúdo mínimo

- Texto curto por etapa.
- Exemplo do que preencher.
- Link para artigo da ajuda.
- Indicador visual de progresso.

## Métrica de sucesso

Uma agência deve conseguir sair de login inicial para primeira venda confirmada com mínimo suporte externo.

## Fora do escopo imediato

- Fluxo comercial de contratação.
- Treinamento humano agendado.
- Onboarding da plataforma Full.

## Implementação (2026-10-01)

- Checklist em `apps/travel-lite/src/FirstRunChecklist.tsx`, exibido nos três pontos
  previstos: Dashboard, Configurações e página de Ajuda. Nunca bloqueia o uso.
- 6 etapas detectadas por dados reais, na ordem deste documento: vendedores, conta
  financeira, categorias de venda, primeiro cliente, primeira venda e “abrir a ajuda”.
  Sinais: `GET /sellers`, `/financial-accounts`, `/categories`, `/customers` e `/sales`
  (todas `pageSize=1`); a etapa de ajuda usa a flag `travel_lite_help_seen` em
  `localStorage`, gravada ao montar `/ajuda`.
- Conteúdo mínimo atendido: texto curto, exemplo do que preencher (“Ex.: Ana Souza — 5%
  sobre o bruto.”), link “Ver na ajuda” para o artigo de cada etapa e indicador de
  progresso (“N de M etapas concluídas” + barra `role="progressbar"`).
- Permissões respeitadas: só monta etapas que o perfil pode executar (um SELLER vê
  apenas cliente, primeira venda e ajuda); requisição falha esconde só a linha
  (`Promise.allSettled`); o card some quando todas as etapas visíveis estão concluídas.
- **Desvio 1:** os itens 1 e 2 (“Conferir nome da agência” e “Configurar logo e cores”)
  ficaram de fora — não há endpoint de nome do tenant na API-lite nem tela de branding;
  incluí-los deixaria etapas pendentes para sempre, contra a regra “detectado por dados
  reais”. A identidade visual aparece como etapa planejada no artigo *Primeiros passos*
  (básica no Lite, avançada no Pro, completa no Full).
- **Desvio 2:** a etapa 8 (“Abrir a área de ajuda”) é detectada por flag de frontend
  (`localStorage`), sem backend novo; é lida de forma lazy, após a montagem, para marcar
  concluída já na primeira visita.
- Testes: `apps/travel-lite/src/App.test.tsx` (progresso e exemplos, etapas novas,
  ocultar com base populada, checklist em Configurações, gating por perfil).
- Relatório do prompt: `.opencode/PX3-HELP-CENTER-ONBOARDING-REPORT-2026-10-01.md`.
