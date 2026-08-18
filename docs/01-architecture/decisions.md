# Decisões Arquiteturais (ADR)

## Visão Geral

Decisões arquiteturais são documentadas como ADRs (Architecture Decision Records).

## Lista de ADRs

| ADR | Título | Status |
|-----|--------|--------|
| [ADR-001](../adr/ADR-001-architecture.md) | Arquitetura monorepo | Aceito |
| [ADR-002](../adr/ADR-002-multitenancy.md) | Multi-tenancy por agency_id | Aceito |
| [ADR-003](../adr/ADR-003-authentication.md) | Autenticação JWT + cookies httpOnly | Aceito |
| [ADR-004](../adr/ADR-004-domain-modeling-wish-customer-sale-booking.md) | Modelagem de Wish, identidade do cliente e separação Sale/Booking | Aceito |
| [ADR-TECH-001](../adr/ADR-TECH-001-stack.md) | Stack tecnológica oficial | Aceito |
| [ADR-SEC-001](../adr/ADR-SEC-001-deepmerge-ts-risk-acceptance.md) | Aceitação temporária do risco de deepmerge-ts via tooling do Prisma | Aceito — Temporário |

## Formato

Cada ADR segue o padrão:

```markdown
# ADR-XXX: Título

## Status
Proposto

## Contexto
Qual problema estamos resolvendo?

## Decisão
O que decidimos fazer?

## Alternativas consideradas
Quais opções foram avaliadas?

## Segurança
Há impacto de segurança? Se não houver, registrar "Não aplicável".

## Consequências
O que ganhamos e perdemos?

## ADRs relacionados
Há decisões relacionadas? Se não houver, registrar "Nenhum".
```

## Status Oficiais

Novos ADRs devem começar como `Proposto` e somente mudar para `Aceito` após aprovação explícita.

| Status | Uso |
|--------|-----|
| Proposto | Decisão ainda em avaliação. |
| Aceito | Decisão aprovada e vigente. |
| Aceito — Temporário | Decisão vigente, mas com revisão futura obrigatória. |
| Substituído | Decisão substituída por outro ADR. |
| Depreciado | Decisão ainda registrada, mas não recomendada para novas implementações. |
| Rejeitado | Proposta analisada e não adotada. |

## Como Criar um ADR

1. Use o formato definido neste documento como fonte oficial.
2. Numere sequencialmente (ADR-004, ADR-005, ...)
3. Preencha todos os campos
4. Submeta PR para revisão
5. Após aprovação, atualize o status para `Aceito`

## Quando Criar um ADR

- Nova escolha de framework/biblioteca
- Mudança de padrão arquitetural
- Decisão de segurança
- Trade-off significativo
- Padrao de codigo que afeta todo o projeto
