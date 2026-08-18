# DEC-004: Identidade do Cliente

**Data:** 2026-01-15
**Status:** Aceito
**Decisor:** Product Owner + Architect

---

## Contexto

Clientes são cadastrados por agências. Precisamos definir como identificar um cliente de forma única, considerando que o mesmo pessoa pode ser cliente de múltiplas agências.

## Decisão

Cliente possui identidade técnica por **id (UUID)**.

CPF e email são identificadores de negócio para busca e deduplicação dentro da
agência, mas não são a chave técnica do cliente.

Historicamente esta decisão registrava "Cliente identificado por CPF". A
interpretação vigente preserva a regra de CPF único por agência quando existir,
mas esclarece que:

- `id` (UUID) é a identidade técnica principal;
- `cpf` é identificação/deduplicação de negócio por agência;
- `email` é contato/login potencial, mutável, e deduplicação por agência;
- nem CPF nem email criam identidade global.

Esta interpretação é complementada e atualizada pelo ADR-004, aprovado pelo
Product Owner, que consolida `customer.id` como identidade técnica e CPF/email
como atributos de negócio e deduplicação dentro da Agency.

Campos e regras:

| Campo | Obrigatório | Único por agência |
|-------|-------------|-------------------|
| id (UUID) | Sim | - |
| agency_id | Sim | - |
| name | Sim | Não |
| cpf | Não | Sim |
| email | Não | Sim |
| phone | Não | Não |
| passport | Não | Não |

### Regras

1. **UUID técnico** - `id` identifica tecnicamente o Customer
2. **CPF único por agência quando existir** - Mesmo CPF pode existir em agências diferentes
3. **Email único por agência quando existir** - Mesmo email pode existir em agências diferentes
4. **CPF opcional** - Nem todos têm CPF (estrangeiros)
5. **Email mutável** - Troca de email não muda a identidade técnica do Customer
6. **Passaporte opcional** - Para internacionais

## Alternativas Consideradas

| Identificador | Único globalmente | Único por agência | Decisão |
|---------------|-------------------|-------------------|---------|
| **UUID técnico + CPF/email por agência** | Não | Sim | Vigente |
| CPF por agência como chave técnica | Não | Sim | Substituído como interpretação técnica |
| CPF global | Sim | - | Rejeitado: mesmo cliente em agências diferentes seria o mesmo registro |
| Email global | Sim | - | Rejeitado: mesmo problema |
| UUID apenas sem identificadores de negócio | Sim | Sim | Rejeitado: sem identificador humano |

## Justificativa

- Agências diferentes podem ter o mesmo cliente
- Cada agência gerencia seu próprio cadastro
- UUID evita que troca de email ou ausência de CPF quebre a identidade técnica
- CPF é o identificador de negócio padrão no Brasil
- Estrangeiros usam passaporte

## Consequências

### Positivas
- Simples de entender
- Compatível com realidade do negócio
- Busca por CPF rápida (índice)

### Negativas
- Cliente duplicado entre agências (aceitável)
- Dados podem ficar inconsistentes entre agências
- DEC-004 substitui a interpretação anterior de CPF como chave técnica

## Implementação

```sql
CREATE UNIQUE INDEX idx_customers_agency_cpf
  ON customers(agency_id, cpf)
  WHERE cpf IS NOT NULL;

CREATE UNIQUE INDEX idx_customers_agency_email
  ON customers(agency_id, email)
  WHERE email IS NOT NULL;
```

## Referências

- `docs/DOMAIN.md`
- `docs/02-domain/customer.md`
- `docs/adr/ADR-004-domain-modeling-wish-customer-sale-booking.md`
