# DEC-002: Escopo do MVP

**Data:** 2026-01-15
**Status:** Aceito
**Decisor:** Product Owner + Tech Lead

---

## Contexto

Precisamos definir o que entra no MVP (v1.0) para lançar em 7 semanas com validação real.

## Decisão

MVP com **9 funcionalidades essenciais**, sem nada extra:

| Módulo | Funcionalidades MVP |
|--------|---------------------|
| Auth | Login, registro, forgot password |
| Agency | Perfil, configurações |
| Users | CRUD, roles (Owner, Admin, Agent) |
| Customers | CRUD, busca, histórico |
| Brokers | CRUD, comissão |
| Trips | CRUD, disponibilidade |
| Offers | Criar oferta, validade |
| Sales | Registrar venda, status |
| Dashboard | Métricas principais |

## Revisão aprovada após ADR-004

Após a sessão de modelagem do ADR-004, o Product Owner aprovou uma revisão do
escopo V1 para suportar o portal/PWA autenticado do cliente, Wish, Proposal e a
nova definição de Trip como viagem concreta do cliente.

A decisão original acima permanece registrada como histórico. A classificação
vigente passa a ser:

### V1 obrigatório

| Conceito | Justificativa |
|----------|---------------|
| Auth | Autenticação base da plataforma |
| Agency | Tenant raiz da plataforma |
| Users | Usuários internos da Agency |
| Customers | CRM e vínculo com viajantes |
| Brokers | Corretores/parceiros e comissionamento |
| CustomerAccount | Identidade/autenticação digital do cliente final no PWA |
| Wish | Intenção estruturada de viagem do cliente |
| Trips | Viagem concreta do cliente e base de histórico |
| Offers | Oferta reutilizável/interna da Agency |
| Proposal | Proposta comercial direcionada a Customer |
| Sales | Camada comercial/financeira da venda |
| Commission | Comissão primariamente vinculada a Sale |
| Dashboard | Métricas principais da Agency |

### V1.1

- Booking;
- operação detalhada de reservas;
- fornecedor/localizador/emissão;
- rateio de comissão por Booking.

### Futuro

- Pescador;
- matching automático/IA;
- integrações GDS;
- app nativo;
- histórico multiagência;
- pagamentos integrados.

## Alternativas Consideradas

| Escopo | Tempo | Decisão |
|--------|-------|---------|
| Mínimo (só auth + customers) | 3 semanas | ❌ Não valida negócio |
| **MVP (9 funcionalidades)** | **7 semanas** | ✅ |
| Médio (+ pagamentos) | 12 semanas | ❌ Atrasa validação |
| Completo | 20 semanas | ❌ Muito demorado |

## Fora de Escopo (v2+)

- Pagamentos integrados
- Passagens aéreas
- Hotéis
- App mobile
- Marketplace
- Multi-idioma

## Consequências

### Positivas
- Validação rápida (7 semanas)
- Foco no essencial
- Feedback cedo
- Custo menor

### Negativas
- Funcionalidades faltando
- Pode precisar de refactoring
- UX pode ser básica

## Critérios de Aceite do MVP

- [ ] 1 agência consegue se cadastrar
- [ ] 10 clientes cadastrados
- [ ] 5 viagens criadas
- [ ] 3 vendas registradas
- [ ] Dashboard funciona
- [ ] Isolamento entre agências OK

## Referências

- `docs/MVP.md`
- `docs/ROADMAP.md`
