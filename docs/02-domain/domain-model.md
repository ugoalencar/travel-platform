# Modelo de Domínio

## Modelo vigente após ADR-004

O ADR-004 foi aceito pelo Product Owner e passa a orientar a modelagem do V1.

```text
Agency
  |-- Users
  |-- Brokers
  |-- Customers
  |     |-- CustomerAccount
  |     |-- Wishes
  |     |-- Proposals
  |     |-- Sales
  |     `-- Trips
  |
  |-- Offers
  `-- Sales

Wish
  `-- matching
        `-- Offer
              `-- Proposal
                    `-- Sale
                          |-- Commission
                          `-- Trip

V1.1:

Sale
  `-- Bookings

Trip
  `-- Bookings
```

Definições vigentes:

- `Wish`: intenção estruturada de viagem do cliente.
- `CustomerAccount`: identidade/autenticação digital do cliente final.
- `Offer`: oferta reutilizável/interna da Agency.
- `Proposal`: proposta comercial direcionada a Customer.
- `Sale`: negócio comercial/financeiro fechado.
- `Commission`: comissão primariamente vinculada a Sale.
- `Trip`: viagem concreta do cliente e base para histórico.
- `Booking`: reserva operacional, classificada como V1.1.

As seções abaixo preservam histórico documental anterior e devem ser revisadas
antes de qualquer alteração no Prisma.

## Entidades

```
┌─────────────┐
│   Agency    │ (Tenant - isolamento)
└──────┬──────┘
       │
       ├──┬─────────────┐
       │  │             │
       ▼  ▼             ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│   User   │ │ Customer │ │  Broker  │
└──────────┘ └──────────┘ └──────────┘
       │             │             │
       │             │             │
       ▼             ▼             ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│   Trip   │◄────│  Offer   │ │  Sale    │
└──────────┘      └──────────┘ └──────────┘
                        │
                        ▼
                  ┌──────────┐
                  │Commission│
                  └──────────┘
```

## Relacionamentos

| De | Para | Cardinalidade | Descrição |
|----|------|---------------|-----------|
| Agency | User | 1:N | Agência tem muitos usuários |
| Agency | Customer | 1:N | Agência tem muitos clientes |
| Agency | Broker | 1:N | Agência tem muitos brokers |
| Agency | Trip | 1:N | Agência tem muitas viagens |
| Trip | Offer | 1:N | Viagem tem muitas ofertas |
| Trip | Sale | 1:N | Viagem tem muitas vendas |
| Customer | Sale | 1:N | Cliente tem muitas compras |
| Broker | Sale | 1:N | Broker tem muitas vendas |
| User | Sale | 1:N | Usuário registra muitas vendas |

## Regras de Negócio

### Agência
- Cada agência é um tenant isolado
- Uma agência não pode ver dados de outra
- Agência pode ter no máximo 1 Owner

### Usuário
- Pertence a apenas 1 agência
- Roles: Owner > Admin > Manager > Agent > Viewer
- Owner não pode ser removido

### Cliente
- Pertence a apenas 1 agência
- CPF é único por agência
- Email é único por agência

### Viagem
- Pertence a apenas 1 agência
- Capacidade não pode ser negativa
- Disponível não pode exceder capacidade

### Oferta
- Vinculada a 1 viagem
- Desconto entre 0% e 100%
- Data de validade deve ser futura

### Venda
- Vincula: cliente, viagem, broker (opcional), usuário
- Valor = preço da viagem - desconto
- Status: Pendente → Confirmado → Pago | Cancelado

## Value Objects

| Objeto | Regras |
|--------|--------|
| Email | Formato válido, único por agência |
| CPF | 11 dígitos, válido |
| Dinheiro | Duas casas decimais, não negativo |
| Telefone | Formato brasileiro |
| Data | Não pode ser passada (para ofertas) |
