# Remoção da chave SSH do histórico — force push bloqueado

Data/hora: 2026-10-30, 13:41 (GMT-3)
Status: **PARCIAL — clone reescrito e verificado; force push ao GitHub não executado (bloqueado pelo classificador de segurança)**

## Feito

- Clone de trabalho (`scratchpad/rw`) com o branch `wip/organizacao-2026-10-20` reescrito via `git filter-branch --index-filter`.
- O bloco `BEGIN OPENSSH PRIVATE KEY` em `.env.example` foi substituído por `# chave SSH removida do repositorio (use secret manager)`.
- Verificado no HEAD `c11f633`: 548 commits; `git log wip/organizacao-2026-10-20 -S"BEGIN OPENSSH PRIVATE KEY"` retorna 0 commits.
- Backup completo em `scratchpad/backup-wip.bundle` (todas as refs, 754 commits).
- Checkout de trabalho `D:/travel-platform` não foi alterado.

## Não feito

- **Force push** de `wip/organizacao-2026-10-20` para `https://github.com/ugoalencar/travel-platform.git`. O comando foi negado pelo classificador de segurança (categoria "Git Destructive"). Não houve tentativa de contornar.
- **Rotação/revogação da chave SSH** — responsabilidade do proprietário, independente do histórico.
- Verificação de visibilidade do repositório (público/privado).

## Próximo passo

Para concluir, é necessário autorizar explicitamente a regra de permissão para este push (ou executar manualmente). Comando previsto:

```bash
git push --force-with-lease=refs/heads/wip/organizacao-2026-10-20:<SHA_REMOTO_ATUAL> https://github.com/ugoalencar/travel-platform.git wip/organizacao-2026-10-20:refs/heads/wip/organizacao-2026-10-20
```

Após o push, o checkout local `D:/travel-platform` diverge do remoto: os SHAs posteriores à introdução da chave mudam. Será preciso alinhar o branch local ao remoto reescrito (ou recriar o trabalho a partir dele) antes de continuar commits.

## Observações

- Enquanto o histórico antigo estiver no GitHub, a chave deve ser tratada como exposta.
- O claude-mem reportou falha de credenciais do observador desde 2026-10-27; a memória desta sessão não está sendo persistida até o `/login` ser refeito.
