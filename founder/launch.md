# Lançamento — Travel Plataforma

Data de hoje nesta sessão: 2026-10-12. Data de lançamento usada abaixo:
**2026-11-02 (3 semanas a partir de hoje)** — é a data "mais precoce
realista" dado o prazo real identificado em `founder/ops.md` (corrigir os
dois achados de segurança do board antes de atrair tráfego), **não uma data
confirmada pelo fundador**. Ajustar livremente; o resto do cronograma desloca
junto.

## 1. O teste antes de gastar

A Travel Plataforma é um negócio de assinatura — o teste certo, pela tabela
do skill, é uma oferta de "membro fundador" paga antecipadamente. Isso já
existe: é o **Programa Agência Pioneira** (`founder/offer.md`).

Mas o próprio reteste do painel de compradores encontrou um problema real
com testar o Programa Pioneira direto no público geral: vários compradores
simulados recusaram porque "entrar como Agência Pioneira significa eu ser a
cobaia sem ter nenhum caso real pra olhar antes" (`founder/offer.md`, seção
5). Por isso, o teste de lançamento tem duas camadas:

**Camada 1 — antes de qualquer divulgação pública (a parte "friends-and-
family" deste lançamento)**: o fundador recruta 2-3 agências via conexão
pessoal (não anúncio, não os grupos públicos ainda) pra serem as primeiras
de verdade, fora do holofote do Programa Pioneira — sem exigir que sejam
caso público ainda. O objetivo é só ter 2-3 agências reais usando, pra
servir de prova verificável quando o Programa Pioneira abrir pro público.

**Camada 2 — Programa Agência Pioneira público**, divulgado nos canais de
`founder/marketing.md`.

**Linha de sucesso, escrita antes de rodar** (comparar com o painel, nunca
assumir que o resultado real vai bater com o simulado):
- Camada 1: pelo menos **2 das 2-3 agências recrutadas pessoalmente**
  completam a migração assistida sem perda de dado em até 30 dias.
- Camada 2: **5 agências reais** pagando o primeiro mês do Programa Pioneira
  em até 30 dias a partir do início da divulgação nos grupos/associações.

Esse número (5) é deliberadamente bem abaixo da taxa de 50% do reteste do
painel simulado (`founder/panel/results.md`) — compradores simulados tendem
a ser mais complacentes que gente real (limite já declarado em
`founder/panel/results.md` desde o painel original). **Se o resultado real
ficar muito abaixo de 5 em 30 dias, voltar pro `/founder-offer` ou
`/founder-pricing` antes de gastar mais em marketing — não insistir no
mesmo plano com mais orçamento.**

## 2. A contagem regressiva

Datas reais a partir de hoje (2026-10-12), em blocos semanais. **Caminho
crítico** marcado com ⚠ — se atrasar, a data de lançamento desloca.

### Semana de 13 a 19/10 (D-21 a D-14)

| área | tarefa | responsável | prazo |
| --- | --- | --- | --- |
| ⚠ Legal/produto | Corrigir captcha/validação no formulário público de lead e tornar MFA obrigatório pro super-admin (condição do board, `founder/board.md`) | Fundador | 19/10 |
| Legal/dinheiro | Confirmar tabela real de taxas do Asaas (`founder/cfo-sources.md`) | Fundador | 19/10 |
| Legal/dinheiro | Confirmar regime tributário/CNPJ atual com contador (`founder/ops.md`) | Fundador | 19/10 |
| Build | Subir o Render do Travel Lite pro tier pago (resolve o cold-start já identificado) | Fundador | 19/10 |
| Camada 1 do teste | Recrutar as 2-3 primeiras agências via conexão pessoal | Fundador | 19/10 |

### Semana de 20 a 26/10 (D-14 a D-8)

| área | tarefa | responsável | prazo |
| --- | --- | --- | --- |
| Marketing | Início do calendário de `founder/marketing.md` (D-14): fundador se apresenta nos grupos/associações, sem vender ainda | Fundador | 20/10 |
| Build | Primeira migração assistida real (Camada 1) | Fundador | em andamento |
| Marca | Ajustar a copy do hero da landing page pra promessa nova (`founder/brand.md`, seção 2) | Fundador | 26/10 |
| Parceria | Primeiro contato com 1-2 consolidadoras em potencial (`founder/marketing.md`) | Fundador | 26/10 |

### Semana de 27/10 a 2/11 (D-7 a D0)

| área | tarefa | responsável | prazo |
| --- | --- | --- | --- |
| Marketing | Hook #2 (garantia de migração) nos grupos | Fundador | 29/10 |
| Marketing | Anúncio do Programa Agência Pioneira com vagas reais (D-3) | Fundador | 30/10 |
| Camada 1 do teste | Confirmar se as 2-3 agências recrutadas completaram a migração — checar a linha de sucesso antes de abrir pro público | Fundador | 1/11 |
| **Lançamento público** | Abrir o Programa Agência Pioneira nos canais escolhidos | Fundador | **2/11** |

**O item do caminho crítico**: corrigir os dois achados de segurança
(captcha + MFA) antes de 19/10. É a única tarefa que, se atrasar, deve
atrasar o início da divulgação (D-14) e portanto o lançamento inteiro — o
board foi explícito que não se deve atrair tráfego pago/público pro
formulário de lead com essa lacuna aberta.

## 3. O dia do lançamento (2/11, hora a hora)

Como é um negócio online/assinatura sem loja física, não há "abrir as
portas" — o dia é sobre publicar e responder rápido:

| horário | o que acontece |
| --- | --- |
| Manhã | Publicar o anúncio do Programa Pioneira em todos os canais escolhidos (hook #3, `founder/marketing.md`) |
| Durante o dia | Responder cada cadastro/pergunta no mesmo dia (SOP 1, `founder/ops.md`) — é o dia de maior volume de perguntas esperado |
| Tarde | Checar status de hospedagem (Supabase/Vercel/Render) — mais tráfego que o normal pode expor algum limite não testado |
| Fim do dia | Registrar o número real de cadastros do dia 1 — primeiro ponto de comparação com a linha de sucesso da seção 1 |

**Se algo quebrar** (do registro de riscos, `founder/ops.md`): comunicar com
transparência (nunca escondido), nunca prometer prazo que não é real — a
mesma regra do SOP 3.

## 4. Os primeiros 30 dias

Números semanais (de `founder/marketing.md` e `founder/cfo.md`):

| semana | o que medir | nível que exige mudança |
| --- | --- | --- |
| 1 | Cadastros/demos por canal | Zero cadastro depois de uma semana de divulgação = problema de alcance, não de oferta — revisar canal antes de oferta |
| 2 | Conversão cadastro → primeira mensalidade paga | Abaixo de ~10% (bem sob o 50% do painel simulado) = objeção de confiança não resolvida na prática — considerar reforçar a Camada 1 (mais casos reais antes de pedir mais gente pra ser "pioneira") |
| 3 | CAC real por canal | Acima de R$243 (teto de `founder/marketing.md`) por 2 semanas seguidas = trocar ou pausar esse canal |
| 4 | Total de agências pagantes vs. break-even de 13/mês (`founder/cfo.md`) | Longe de 13 ao final do mês 1 não é motivo de pânico (a própria rampa do CFO prevê só 1 agência no mês 1) — mas revisar se a tendência das 4 semanas aponta pra convergir com a meta de regime (50) dentro do ano 1 |

**Revisão nos dias 7, 14 e 30**, com estas perguntas:
- **Dia 7**: alguma das 2-3 agências da Camada 1 já migrou? Teve algum
  problema de dado? (Se sim, a Garantia de Migração Sem Risco foi
  realmente cumprida?)
- **Dia 14**: a linha de sucesso de 5 agências pagantes em 30 dias está no
  caminho, ou já dá pra saber que vai ficar bem abaixo? Os números de
  cadastro/conversão/CAC estão dentro dos níveis da tabela acima?
- **Dia 30**: comparar o resultado real com a linha de sucesso escrita na
  seção 1. Se ficou muito abaixo, a próxima parada não é mais orçamento no
  mesmo canal — é voltar pro `/founder-offer` ou `/founder-pricing` com o
  que se aprendeu de gente real, não do painel simulado.
