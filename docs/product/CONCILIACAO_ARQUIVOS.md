# Travel Platform — Conciliação de Arquivos

**Status:** ESPECIFICAÇÃO CONCEITUAL  
**Data:** 2026-09-20  
**Escopo:** Conferência de arquivos recorrentes com dados existentes  
**Idioma:** Português do Brasil

---

## DISTINÇÃO IMPORTAÇÃO vs CONCILIAÇÃO

| Conceito | Definição | Quando |
|---|---|---|
| **IMPORTAÇÃO** | Trazer dados históricos de outro sistema | Na implantação |
| **CONCILIAÇÃO** | Conferir arquivo recorrente com dados existentes | Periodicamente (mensal, quinzenal) |

---

## FLUXO DE CONCILIAÇÃO

```
Arquivo (extrato, OFX, PSP)
    ↓
Parse (detectar formato, extrair transações)
    ↓
Transactions normalizadas
    ↓
Deterministic Matching
    ↓
Sugestões com confidence level
    ↓
Revisão Humana
    ↓
Confirmação
    ↓
Reconciliation existente (se aplicável)
```

---

## FORMATOS SUPORTADOS (FUTURO)

| Formato | Uso | Prioridade |
|---|---|---|
| CSV | Extratos bancários simples | FASE 1 |
| OFX | Padrão bancário brasileiro | FASE 2 |
| Arquivo PSP | Pagamentos | FASE 3 |
| Arquivo bancário custom | Conforme necessidade | FASE 4 |

---

## SINAIS DE MATCH

| Sinal | Descrição | Peso |
|---|---|---|
| amount | Valor da transação | ALTO |
| date | Data da transação | ALTO |
| reference | Número de referência | ALTO |
| customer | Nome ou ID do cliente | MÉDIO |
| document | CPF/CNPJ | ALTO |
| provider_id | ID no provedor de pagamento | ALTO |

---

## MATCH CONFIDENCE

| Nível | Critério | Ação |
|---|---|---|
| **EXACT** | external_id + amount + date | Auto-match (com confirmação) |
| **HIGH** | customer + amount + date | Sugestão forte |
| **MEDIUM** | amount + date ± tolerância | Sugestão fraca |
| **UNMATCHED** | Nenhum match | Revisão manual |

---

## REGRAS

1. **Nunca alterar financeiro automaticamente** sem confirmação humana
2. **Nunca usar LLM** nesta fase (somente regras determinísticas)
3. **Nunca match silencioso ambíguo** (sempre mostrar sugestão)
4. **Sempre preview antes de confirmar**
5. **Sempre audit trail** de cada conciliação

---

## DIFERENÇAS ENTRE IMPORTAÇÃO E CONCILIAÇÃO

| Aspecto | Importação | Conciliação |
|---|---|---|
| Dados | Histórico completo | Transações recorrentes |
| Direção | Sistema externo → Travel Platform | Arquivo → dados existentes |
| Match | Cria novos registros | Conecta com registros existentes |
| Idempotência | Reimportação não duplica | Não altera sem confirmação |
| Validação | Dados novos | Dados existentes vs arquivo |
