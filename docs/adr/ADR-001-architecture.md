# ADR-001: Arquitetura monorepo

## Status

Aceito

## Contexto

Precisamos de uma arquitetura que suporte múltiplas aplicações (agency, broker, customer) com código compartilhado (domain, database, shared).

## Decisão

Adotar monorepo com a seguinte estrutura:

```
travel-platform/
├── apps/           # Aplicações frontend
├── packages/       # Código compartilhado
├── services/       # Backend services
├── infrastructure/ # Docker, migrations
└── tests/          # Testes E2E
```

### Ferramentas

- **Package Manager:** npm workspaces
- **Build:** Turborepo
- **Test:** Vitest
- **Lint:** ESLint + Prettier

## Alternativas Consideradas

| Opção | Prós | Contras |
|-------|------|---------|
| **Monorepo** | Código compartilhado, refactoring fácil | Build complexo |
| Multi-repo | Independência | Duplicação, sincronização difícil |
| Polyrepo | Flexibilidade | Overhead de manutenção |

## Consequências

### Positivas
- Código compartilhado entre apps
- Refactoring atômico
- Consistência de padrões
- CI/CD simplificado

### Negativas
- Build mais lento (mitigado com Turborepo)
- Maior complexidade inicial
- Acoplamento entre equipes (mitigado com boundaries)

## Referências

- [Turborepo](https://turbo.build/repo)
- [npm workspaces](https://docs.npmjs.com/cli/v7/using-npm/workspaces)
