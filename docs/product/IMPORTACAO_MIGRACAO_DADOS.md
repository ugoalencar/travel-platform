# Travel Platform — Importação e Migração de Dados

**Status:** ESPECIFICAÇÃO  
**Data:** 2026-09-20  
**Escopo:** Capacidade permanente de importação de dados  
**Idioma:** Português do Brasil

---

## VISÃO GERAL

A Travel Platform precisa suportar migração de dados de sistemas anteriores
como funcionalidade permanente do produto. Cada novo assinante poderá
importar seus dados de forma segura, auditável e assistida.

---

## PRIORIDADE DE IMPORTAÇÃO

### FASE 1 — Fundação

| Domínio | Tabela | Campos Obrigatórios | Complexidade |
|---|---|---|---|
| Clientes | customers | name | Baixa |
| Fornecedores | suppliers | name | Baixa |
| Funcionários | users | email, name, role | Média (senha hash) |
| Tags | (criar se necessário) | name | Baixa |

### FASE 2 — Domínio Comercial

| Domínio | Tabela | Campos Obrigatórios | Complexidade |
|---|---|---|---|
| Desejos | wishes | customer_id, destination | Média (FK) |
| Ofertas | offers | name, price | Média |
| Propostas | proposals | customer_id, proposed_price, total | Alta (multi-FK) |

### FASE 3 — Operacional

| Domínio | Tabela | Campos Obrigatórios | Complexidade |
|---|---|---|---|
| Viagens | trips | customer_id, name, destination, dates | Alta |
| Documentos | customer_documents | customer_id, document_type | Alta (storage) |

### FASE 4 — Financeiro

| Domínio | Tabela | Campos Obrigatórios | Complexidade |
|---|---|---|---|
| Vendas | sales | customer_id, user_id, amount, total | Muito Alta |
| Recebíveis | receivables | customer_id, description, amount, due_at | Muito Alta |
| Pagáveis | payables | description, amount, due_at | Muito Alta |

**Nota:** Financeiro exige validação adicional. Nunca importar sem dry run completo e confirmação explícita.

---

## REGRAS DE SEGURANÇA

1. **Tenant isolation:** ImportJob é tenant-scoped (agency_id obrigatório)
2. **RLS:** Todas as operações passam por Row-Level Security
3. **Parametrized queries:** Nunca concatenação de SQL
4. **No file execution:** CSV/XLSX são parseados, nunca executados
5. **No direct INSERT:** Sempre via services/repositories existentes
6. **Audit trail:** Toda importação é registrada
7. **Rollback seguro:** Só quando não há dependências posteriores
8. **Dry run obrigatório:** Nunca gravar sem preview

---

## INTEGRAÇÃO COM SISTEMA EXISTENTE

### Services/Repositories

A importação deve usar os mesmos services que a UI usa:

```
CustomerService.createCustomer(input)
SupplierService.createSupplier(input)
UserService.createUser(input)
WishService.createWish(input)
OfferService.createOffer(input)
ProposalService.createProposal(input)
TripService.createTrip(input)
```

Isso garante que:
- Validações de domínio são aplicadas
- Tenant isolation é preservada
- Audit triggers são executados
- Contadores são atualizados

### Não Contornar

NUNCA:
- INSERT direto em tabelas
- Bypass de validações de domínio
- Skip de RLS
- Ignorar constraints

---

## IDEMPOTÊNCIA

### Reimportação

Se a agência importa a mesma planilha duas vezes:
1. Registros com `external_id` + `source_system` já existente são ignorados
2. Registros novos são criados
3. Nenhum registro é sobrescrevido silenciosamente

### Rollback

Se o rollback for seguro (sem dependências posteriores):
1. Buscar import_job_id nos registros
2. Remover registros criados por este job
3. Registrar rollback no audit

Se não for seguro:
1. Usar compensação/manual review
2. Documentar motivo

---

## NOTIFICAÇÃO

Ao finalizar importação:
- Notificar responsável da agência por email
- Incluir resumo: criados, atualizados, pendentes, erros
- Link para detalhes no Centro de Implantação

---

## TEMPLATE CSV/XLSX

### Clientes

```csv
nome,email,telefone,whatsapp,cpf,passport,rg,data_nascimento,nacionalidade,notas
```

### Fornecedores

```csv
nome,documento,contato,ativo
```

### Viagens

```csv
cliente_nome,destino,data_inicio,data_fim,status,notas
```

**Gerar templates oficiais baseados no schema real depois de auditar campos necessários para o piloto.**
