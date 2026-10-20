# Marca — Travel Plataforma

**Adaptação**: este skill foi feito pra batizar um negócio novo. A Travel
Plataforma já existe, já tem nome, logo e cores em produção
(`apps/marketing/src/components/Logo.tsx`, `apps/marketing/src/index.css`).
Por isso, os passos 2-4 abaixo avaliam o que já existe contra o
posicionamento que o pacote encontrou (`founder/marketing.md`), em vez de
gerar 10 nomes novos para um negócio que já opera sob este nome.

## 1. O nome e a checagem que falta

**Nome atual: "Travel Plataforma"** — já em uso em produção, domínio
`travelplataforma.com.br` registrado e funcionando, com os apps
`app.travelplataforma.com.br` e `travellite.travelplataforma.com.br` já no
ar. Não há motivo, vindo desta pesquisa, pra recomendar troca de nome.

**O que não foi verificado nesta conversa, e deveria ser, antes de escalar
investimento em marketing**: se "Travel Plataforma" está registrado como
marca no INPI (Instituto Nacional da Propriedade Industrial, o registro de
marcas do Brasil). Um nome tão descritivo ("travel" + "plataforma") pode ser
difícil de registrar por ser genérico, e nenhum concorrente achado na
pesquisa (`founder/competitors.md`) usa nome parecido — então o risco de
confusão com concorrente é baixo, mas o risco de *não conseguir registrar*
por ser descritivo é uma pergunta real pra um advogado de marcas responder,
não eu. Isto não é parecer jurídico.

- Busca pública que o usuário pode fazer agora: [busca de marcas no INPI](https://busca.inpi.gov.br/pePI/) pelo termo "Travel Plataforma" e variações, na classe de serviços de software/SaaS (classe 42) e de agenciamento de viagens (classe 39).
- Handles: `@travelplataforma` — não verificado nesta conversa se está livre no Instagram/TikTok/X; checar diretamente.

## 2. Voz e promessa

**A promessa, em uma linha**: *agência de viagem organiza cliente, orçamento
e venda num lugar só — e para de perder venda porque ninguém viu a cotação a
tempo.*

**Tagline, três opções** (testar com o público real, nenhuma testada no
painel):
1. "Sua agência, fora da planilha."
2. "O sistema que sua agência já devia ter."
3. "Nenhuma venda perdida na planilha."

**A voz, em três adjetivos** (calibrados pela honestidade que o board e a
pesquisa de concorrentes exigiram — nunca prometer o que o produto não
entrega hoje):

| adjetivo | fazer | não fazer |
| --- | --- | --- |
| **Direta** | Dizer exatamente o que funciona hoje e o que está em desenvolvimento, como em `founder/pitch.md`. | Usar linguagem vaga tipo "solução completa de gestão" sem dizer o que está pronto. |
| **Prática** | Falar da dor real (planilha, WhatsApp, venda perdida), nas palavras que o painel de compradores usou. | Falar de "transformação digital" ou jargão de inovação que nenhum comprador do painel usou. |
| **Sem enrolação sobre o que falta** | Nomear "cobrança automática e nota fiscal em desenvolvimento" como fato, sempre que relevante. | Deixar a lacuna implícita ou deixar o cliente descobrir sozinho depois de assinar. |

**Antes/depois de uma linha do pitch** (`founder/pitch.md`):
- Antes (mais genérico, versão anterior ao offer): *"A Travel Plataforma é
  um sistema online para agências de viagem organizarem clientes, orçamentos
  e vendas em um só lugar."*
- Depois (mais direto, na voz acima): *"Pare de perder venda porque ninguém
  viu a cotação na planilha a tempo — é pra isso que a Travel Plataforma
  existe."*

## 3. O visual, como já está (briefing, não mood board)

### Cor

Tokens reais de `apps/marketing/src/index.css`, com o teste de contraste
rodado agora (fórmula WCAG, não estimativa):

| cor | hex | função | contraste em branco | passa AA pra texto normal (4.5:1)? |
| --- | --- | --- | ---: | --- |
| Navy | `#0f2a4a` | texto principal, títulos | 14,48:1 | Sim, com folga (passa até AAA) |
| Accent/cobalt | `#1554d1` | links, botões, destaque | 6,52:1 | Sim (passa AA, não passa AAA de 7:1) |
| Cyan | `#06b6d4` | **só decorativo** | 2,43:1 | **Não** — nunca usar como cor de texto em fundo branco |
| Paper-deep | `#f3f4f6` | fundo de seção alternado | — | É fundo, não texto |

**Achado real deste teste**: o cyan (`#06b6d4`), que aparece nos tokens do
CSS, **falha o contraste mínimo de acessibilidade (WCAG AA) se usado como
texto em fundo branco** — 2,43:1, bem abaixo do mínimo de 4,5:1. Usar só
como elemento decorativo (ícone, linha, destaque gráfico pequeno), nunca
como cor de texto ou de botão com texto por cima.

### Tipografia

Já definida: **Fraunces** (serifada, para títulos/display) e **Inter**
(sans-serif, para texto) — ambas fontes gratuitas (Google Fonts), sem
problema de licença. Nenhuma mudança recomendada; a combinação serifada +
sans já dá o tom "editorial" que a sessão anterior escolheu deliberadamente
(contra o visual "pastel/arredondado" que o fundador rejeitou).

### Logo

O logo atual é um wordmark desenhado à mão (traço único, sem depender de
fonte instalada) — **não é literalmente um ícone de bússola**, apesar do
conceito ter sido escolhido com esse nome numa sessão anterior. Está
funcional e consistente com a direção visual branca/cobalt escolhida. Nenhum
motivo encontrado nesta pesquisa pra redesenhar.

**Onde precisa funcionar** (checar, não assumido): favicon/ícone de app em
32px (os traços finos do wordmark podem ficar ilegíveis muito pequenos —
vale conferir visualmente), cabeçalho do site, e qualquer peça de
marketing impressa/PDF que vier a existir.

### Os cinco primeiros pontos de contato

1. **A home/landing page**: já existe, já reflete a direção visual branca +
   cobalt. Ajustar a copy do hero pra usar a promessa da seção 2 acima
   ("pare de perder venda na planilha"), em vez de linguagem genérica de
   módulos.
2. **O cadastro/onboarding**: deve ser o primeiro lugar que menciona o
   Programa Agência Pioneira e a garantia de migração — é onde a oferta
   (`founder/offer.md`) precisa aparecer, não só na landing page.
3. **A confirmação de migração concluída**: é o momento de confiança mais
   importante identificado pelo painel — vale um e-mail/mensagem específico,
   não genérico, confirmando que os dados vieram inteiros.
4. **O primeiro post nos grupos/associações** (`founder/marketing.md`,
   canal nº 1): deve usar a voz "direta, prática, sem enrolar sobre o que
   falta" — nunca o tom de anúncio genérico de SaaS.
5. **A resposta à primeira reclamação**: dado que dois concorrentes
   (`founder/competitors.md`: Omie, PHPTravels) têm suporte lento como ponto
   fraco documentado, a resposta rápida e pessoal à primeira reclamação real
   é uma oportunidade de diferenciação, não só um dever.
