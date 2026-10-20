# Unit economics: Travel Plataforma (SaaS de gestão para agências de viagem, plano Inicial)

**Nota: todos os valores abaixo estão em reais (R$), não dólares — o símbolo
"$" é só o formato padrão da ferramenta.** Fontes de cada número em
`founder/cfo-sources.md`; vários são estimativas marcadas como tal, não
faturas reais.

## A nota do CFO

- **A margem**: contribuição de R$ 81 por agência-mês (82% do preço) — alta,
  porque o custo variável de um SaaS é baixo (infra + processamento +
  suporte somam só R$ 18). Na meta de regime (50 agências), a margem de
  lucro é **62%**.
- **A linha a observar não está nem na tabela "what-if" abaixo — é o
  pró-labore que ainda não existe.** Hoje o custo fixo é só R$ 1.000/mês
  (ferramentas, sem salário). Rodei o mesmo modelo supondo um pró-labore de
  R$ 9.000/mês (um dos cenários que o fundador apontou como possível) e o
  resultado muda de forma dramática: o break-even salta de **13 para 124
  agências/mês** — mais que o DOBRO da própria meta de regime (50) — e a
  margem na meta viraria **-120%** (prejuízo). Arquivo completo desse
  cenário em `founder/cfo-scenario-com-equipe.md`. **Antes de qualquer
  decisão de tirar pró-labore ou contratar, rodar este número de novo com o
  valor real.**
- **Caixa**: só R$ 2.680 necessários antes do negócio se pagar (muito baixo
  porque o custo fixo de hoje é muito baixo — ver ponto acima sobre por que
  isso pode mudar). Retorno do gasto inicial: mês 8, na meta de 50 agências
  ao longo do ano 1.
- **Três formas de melhorar a margem** (rodadas na própria ferramenta, não
  chutadas):
  1. Nenhuma das variações testadas (preço -10%, volume -20%, custo unitário
     +15%) tira o negócio do verde — a margem na meta cai de 62% pra 57-59%
     no pior caso. Isso é bom: o modelo atual é resistente a esses três
     riscos específicos.
  2. **Confirmar a taxa real do Asaas** (`founder/cfo-sources.md` — a usada
     aqui é estimativa de mercado, não a tabela oficial) — se a taxa real
     for maior que os 4% estimados, a margem cai, mas nada nos testes
     indica que isso quebre o modelo.
  3. **O maior ganho de margem possível aqui não vem de cortar custo — vem
     de manter o custo de equipe baixo o máximo que der** enquanto a base de
     clientes ainda é pequena, dado o quanto o pró-labore move o resultado
     (ponto acima).
- **Condições do board sobre dinheiro** (`founder/board.md`): o board não
  exigiu uma margem específica — exigiu prova de cliente real, segurança
  corrigida e a integração Asaas/NFS-e implementada antes de escalar
  investimento. Este CFO **não modela o custo de terminar essa integração**
  (pendência explícita, ver `founder/cfo-sources.md`) — então mesmo a margem
  saudável de 62% aqui vale apenas para o produto como está hoje (sem
  cobrança/fiscal), não para a visão completa que a landing page anuncia.

**Isto não é consultoria financeira, tributária ou legal.** Antes de mexer
em qualquer dinheiro real — contratar, tirar pró-labore, abrir conta PJ —
um contador deve revisar a estrutura, os encargos de folha e os impostos
reais do regime tributário escolhido.

---

Every number below comes from the input file. Nothing is looked up or guessed.

## One agência-mês (uma agência assinante, um mês)

| line | per agência-mês (uma agência assinante, um mês) |
| --- | ---: |
| Price | $99.00 |
| Hospedagem/infraestrutura alocada por tenant (estimativa) | -$8.00 |
| Taxa de processamento da cobrança da mensalidade, ~4% (estimativa) | -$4.00 |
| Suporte ao cliente alocado por conta (estimativa) | -$6.00 |
| **Contribution** (what each agência-mês (uma agência assinante, um mês) leaves to pay the fixed costs) | **$81.00** (82%) |

## The margin that matters

Fixed costs: $1,000 a month (Ferramentas e infraestrutura base (hosting fixo, e-mail, monitoramento) — informado pelo fundador $1,000).

- **Break-even: 13 agência-mês (uma agência assinante, um mês)s a day.** Below that you lose money every month.
- **Profit margin at your plan** (50 a day): **62%** of every sale, after every cost.
- Capacity: 100000 a day.

## Year 1, month by month

| month | agência-mês (uma agência assinante, um mês)s a day | revenue | profit | cumulative (after $300 startup) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 1 | $99 | -$919 | -$1,219 |
| 2 | 3 | $297 | -$757 | -$1,976 |
| 3 | 6 | $594 | -$514 | -$2,490 |
| 4 | 10 | $990 | -$190 | -$2,680 |
| 5 | 15 | $1,485 | $215 | -$2,465 |
| 6 | 20 | $1,980 | $620 | -$1,845 |
| 7 | 26 | $2,574 | $1,106 | -$739 |
| 8 | 32 | $3,168 | $1,592 | $853 |
| 9 | 38 | $3,762 | $2,078 | $2,931 |
| 10 | 43 | $4,257 | $2,483 | $5,414 |
| 11 | 47 | $4,653 | $2,807 | $8,221 |
| 12 | 50 | $4,950 | $3,050 | $11,271 |

- **Year 1 operating profit: $11,571** on $28,809 of revenue.
- After the $300 startup spend: $11,271.
- Startup money earned back: month 8.
- Cash you need before it pays for itself: **$2,680**.

## What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | 62% | 13 | $11,571 |
| Price -10% | 57% | 15 | $8,690 |
| Volume -20% | 57% | 13 | $6,857 |
| Unit costs +15% | 59% | 13 | $10,785 |

No red flags in these numbers. They are only as good as the inputs: check every cost against a real quote.
