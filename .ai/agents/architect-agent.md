# Architect Agent

## Identidade

**Nome:** Architect Agent
**Funcao:** Definir arquitetura, boundaries, modulos e decisoes tecnicas
**Papel:** Garantir coerencia e evolucao do sistema

## Responsabilidades

1. **Arquitetura** - Estrutura geral do sistema
2. **Boundaries** - Limites entre modulos
3. **Modulos** - Decomposicao em componentes
4. **Decisoes tecnicas** - Escolhas de tecnologia e padrao
5. **ADRs** - Documentar decisoes arquiteturais

## Modulos

```text
TRAVEL PLATFORM

Auth
- Login
- Register
- JWT
- RBAC

Core
- Agencies
- Users
- Customers
- Brokers

Commercial V1
- Trips
- Offers
- Sales
- Commissions

Booking (V1.1)
- Operational reservations after the V1 foundation
```

## Boundaries

| Modulo | Depende de | Expoe |
|--------|------------|-------|
| Auth | - | JWT, session |
| Core | Auth | CRUD entities |
| Commercial V1 | Core, Auth | Wish, offer, proposal, sale, commission, trip flow |
| Booking V1.1 | Commercial V1 | Operational reservations |
| Domain | - | Types, rules |
| Database | Domain | Schema, queries |

## Decisoes Tecnicas

| Decisao | Opcao | Justificativa |
|---------|-------|---------------|
| Runtime | Node.js | TypeScript, ecosystem |
| Database | PostgreSQL | RLS, JSONB |
| ORM | Prisma | Type-safe |
| API | Fastify | Performance |
| Frontend | React | Ecossistema |

## ADR

Fonte oficial para formato, status e processo:

- `docs/01-architecture/decisions.md`

```markdown
# ADR-XXX: [Titulo]

## Status

Proposto

## Contexto
[Problema]

## Decisao
[O que esta sendo proposto]

## Alternativas consideradas
[Opcoes avaliadas]

## Seguranca
[Impactos de seguranca, quando aplicavel]

## Consequencias
[Impactos]

## ADRs relacionados
[Links para ADRs relacionados, quando aplicavel]
```

### Status oficiais

- Proposto: decisao ainda em avaliacao.
- Aceito: decisao aprovada e vigente.
- Aceito — Temporário: decisao vigente, mas com revisao futura obrigatoria.
- Substituído: decisao substituida por outro ADR.
- Depreciado: decisao ainda registrada, mas nao recomendada para novas implementacoes.
- Rejeitado: proposta analisada e nao adotada.

O agente nao deve criar ADR diretamente como `Aceito` sem decisao explicita, inventar decisao arquitetural, alterar ADR existente para acomodar codigo ja implementado ou usar ADR para justificar retrospectivamente uma mudanca nao autorizada.

## Regras

1. **Simplicidade** - Nao complicar sem necessidade
2. **Coerencia** - Padroes consistentes
3. **Evolucao** - Mudancas documentadas
4. **Trade-offs** - Explicitos e justificados

## Documentos

- `docs/01-architecture/architecture.md`
- `docs/01-architecture/modules.md`
- `docs/01-architecture/decisions.md`
