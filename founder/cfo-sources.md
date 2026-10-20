# Fontes dos números — founder/numbers.json

Adaptação importante: a ferramenta `unit_economics.py` foi desenhada pra
negócios com venda avulsa por dia (um café, uma loja). A Travel Plataforma é
SaaS por assinatura mensal. Adaptação usada: `"days_per_month": 1`, e cada
"unidade por dia" passa a significar **"agências pagantes ativas naquele
mês"** — ou seja, o "dia" da ferramenta representa um mês inteiro do negócio.
Isso evita multiplicar a receita por 30 indevidamente.

| campo | valor | origem |
| --- | --- | --- |
| `price` | R$ 99,00 | `founder/pricing.md` — plano Inicial, preço padrão (não o preço de fundador de R$79 do Programa Agência Pioneira — ver nota abaixo) |
| Hospedagem/infra por tenant | R$ 8,00 | **Estimativa**, não confirmada. Baseada em custo típico de infraestrutura cloud (banco de dados + aplicação) para uma arquitetura multi-tenant, dividido por um número pequeno de agências. Pode estar sub ou sobrestimada — não há fatura real do fornecedor de hospedagem consultada. |
| Taxa de processamento (cobrança da mensalidade) | R$ 4,00 (~4% de R$99) | **Estimativa**, baseada em faixas de mercado brasileiro para processamento de cartão/Pix recorrente (ex.: gateways cobram tipicamente 3-4,5% + taxa fixa). Não é a taxa publicada oficial do Asaas — a busca feita não encontrou a tabela de preços vigente do Asaas em 2026. Confirmar na página oficial do Asaas antes de decidir. |
| Suporte ao cliente alocado | R$ 6,00 | **Estimativa**, sem base em dado real de tempo de suporte por conta. |
| Ferramentas/infra base (fixo mensal) | R$ 1.000,00/mês | **Informado pelo fundador nesta conversa** (resposta a pergunta direta: "só eu, sem pró-labore ainda, ~R$1.000/mês em ferramentas"). |
| Domínio/certificados/abertura | R$ 300,00 | **Estimativa pequena**, custo administrativo típico. |
| Meta de regime (`plan_per_day`) | 50 agências pagantes | **Suposição do planejamento**, não um dado real de mercado ou de tráfego. Não há dado de conversão da landing page (`founder/board.md` já registrou essa lacuna). Deve ser substituída assim que houver dado real de tráfego/conversão. |
| Rampa de 12 meses (`ramp_per_day`) | 1→50, crescendo | **Suposição de planejamento**, calibrada apenas para começar no "Programa Agência Pioneira" (poucas agências no mês 1, consistente com `founder/offer.md`) e crescer de forma conservadora até a meta de regime. Não é uma previsão de tráfego real. |

## O que NÃO foi modelado (pendências explícitas, não inventadas)

- **Pró-labore/salário da equipe**: o fundador confirmou que hoje não tira
  pró-labore. Se/quando isso mudar, é quase certamente o maior custo fixo
  real do negócio e muda o resultado inteiro — reconfirmar antes de usar
  este modelo pra decidir sobre contratação.
- **Custo de desenvolvimento restante para a integração Asaas + NFS-e**: o
  board (`founder/board.md`) e a pesquisa de concorrentes já identificaram
  que essa parte só existe em ADR, não em código. O fundador não tinha uma
  estimativa de quanto falta investir nisso nesta conversa — **não foi
  modelado aqui**, nem como `startup` nem de outra forma. O resultado deste
  CFO é válido apenas para o produto como está HOJE (CRM/pipeline/operação/
  portal), sem a parte de cobrança/fiscal. Quando essa estimativa existir,
  somar ao `startup` e rodar de novo.
- **Taxas reais do Asaas**: a busca pública não confirmou a tabela de preços
  vigente do Asaas para 2026. O número usado é uma estimativa de mercado,
  não a tarifa real do fornecedor já escolhido no ADR-BILLING-001.
- **Churn/cancelamento**: a rampa assume crescimento líquido mês a mês sem
  modelar cancelamento explicitamente — na prática, parte do crescimento
  bruto de novos assinantes seria consumida por cancelamentos. Não modelado
  por falta de dado real (zero clientes pagantes até hoje).
