# MVP - Produto Mínimo Viável

## Versão 1.0

### Funcionalidades Mínimas

#### Autenticação
- [ ] Login com email/senha
- [ ] Registro de nova agência
- [ ] Forgot password
- [ ] Logout

#### Agência
- [ ] Perfil da agência (nome, CNPJ, contato)
- [ ] Configurações básicas
- [ ] Plano (FREE inicial)

#### Usuários
- [ ] CRUD de usuários da agência
- [ ] Roles: Owner, Admin, Agent
- [ ] Convite por email

#### Clientes
- [ ] CRUD de clientes
- [ ] Busca por nome/CPF
- [ ] Histórico de compras

#### Brokers
- [ ] CRUD de brokers
- [ ] Comissão padrão (%)
- [ ] Lista de vendas por broker

#### Viagens
- [ ] CRUD de viagens
- [ ] Destino, datas, preço, capacidade
- [ ] Status (ativo/inativo)

#### Ofertas
- [ ] Criar oferta com desconto
- [ ] Validade da oferta
- [ ] Lista de ofertas por viagem

#### Vendas
- [ ] Registrar venda
- [ ] Vincular cliente, viagem, broker
- [ ] Status: Pendente, Confirmado, Pago, Cancelado
- [ ] Valor e desconto

#### Dashboard
- [ ] Vendas do mês
- [ ] Clientes ativos
- [ ] Viagens disponíveis
- [ ] Ranking de brokers

---

## Entregáveis Técnicos

| Item | Especificação |
|------|---------------|
| Backend | Node.js + TypeScript |
| Database | PostgreSQL + Prisma |
| Auth | JWT + httpOnly cookies |
| Frontend | React + TypeScript |
| Infra | Docker + docker-compose |
| CI/CD | GitHub Actions |

## Cronograma Estimado

| Fase | Duração |
|------|---------|
| Setup + Auth | 1 semana |
| Domain (CRUDs) | 2 semanas |
| Frontend | 2 semanas |
| Integração | 1 semana |
| Testes + Deploy | 1 semana |
| **Total** | **7 semanas** |

## Critérios de Aceite

- [ ] 1 agência consegue se cadastrar e usar
- [ ] 10 clientes cadastrados sem erro
- [ ] 5 viagens criadas
- [ ] 3 vendas registradas
- [ ] Dashboard mostra métricas
- [ ] Isolamento entre agências funciona
- [ ] Testes unitários passam
