# Hyperframes Composition Brief: Travel Platform (módulo Travel Lite)

## Objective
Criar um vídeo curto comercial do Travel Platform (produto principal) com o Travel Lite apresentado como módulo dele, voltado a donos e equipes de agências de viagem.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 24 s

## Source Material
- Project root: `D:\travel-platform`
- Primary files read: `apps/travel-lite/index.html`, `apps/travel-lite/src/styles.css`, `apps/travel-lite/src/menu.ts`, `apps/travel-lite/src/pages/DashboardPage.tsx`, `apps/travel-lite/src/pages/SalesPage.tsx`, `apps/travel-lite/src/planCapabilities.ts`, `apps/marketing/src/pages/LandingPage.tsx` (hero e áreas do produto), `docs/travel-lite/product-experience/UPGRADE-TO-FULL.md`, `docs/travel-lite/product-experience/PRESENTATION.md`, `docs/AI_CONTEXT.md`
- Product name: Travel Platform (módulo: Travel Lite)
- Tagline / strongest claim: "Transforme sua agência em uma operação mais inteligente." (módulo Lite: "Vendas, clientes e financeiro da agência.")
- Key UI or visual moment to recreate: tabela de parcelas da tela Vendas; cartões e gráfico do Dashboard; menu lateral
- Copy that must appear verbatim:
  - Transforme sua agência em uma operação mais inteligente.
  - CRM / Cliente 360 · Pipeline comercial · Viagens e operação · Financeiro · Equipe · Portal do cliente
  - Vendas, clientes e financeiro da agência.
  - Dashboard · Vendas · Financeiro · Clientes · Comissões (itens do menu)
  - Parcela · Vencimento · Valor
  - Vendido · Margem · Entradas · Saídas · Vendedor
  - Solicitar acesso

## Creative Direction
- Tone preset: app-store
- Creative direction: tom comercial, para agências de viagem
- Interpretation: cartões limpos, transições de slide/wipe, pt-BR direto, sem jargão de SaaS e sem humor forçado.
- Angle: o caminho completo de uma venda (cliente → venda → comissão) numa tela só, para quem hoje vive de planilha.
- Hook: "Sua agência ainda vive de planilha?"
- Outro / punchline: "Comece pelo Travel Lite. Cresça no Travel Platform." + marca Travel Platform + "Solicitar acesso"
- Avoid:
  - Linguagem genérica de SaaS
  - Preço, prazo, SLA, métricas ou integrações (não definidos pelo produto)
  - Nomes, valores ou dados reais; usar dados fictícios ("Agência Horizonte", "Família Souza", "Cancún", "Ana")
  - Visual abstrato sem relação com o produto

## Visual Identity
- Background: `#f4f6f8`
- Text: `#1a1d21`
- Accent: `#1554d1`
- Display font: Segoe UI (fallback system-ui)
- Body font: Segoe UI
- Visual references from the project: azul primário, superfícies brancas com raio de 8px, tabelas com colunas numéricas à direita, selo verde `#157347`

## Storyboard
Usar o storyboard de `brag-output/brag-plan.md` (revisão 2) como contrato criativo.

1. Gancho — 3 s — pergunta sobre planilha
2. Travel Platform — 5,5 s — marca, hero, grade das 6 áreas
3. Módulo Travel Lite — 7,5 s — Cliente → Venda (parcelas) → Comissão, cursor simulado
4. Dashboard — 4 s — Vendido/Margem, Entradas × Saídas, ranking por Vendedor
5. Outro — 4 s — "Comece pelo Travel Lite. Cresça no Travel Platform.", marca, "Solicitar acesso"

## Audio
- Audio role: cama quente com acentos profissionais esparsos
- Audio arc: baixa no gancho, sobe no reveal, SFX acompanham o fluxo, fade-out sob a marca
- Music: `happy-beats-business-moves-vol-9-by-ende-dot-app.mp3`
- Music treatment: fade-in curto, fade-out final de ~1,5 s
- Music cue guidance: preset `assets/music/cues/happy-beats-business-moves-vol-9-by-ende-dot-app.music-cues.json` (114,84 BPM); strong cues 3,70 s, 12,65 s; grade de beats ~0,52 s
- Audio-reactive treatment: sutil (brilho/profundidade do cartão de destaque)
- Audio-coupled moments:
  - Reveal do Travel Platform — travado no cue 3,70 s
  - Entrada do módulo Lite — cue 10,54 s
  - Parcelas entrando — a cada dois beats
  - Contadores do dashboard — tiques sincronizados
  - Marca final — acento
- SFX selection guidance: cartão para cartões, clique para o cursor, tique para contadores; sem excesso
- SFX analysis guidance: `assets/sfx/sfx-analysis.md`
- Exact SFX choice: Hyperframes escolhe arquivos, tempos, densidade e volume
- Audio files: copiar música e SFX escolhidos para `brag-output/composition/assets/`

## Hyperframes Instructions
Carregar as skills de domínio do Hyperframes (`hyperframes-core`, `hyperframes-animation`, `hyperframes-creative`, `hyperframes-keyframes`, `hyperframes-cli`). Não entrar na entrevista de intenção do `hyperframes`.

Requirements:
- Mostrar UI real recriada do Travel Lite (tabela de parcelas, dashboard, menu).
- Todo texto legível no render final.
- Duração de 24 s (dentro de 15–25 s).
- Incluir música e SFX planejados.
- Rodar `hyperframes check` antes do render.
- Criação e render locais; nada de publicar.
