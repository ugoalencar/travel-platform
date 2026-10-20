# Revisão do vídeo "Travel Plataforma" (2 min): lista de correções

Original preservado: `brag-output/serie-2/brag-completo-2min.mp4`.
Versão revisada: `brag-output/serie-2-revisada/brag-completo-2min-revisado.mp4` (1920x1080, 30 fps, 120,0 s, h264 + aac).
Fonte: `build.py` (gera `parte-1..4/index.html`); render por parte em `raw/`; capturas em `capturas/`.

Tempos abaixo são do vídeo completo (parte 1 = 0–30 s, parte 2 = 30–60 s, parte 3 = 60–90 s, parte 4 = 90–120 s).

## Problemas encontrados no original
- 0–1,5 s: tela quase vazia, só o chip "pago?" solto; marca ausente.
- ≈32 s e ≈94 s: o gancho antigo saía antes de o novo entrar (≈0,5 s de navy vazio).
- ≈34,5 s, ≈86 s, ≈96 s: dissolução claro↔navy passando por cinza lavado (o "escurecimento" do mobile em ≈86 s era isso, não um efeito intencional).
- Pipeline (≈36–52 s): 7 colunas de 232 px com texto pequeno; conteúdo a <100 px da borda.
- Mobile (≈64–86 s): celular pequeno, tela vazia, moldura passando de 80 px do topo e da base, celular cobrindo a logo (versão intermediária).
- Telas do sistema inteiras com texto minúsculo.
- Encerramento fraco: logo pequena, CTA discreto.

## Correções (tempos no vídeo revisado)
| Tempo | Correção |
|---|---|
| 0–5 s | Marca no canto desde 0,05 s e mensagem principal desde 0,15 s ("Sua agência ainda vive de planilha?"). Os chips soltos viraram uma planilha composta (colunas A/B, linhas numeradas, células com "?"), que entra por linha a partir de 0,7 s. |
| 4,8–12 s | Corte por wipe (sem dissolver); conteúdo entra junto com o wipe, sem tela branca vazia. Marca grande + mensagem de posicionamento. |
| 11,6–24 s | Três pilares (Pipeline, App do cliente, Equipe e acessos) com 3,5 s por item e texto ≥ 34 px. |
| 27,4–33 s | Gancho "Tudo começa no primeiro contato." com sublinhado animado durante a pausa. A troca para "Do primeiro contato à venda." agora é contínua (saída 0,35 s e entrada logo em seguida, sem tela vazia e sem texto sobreposto). |
| 34,6–52 s | Pipeline: quadro ampliado, 3 colunas por vez (cartões 36 px / 30 px / 34 px), régua das 7 etapas no topo que acompanha o cartão, câmera que desloca coluna a coluna só depois de cada soltura, cursor e cartão dentro do quadro. O cartão não passa mais por cima de outro (desce para a linha livre). Selo "Ganho" no canto, dentro da área segura. |
| 51,2–57 s | "Etapas configuráveis por agência": formulário maior, texto ≥ 28 px. |
| 56,8–61 s e 86,2–91 s | Ganchos finais com sublinhado animado; sem pausa estática "de falha". |
| 64,6–77,4 s | Mobile: celular 400x810 abaixo da logo (sem sobreposição), tela espelhando a home real do portal (Olá, reservas, propostas, próxima viagem, comunicados, ofertas, navegação com 5 abas). Um recorte ampliado (2x) por vez com contorno no celular. Corrigidos chip "Pagamentos" que estourava o cartão e o texto que passava da base do cartão de comunicados. |
| 76,6–86,4 s | Instalação: banner com botão, toque, tela inicial com o ícone "Minha Viagem". Entrada do celular só com fade e leve escala (antes subia e passava da margem inferior). Troca para o gancho por wipe (sem escurecimento). |
| 94,2–111 s | Funcionários, papéis (5, com a descrição real de cada um) e "Restrições só reduzem acesso", todos com tamanhos maiores e dentro da área segura. |
| 111–115,6 s | Segurança por padrão (3 itens). |
| 115,6–120 s | Encerramento: logo grande (240 px) centralizada, CTA "Solicitar acesso" 680x130 com leve pulso, e linha separada e clara: "Quer começar menor? O Travel Lite é a edição simplificada." (Travel Plataforma = produto principal; Travel Lite = edição simplificada). |
| Todo o vídeo | Área segura 100/80 px aplicada; logo como marca-d'água em todas as cenas; hierarquia única (serifada para títulos, Inter para texto/UI; texto mínimo 28 px, quase todo ≥ 30 px). |
| Áudio | Música contínua (faixa 120 BPM em 4 trechos de 30 s). O render de cada parte sai com nível próprio; equalizei no pós (+0 / +3,3 / +6,7 / +0,7 dB) e limitei picos: média ≈ -17,6 dB, pico -1,0 dB, sem saltos nas emendas. Não há narração; SFX continuam alinhados às animações. |

## Validação feita
- `hyperframes check` nas 4 partes: sem erros (contraste AA, layout).
- Medição própria da linha do tempo, de 0,25 em 0,25 s em cada parte (inclusive entradas/saídas): 0 elementos fora da área segura 100/80; 0 sobreposições entre textos, logos e telas; 0 conteúdos ultrapassando a borda do próprio cartão. As medições foram validadas reintroduzindo erros de propósito (o detector acusou).
- Leitura reduzida a 960x540 (capturas `capturas/leitura-960-*.png`) e contact sheets do vídeo final em 0–6 s, 29–34 s, 40–58 s, 64–90 s, 89–95 s e 110–120 s.
- Fontes (Fraunces e Inter) carregadas localmente; GSAP local; imagens e SVGs locais.
- Duração 120,0 s; 3600 quadros; áudio e imagem emendados sem desvio.

## Limites e decisões
- "Telas reais": as capturas existentes no repositório (`qa-screenshots/`) mostram "Authentication required" e os apps só renderizam com API e banco (migrar/subir infraestrutura não foi autorizado). As telas do vídeo são recriações fiéis dos componentes reais (rótulos, etapas, papéis e cores), com dados fictícios (Marina, Família Souza, Horizonte etc.), sem dados pessoais.
- Nome: mantido **Travel Plataforma** (decisão anterior do usuário; o texto do pedido citava "Travel Platform"). App do cliente: **Minha Viagem** (como no código).
- Nenhuma funcionalidade, preço, métrica ou integração nova foi afirmada.
