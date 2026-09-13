# Expand → Deploy → Backfill → Contract

- Expand: adicionar sem quebrar versão anterior.
- Deploy: novo código usa estrutura nova.
- Backfill: migrar histórico.
- Contract: remover legado somente em release posterior.

Proibido:
- DROP destrutivo no mesmo deploy
- reescrever migration aplicada
- rename sem compatibilidade
