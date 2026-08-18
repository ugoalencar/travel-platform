# Threat Model

## Ativadores

| Ativador | Motivação | Ameaças |
|----------|-----------|---------|
| **Usuário malicioso** | Acessar dados de outra agência | Cross-tenant access |
| **Atacante externo** | Roubar dados | SQL injection, XSS |
| **Funcionário desonesto** | Vender dados | Acesso indevido |
| **Broker** | Manipular comissões | Fraud |

## Ameaças Identificadas

### T1: Cross-Tenant Access

**Descrição:** Usuário da Agência A acessa dados da Agência B

**Impacto:** CRÍTICO

**Mitigações:**
1. RLS no PostgreSQL
2. Middleware valida agency_id
3. Queries sempre com agency_id
4. Testes de isolamento
5. Audit logs

### T2: SQL Injection

**Descrição:** Atacante injeta SQL em inputs

**Impacto:** CRÍTICO

**Mitigações:**
1. ORM (Prisma)
2. Parameterized queries
3. Input validation (Zod)
4. WAF (Web Application Firewall)

### T3: XSS (Cross-Site Scripting)

**Descrição:** Atacante injeta scripts maliciosos

**Impacto:** ALTO

**Mitigações:**
1. CSP headers
2. Sanitização de output
3. React auto-escaping
4. HttpOnly cookies

### T4: CSRF (Cross-Site Request Forgery)

**Descrição:** Atacante força ações autenticadas

**Impacto:** ALTO

**Mitigações:**
1. SameSite cookies
2. CSRF token
3. Origin/Referer validation

### T5: Brute Force

**Descrição:** Atacante tenta adivinhar senhas

**Impacto:** MÉDIO

**Mitigações:**
1. Rate limiting
2. Account lockout
3. CAPTCHA após falhas
4. Múltiplos fatores (futuro)

### T6: Privilege Escalation

**Descrição:** Usuário ganha acesso indevido

**Impacto:** ALTO

**Mitigações:**
1. RBAC estrito
2. Validação de role em cada endpoint
3. Logs de auditoria
4. Revisão periódica de permissões

### T7: Data Leakage

**Descrição:** Dados sensíveis expostos em logs ou erros

**Impacto:** ALTO

**Mitigações:**
1. Nunca logar dados sensíveis
2. Erros genéricos em produção
3. Sanitização de logs
4. Revisão de código

### T8: Session Hijacking

**Descrição:** Atacante rouba sessão do usuário

**Impacto:** ALTO

**Mitigações:**
1. HttpOnly cookies
2. Secure flag
3. Token expiration curta
4. Regeneração de token

## Matriz de Risco

| Ameaça | Probabilidade | Impacto | Risco | Prioridade |
|--------|---------------|---------|-------|------------|
| T1: Cross-Tenant | Baixa | Crítico | ALTO | P1 |
| T2: SQL Injection | Baixa | Crítico | ALTO | P1 |
| T3: XSS | Média | Alto | ALTO | P1 |
| T4: CSRF | Média | Alto | MÉDIO | P2 |
| T5: Brute Force | Alta | Médio | MÉDIO | P2 |
| T6: Privilege Escal. | Baixa | Alto | MÉDIO | P2 |
| T7: Data Leakage | Média | Alto | MÉDIO | P2 |
| T8: Session Hijack. | Baixa | Alto | MÉDIO | P2 |

## Revisão Periódica

- **Mensal:** Revisar logs de auditoria
- **Trimestral:** Revisar permissões de usuários
- **Semestral:** Atualizar threat model
- **Anual:** Auditoria de segurança completa
