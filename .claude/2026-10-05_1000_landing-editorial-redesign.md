# Landing do Travel Platform: redesign editorial (opção 3, sem fotos)

Data/hora: 2026-10-05 10:00

## Pedido
Landing "engessada, genérica, com cara de modelo de IA". Direção aprovada: editorial de viagem; sem fotos por ora (futuro upload no painel super admin).

## Alterado (somente `apps/marketing`)
- `index.html`: fontes Fraunces + Inter (Google Fonts).
- `src/index.css`: tokens (areia, areia-escuro, terracota `#a8391a`, azul do produto), fonte serifada, classe `.reveal` com `prefers-reduced-motion`.
- `src/pages/LandingPage.tsx`: reescrita visual. Hero assimétrico em arco, áreas em lista numerada, seção "Módulo Travel Lite", segurança numerada, FAQ em `<details>`, CTA final. Lógica do Landing CMS (hero, CTAs, banners, parceiros, depoimentos, FAQ, `isSafeHref`) preservada. H1 agora é o título do hero.
- Novos: `components/Reveal.tsx`, `components/ImageSlot.tsx` (usa `src` quando houver foto; senão arte de rota), `components/ProductShots.tsx` (telas ilustrativas, dados fictícios, `aria-hidden`).
- Novo teste: `pages/LandingPage.test.tsx` (4 casos).

## Verificação
- `lint`: ok. `typecheck`: ok. `test`: 12/12 (2 arquivos). `build`: ok.
- Conferido no navegador em 1440 px e 375 px; sem rolagem horizontal.
- Servidor de teste na porta 5175 encerrado.

## Pontos de atenção
- Copy novo da seção Lite foi extraída de `docs/travel-lite/product-experience/PRESENTATION.md` (clientes, vendas, comissões, financeiro básico, importação CSV/XLSX, navegador/celular, migração preparada). Precisa de validação comercial antes de publicar.
- Fontes vêm do Google Fonts (requisição externa). Opção: hospedar localmente.
- `ImageSlot` aceita `src`, mas ainda não há campo de imagem no Landing CMS/API; isso é a próxima etapa (upload no super admin).
- Nenhuma dependência instalada; nada commitado.

## Revisões posteriores (2026-10-05)
- Visual: fundo branco + cinza frio `#f3f4f6`, acento cobalto `#1554d1`, cantos quase retos (2–4 px); arco do hero virou retângulo. Tokens renomeados (`paper`, `paper-deep`, `accent`).
- Marca: "Travel Platform" → **"Travel Plataforma"** (igual ao domínio, mercado Brasil) em `apps/marketing`: LandingPage, PricingPage, DemoRequest e `<title>`; artigo ajustado ("a Travel Plataforma").
- Ainda com o nome antigo (fora do escopo desta etapa): `apps/agency`, `apps/customer`, `apps/platform-admin`, `services/api` (e-mails, templates, auth local), `services/api-lite/src/outbox.ts`, descrições em `package.json`, textos vindos do Landing CMS no banco, vídeo v1 em `brag-output/`. Decidir se estende o rename.

## Logo (2026-10-05): conceito B "Bússola" aprovado
- Arquivos: `apps/marketing/public/brand/{logo-completa,logo-completa-escura,icone,icone-escuro}.svg`; `public/favicon.svg` substituído; `index.html` aponta para `/favicon.svg` (antes `/vite.svg`, inexistente).
- React: `src/components/Logo.tsx` + teste; aplicada na barra, rodapé da landing e cabeçalho de Preços. Doc: `docs/00-product/BRAND-LOGO.md`.
- Verificação: lint, typecheck, 14/14 testes, build ok; conferida no navegador.
- Pendente: aplicar nos demais apps/e-mails; Preços/Demo/Trial ainda no visual antigo (não redesenhadas).

## Série de vídeos (2026-10-05): 3 partes de 20 s + versão de 1 min
- Local: `brag-output/serie/` → `parte-1.mp4` (A plataforma), `parte-2.mp4` (módulo Travel Lite), `parte-3.mp4` (resultado e próximo passo), `brag-completo.mp4` (60 s), posters `.jpg`, `share-copy.txt`.
- Fonte: `brag-output/serie/build.py` gera as 3 composições Hyperframes (`parte-N/`) com identidade nova (branco, cobalto, azul-marinho, Fraunces/Inter locais, cantos retos, logo Bússola, "Travel Plataforma"). Música: faixa vol-9 em 3 trechos contínuos (0–20, 20–40, 40–60 s); ganchos "Mas por onde começar?" e "E no fim do mês?" ligam as partes.
- Verificação: `hyperframes check` passou nas 3 (contraste AA), render 1920x1080 h264+aac, 20,0 s cada; final 60,0 s; RMS contínuo nas emendas (20 s e 40 s).
- Dados fictícios (Agência Horizonte, Família Souza, Ana/Bruno/Carla, "128 clientes"). Claims só do que o produto declara; "Instala no celular" vem de PRESENTATION.md (PWA). Vídeo v1 (`brag-output/brag.mp4`) ficou desatualizado (marca/visual antigos).
- Nenhum código do sistema alterado; sem commit.

## Série 2 (2026-10-05): diferenciais, 4 partes de 30 s + versão de 2 min
- Pedido: ritmo mais lento, mostrar diferenciais (pipeline, app do cliente, equipe/usuários), financeiro só como menção, tempo maior; app do cliente = "Minha Viagem"; plataforma = "Travel Plataforma".
- Local: `brag-output/serie-2/` → `parte-1..4.mp4` (+ `.jpg`), `brag-completo-2min.mp4`, `share-copy.txt`; fonte: `build.py` (+ `audio_data30.py`); composições em `parte-N/`.
- Roteiro: 1 Visão (planilha → 3 pilares → financeiro completo) · 2 Pipeline (7 etapas reais, cartão arrastado até Ganho, etapas configuráveis) · 3 App do cliente "Minha Viagem" (Olá, reservas, propostas, documentos, pagamentos, comunicados, ofertas, instalação) · 4 Equipe e acessos (funcionários, 5 papéis, restrições só reduzem acesso, 2FA, auditoria, isolamento; CTA e linha do Travel Lite).
- Música: faixa vol-1 (120 BPM, 2:44) em 4 trechos contínuos de 30 s. Ritmo: textos com 3+ s de leitura, 1 ideia por cena.
- Verificação: `hyperframes check` passou nas 4 partes; render 1920x1080 h264+aac; 30,0 s cada; final 120 s; RMS contínuo nas emendas.
- Conteúdo fundamentado em `LandingPage.tsx`, `PipelinePage.tsx` (nomes de etapas), `CustomerHomePage.tsx`/`CustomerNav.tsx`/`InstallAppBanner.tsx`, `SettingsPage.tsx` (papéis e restrições), `EmployeesPage.tsx`. Dados fictícios (Marina, Família Souza, Carlos M. etc.). Papéis exibidos em português (Dono, Administrador, Gerente, Agente, Visualizador) com descrições resumidas das reais.
- Nenhum código do sistema alterado; sem commit. Série 1 (`brag-output/serie/`) e vídeo v1 ficam como versões anteriores.
- Ajuste de áudio (série 2): o render da parte 3 saiu ~6,5 dB mais baixo que as demais (causa não isolada; `data-volume` não alterou o resultado). Corrigido no pós (`volume=6.5dB` + limitador) em `serie-2/raw/parte-3.mp4`; níveis finais -17 a -18 dB. `raw/` guarda as partes sem miniatura embutida (base da emenda). O arquivo `_descartado-parte-3-sem-ganho.mp4` é o render original e pode ser apagado.

## Revisão do vídeo de 2 min (2026-10-06)
- Pasta nova `brag-output/serie-2-revisada/` (original `serie-2/` preservado): `brag-completo-2min-revisado.mp4` (1920x1080, 120,0 s), `build.py`, `parte-1..4/`, `raw/`, `capturas/`, `CORRECOES.md` (lista de correções com tempos).
- Principais mudanças: abertura com marca e mensagem desde 0 s; wipes no lugar de dissolução (sem cinza); ganchos sem tela vazia nem texto sobreposto; pipeline em câmera ampliada com régua de etapas; mobile com recortes ampliados e celular fora da logo; encerramento com logo/CTA maiores e Travel Lite como "edição simplificada"; área segura 100/80.
- Validação: `hyperframes check` ok; medição própria 0,25 s (área segura, sobreposição, overflow de cartão) com 0 violações; áudio equalizado no pós (+0/+3,3/+6,7/+0,7 dB).
- Nenhum código do sistema alterado; nenhuma dependência instalada; sem commit/push/deploy. Servidor temporário (porta 8099) encerrado; servidor da landing (porta 5175) segue ativo da sessão anterior.
