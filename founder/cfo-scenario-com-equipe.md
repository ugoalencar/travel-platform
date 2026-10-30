# Unit economics: Travel Plataforma (SaaS de gestão para agências de viagem, plano Inicial)

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

Fixed costs: $10,000 a month (Ferramentas $1,000, Pró-labore/equipe (cenário R$9.000/mês) $9,000).

- **Break-even: 124 agência-mês (uma agência assinante, um mês)s a day.** Below that you lose money every month.
- **Profit margin at your plan** (50 a day): **-120%** of every sale, after every cost.
- Capacity: 100000 a day.

## Year 1, month by month

| month | agência-mês (uma agência assinante, um mês)s a day | revenue | profit | cumulative (after $300 startup) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 1 | $99 | -$9,919 | -$10,219 |
| 2 | 3 | $297 | -$9,757 | -$19,976 |
| 3 | 6 | $594 | -$9,514 | -$29,490 |
| 4 | 10 | $990 | -$9,190 | -$38,680 |
| 5 | 15 | $1,485 | -$8,785 | -$47,465 |
| 6 | 20 | $1,980 | -$8,380 | -$55,845 |
| 7 | 26 | $2,574 | -$7,894 | -$63,739 |
| 8 | 32 | $3,168 | -$7,408 | -$71,147 |
| 9 | 38 | $3,762 | -$6,922 | -$78,069 |
| 10 | 43 | $4,257 | -$6,517 | -$84,586 |
| 11 | 47 | $4,653 | -$6,193 | -$90,779 |
| 12 | 50 | $4,950 | -$5,950 | -$96,729 |

- **Year 1 operating profit: -$96,429** on $28,809 of revenue.
- After the $300 startup spend: -$96,729.
- Startup money earned back: not within year 1.
- Cash you need before it pays for itself: **$96,729**.

## What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | -120% | 124 | -$96,429 |
| Price -10% | -145% | 141 | -$99,310 |
| Volume -20% | -171% | 124 | -$101,143 |
| Unit costs +15% | -123% | 128 | -$97,215 |

## Red flags

- Year 1 loses money on operations (-$96,429).
- The startup spend is not earned back within year 1.
