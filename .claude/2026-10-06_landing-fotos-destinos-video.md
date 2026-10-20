# Landing: fotos de destinos e vídeo mais recente

Data: 2026-10-06 · Só `apps/marketing`. Nenhuma dependência instalada; sem commit.

## Tentativas e decisão
- Não existe conector "Morphix" neste ambiente. A ferramenta equivalente disponível (Higgsfield/"7b8bc15d...") tem geração de imagem bloqueada no plano gratuito (`Requires basic plan or higher`), mesmo com 8 créditos — upgrade custaria US$ 49–99/mês ou exigiria o trial de 3 dias com cartão e cobrança automática depois. **Não contratei nada disso.**
- A Adobe (`25438e72...`) confirmou por escrito que geração de imagem por texto está desligada neste ambiente (`adobe_mandatory_init`: "Generative AI... are not available").
- Caminho usado: **Adobe Stock, filtro `pricing: "free"`** — fotos de banco de imagens licenciáveis sem custo adicional. Cada `asset_license_and_download_stock` retornou `state: "just_purchased"`, ou seja, consumiu uma licença gratuita da conta Adobe conectada (não é dinheiro, mas é uso de conta — registrando por transparência).

## O que entrou
- **Hero** (`/photos/hero-coast.jpg`): falésias de Moher (Irlanda), enquadramento vertical, combina com a moldura em arco e a paleta azul-marinho/cobalto. Adobe Stock #1137065701.
- **Vitrine "Para onde sua agência leva os clientes"** (nova seção, após o hero): 5 fotos — Paris (#329592881), Itália/Burano (#722248169), Espanha/Sagrada Família (#184814123), Grécia/Santorini (#238194647), Brasil/Copacabana (#439912845). Grade 2 colunas no mobile, 5 no desktop.
- **Seção "Veja na prática"** (nova, após a vitrine): o vídeo mais recente (`brag-output/serie-2-revisada/brag-completo-2min-revisado.mp4`, 2 min), copiado para `public/video/travel-plataforma.mp4` (+ `.jpg` de poster). `<video controls preload="metadata">`: não baixa o arquivo até o visitante clicar em play.
- Todas as fotos redimensionadas e recomprimidas com ffmpeg (1000–1400 px de largura) antes de salvar em `public/photos/`: de ~12 MB para ~2 MB no total.

## Verificação
- `lint`, `typecheck`, `test` (14/14) e `build` do `marketing`: todos passam.
- Conferido no navegador: hero, vitrine de destinos e seção de vídeo (com o poster certo) em 1920 px; mobile 375 px sem rolagem horizontal.
- Servidor de desenvolvimento (porta 5175) deixado rodando para você conferir.

## Pendências / pontos de atenção
- As imagens são só ilustrativas (não são destinos reais vendidos pela agência nem prometem cobertura geográfica — a copy não afirma isso).
- `alt=""` nas fotos de destino e no hero: são decorativas, o texto ao lado já descreve o conteúdo; ajustar se depois quiser texto alternativo descritivo.
- O vídeo de 11 MB fica em `public/`, versionável; considerar hospedagem externa (ex.: Vercel Blob/S3) antes do deploy real, para não inflar o repositório.
- Se quiser gerar imagens 100% customizadas (não-banco) futuramente, as opções são: (a) assinar o Higgsfield/Morphix (pago), ou (b) usar outra ferramenta de geração com custo explícito — nenhuma delas foi contratada agora.
