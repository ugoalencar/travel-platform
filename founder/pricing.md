# Preço — Travel Plataforma

## 1. O preço, e por quê

**O plano Inicial (R$ 99/mês) fica dentro da faixa aceitável e muito perto do
ponto de indiferença (IPP).** Os 20 compradores simulados do painel deram:

| ponto | valor | o que significa |
| --- | ---: | --- |
| PMC | R$ 49,36 | abaixo disso, parece barato demais pra ser bom |
| OPP | R$ 50,45 | menor resistência (tão barato quanto caro) |
| IPP | **R$ 98,94** | tantos chamam de pechincha quanto de caro |
| PME | R$ 199,07 | acima disso, gente demais não compra |

Faixa aceitável: **R$ 49,36 a R$ 199,07**. O R$ 99 atual está, por coincidência
quase exata, no ponto de indiferença (R$ 98,94) — o preço com menos atrito
possível segundo este painel. Isso é um sinal forte de que o plano Inicial
está bem calibrado, **assumindo que a margem no CFO sustente esse preço**
(`founder/numbers.json` ainda não existe — `/founder-cfo` não rodou. Esse
número não foi inventado aqui; é pendência explícita).

**O plano Profissional (R$ 299/mês) está ACIMA da faixa aceitável** (PME =
R$ 199,07). Isso não significa que R$ 299 esteja errado — agências maiores
(11-50 pessoas) têm orçamento diferente das agências pequenas/solo que
dominam este painel (16 de 20 buyers eram solo/micro ou pequena) — mas é um
risco real a testar antes de assumir que o preço está certo: o painel sugere
que, para o comprador típico simulado, R$ 299 já passa da linha de "caro
demais pra comprar".

**Contra os concorrentes** (de `founder/competitors.md`, só quem publica
preço em reais):
- Agendor: R$ 59-156/usuário/mês — cobra por assento, não por agência. Uma
  agência de 10 pessoas pagaria R$ 590-1.560/mês no Agendor pelo equivalente
  ao que o plano Inicial da Travel Plataforma cobra R$ 99 fixo. Essa é a
  comparação mais direta e mais favorável à Travel Plataforma.
- Omie: a partir de R$ 309/mês — categoria diferente (ERP fiscal completo),
  mas é o teto que um comprador já está disposto a considerar pagar por
  software de gestão.
- PaxGo, PaxPro, Benner Turismo (os concorrentes especializados em turismo):
  nenhum divulga preço publicamente — não dá pra comparar diretamente.

## 2. A escada de planos

A estrutura atual (Inicial R$ 99 / Profissional R$ 299 / Empresarial sob
consulta) já é uma escada bom/melhor/ideal por tamanho de equipe (10 / 50 /
ilimitado usuários). A lacuna de R$ 99 pra R$ 299 (triplicar o preço) é um
salto grande sem um degrau no meio — e R$ 299 cair fora da faixa aceitável
do painel reforça isso. Vale testar um degrau intermediário (ex.: R$ 179-199,
dentro do PME) antes de assumir que o salto direto pra R$ 299 converte bem.

## 3. A oferta de abertura

O painel deixou claro (ver `founder/panel/results.md`) que o motivo de recusa
dominante **não é preço — é falta de prova** (14 de 16 recusas citam a
ausência de agências reais usando o sistema). Por isso, a oferta de abertura
certa aqui não é um desconto genérico (que treina o comprador a esperar
promoção, contra a própria regra deste skill) — é um **preço de fundador
ligado à prova social que falta**:

> "As primeiras 10 agências que assinarem o plano Inicial pagam R$ 79/mês
> (em vez de R$ 99) pelos primeiros 12 meses, em troca de serem referência
> pública (nome, depoimento, caso de uso) assim que estiverem usando o
> sistema." Válido até fechar as 10 vagas ou até uma data definida pelo
> fundador — o que vier primeiro.

Isso resolve duas coisas ao mesmo tempo: testa um preço um pouco abaixo do
IPP, e constrói exatamente a prova social que o painel disse ser a condição
nº 1 para os próximos compradores dizerem sim.

## 4. O que testar com compradores reais

- **R$ 79 vs. R$ 99** no plano Inicial — os dois dentro da faixa aceitável,
  dos dois lados do IPP. Testar com uma pré-venda real (waitlist com cartão
  ou depósito) em duas páginas diferentes, não só uma pergunta.
- **R$ 199 vs. R$ 299** no plano Profissional — R$ 199 é o teto da faixa
  aceitável do painel; R$ 299 é o preço atual, que já está fora dela. Vale
  testar diretamente com os poucos compradores de agência média (que foram
  os que mais compraram no painel, 50%, mas é uma amostra de só 4 pessoas —
  thin, segundo o próprio painel).
- Isso tudo é teste de preço. O teste mais importante, pelo que o painel
  mostrou, é de **prova/confiança**, não de preço — ver `/founder-offer`.

## 5. As objeções de preço do painel (verbatim, as três que mais aparecem)

1. **"R$99 por mês nem é caro, é menos do que pago pro contador, mas ninguém
   está usando isso de verdade ainda."** (P005) — o preço em si não é o
   problema; a falta de prova social é.
2. **"R$ 99 ou R$ 299 por mês é caro pra minha agência hoje, e ainda por cima
   não tem nenhuma agência de verdade usando isso que eu possa perguntar se
   funciona."** (P016) — aqui o preço E a falta de prova aparecem juntos; sem
   prova, o mesmo preço vira "caro".
3. **"Pelo preço eu até topava testar, mas assinar sem referência nenhuma é
   arriscado pro tamanho da minha operação."** (P017) — de novo, o preço não
   é o obstáculo isolado; é o preço combinado com risco percebido sem prova.

Nenhum dos 20 buyers deu preço como motivo isolado e suficiente para recusar.
Isso é o achado mais útil deste exercício de pricing: **o problema que a
Travel Plataforma tem para resolver antes de mexer em preço é confiança, não
valor percebido do preço em si.**

---

Pendência explícita: margem e break-even em cada preço candidato dependem de
`founder/numbers.json`, que ainda não existe (`/founder-cfo` não rodou nesta
sequência). Quando rodar, usar os preços deste documento (R$79/99 e
R$199/299) como os candidatos a testar no `unit_economics.py`.
