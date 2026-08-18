# Contexto do Sistema

## Atores

```
┌─────────────────────────────────────────────────────────────┐
│                       SISTEMA                               │
│                    Travel Platform                          │
└─────────────────────────────────────────────────────────────┘
         ▲               ▲               ▲
         │               │               │
    ┌────┴────┐    ┌─────┴─────┐    ┌────┴────┐
    │  Owner  │    │  Manager  │    │  Agent  │
    │  Admin  │    │           │    │         │
    └─────────┘    └───────────┘    └─────────┘
         │               │               │
         └───────────────┼───────────────┘
                         │
                    ┌────┴────┐
                    │  Agency │
                    └─────────┘

         ▲
         │
    ┌────┴────┐         ┌─────────┐
    │ Broker  │ ──────► │ Customer│
    └─────────┘  indica  └─────────┘
```

## Relações

| Relação | Descrição |
|---------|-----------|
| Owner → Agency | Dono cria e gerencia agência |
| Manager → Agency | Gerencia equipe e operações |
| Agent → Agency | Vende pacotes para clientes |
| Broker → Agency | Indica clientes, ganha comissão |
| Customer → Agency | Compra pacotes de viagem |

## Sistemas Externos (futuro)

| Sistema | Integração |
|---------|------------|
| Gateway de pagamento | Stripe, Mercado Pago |
| Email transacional | SendGrid, SES |
| SMS | Twilio |
| Storage | S3, Cloudflare R2 |
| Analytics | Plausible, PostHog |

## Limites do Sistema

| Limite | Valor |
|--------|-------|
| Agências simultâneas | 1.000 |
| Clientes por agência | 10.000 (plano enterprise) |
| Viagens ativas por agência | 500 |
| Vendas por mês | 10.000 |
| Requisições por minuto | 100 por agência |
| Tamanho de upload | 5MB |
