# DEC-006: Segurança nos Agentes

**Data:** 2026-01-15
**Status:** Aceito
**Decisor:** Tech Lead + Security

---

## Contexto

Agentes de IA geram código automaticamente. Precisamos garantir que código gerado não tenha vulnerabilidades de segurança.

## Decisão

**Security Agent é OBRIGATÓRIO** em todo PR. Deve revisar **14 pontos**:

### Checklist de Segurança

| # | Ponto | Obrigatório |
|---|-------|-------------|
| 1 | Autenticação | Sim |
| 2 | Autorização | Sim |
| 3 | RBAC | Sim |
| 4 | Tenant Isolation | Sim |
| 5 | LGPD | Sim |
| 6 | Secrets | Sim |
| 7 | SQL Injection | Sim |
| 8 | XSS | Sim |
| 9 | CSRF | Sim |
| 10 | SSRF | Sim |
| 11 | Upload | Sim |
| 12 | Logs | Sim |
| 13 | Rate Limiting | Sim |
| 14 | Exposição de Dados | Sim |

### Fluxo Obrigatório

```
1. Agente gera código
2. Security Agent revisa
3. Se aprovado → merge
4. Se rejeitado → corrige e revisa novamente
```

### Bloqueios Automáticos

O PR **NÃO PODE** ser mergeado se:

- [ ] agency_id ausente em query
- [ ] Secret em código
- [ ] Erro exposto em produção
- [ ] Query sem parameterização
- [ ] Teste de isolamento falhando

## Padrões Obrigatórios

### Multi-Tenancy

```typescript
// NUNCA
const customers = await prisma.customer.findMany();

// SEMPRE
const customers = await prisma.customer.findMany({
  where: { agencyId: getAgencyId() }
});
```

### Secrets

```typescript
// NUNCA
const secret = 'minha-chave';

// SEMPRE
const secret = process.env.JWT_SECRET;
```

### Erros

```typescript
// NUNCA
reply.code(500).send({ error: error.message });

// SEMPRE
reply.code(500).send({ error: 'Internal server error' });
```

## Consequências

### Positivas
- Código revisado automaticamente
- Vulnerabilidades capturadas cedo
- Padrões de segurança consistentes
- LGPD compliance

### Negativas
- Mais lento (revisão extra)
- Pode rejeitar código válido
- Custo de processamento
- Necessita manutenção do Security Agent

## Métricas

| Métrica | Meta |
|---------|------|
| PRs aprovados 1ª vez | > 80% |
| Vulnerabilidades em produção | 0 |
| Tempo de revisão | < 5 min |

## Referências

- `.ai/agents/security-agent.md`
- `docs/SECURITY.md`
- `docs/03-security/`
