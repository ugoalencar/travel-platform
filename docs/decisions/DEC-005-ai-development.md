# DEC-005: Desenvolvimento com IA

**Data:** 2026-01-15
**Status:** Aceito
**Decisor:** Tech Lead

---

## Contexto

O projeto será desenvolvido com assistência de IA (opencode/Claude). Precisamos definir regras para garantir qualidade e segurança.

## Decisão

Desenvolvimento assistido por IA com **7 agentes especializados** e **regras obrigatórias**:

### Agentes

| Agente | Função |
|--------|--------|
| Product | Histórias de usuário, critérios de aceite |
| Architect | Arquitetura, boundaries, ADRs |
| Backend | APIs, regras, auth, integrações |
| Database | Schema, migrations, índices |
| Frontend | Apps: Agency, Broker, Customer |
| Security | **OBRIGATÓRIO** - Revisão de segurança |
| QA | Testes unitários, integração, E2E |

### Regras de Uso

1. **Security Agent obrigatório** - Todo PR passa por revisão
2. **Sempre documentar** - Decisões em ADR/DEC
3. **Testar sempre** - Código sem teste não merge
4. **Revisar sempre** - Code review antes de merge

## Alternativas Consideradas

| Abordagem | Velocidade | Qualidade | Decisão |
|-----------|------------|-----------|---------|
| IA sem regras | Alta | Baixa | ❌ |
| IA com regras | Alta | Alta | ✅ |
| Só humanos | Baixa | Alta | ❌ |
| Só IA (sem humanos) | Alta | Média | ❌ |

## Consequências

### Positivas
- Desenvolvimento mais rápido
- Código mais consistente
- Segurança revisada automaticamente
- Documentação sempre atualizada

### Negativas
- Dependência de IA
- Custo de tokens
- Necessita revisão humana
- Pode gerar código genérico

## Ferramentas

| Ferramenta | Uso |
|------------|-----|
| opencode | CLI principal |
| Claude | Agentes |
| GitHub | Versionamento |
| Vitest | Testes |

## Referências

- `.ai/agents/`
- `.ai/skills/`
