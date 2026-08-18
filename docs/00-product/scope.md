# Escopo do Produto

## MVP (v1.0)

### Incluído no MVP

| Módulo | Funcionalidades |
|--------|-----------------|
| **Auth** | Login, registro de agência, forgot password |
| **Agencies** | Perfil, configurações, plano |
| **Users** | CRUD, roles (Owner, Admin, Agent) |
| **Customers** | CRUD, busca, histórico |
| **Brokers** | CRUD, comissão padrão |
| **Trips** | CRUD, disponibilidade, preços |
| **Offers** | Criar ofertas com desconto, validade |
| **Sales** | Registrar venda, status, relatório básico |
| **Dashboard** | Métricas principais |

### Não incluído no MVP (v2+)

- Pagamentos integrados (Stripe, Mercado Pago)
- Passagens aéreas
- Hotéis e hospedagens
- Sistema de avaliação
- App mobile nativo
- Integração com ERPs
- Multi-idioma
- Marketplace entre agências

## Restrições

| Restrição | Detalhe |
|-----------|---------|
| Tenant | 1 agência = 1 tenant isolado |
| Plano FREE | Limitado a 50 clientes, 10 viagens |
| Upload | Máximo 5MB por arquivo |
| API | Rate limit 100 req/min por agência |

## Fora de Escopo

- Processamento de pagamentos
- Emissão de passagens
- Reserva de hotéis
- Seguros de viagem
- Vistos e documentação
