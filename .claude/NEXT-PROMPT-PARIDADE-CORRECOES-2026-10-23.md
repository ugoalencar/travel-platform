# Claude: corrigir contrato de paridade apos revisao Codex

Leia `AGENTS.md`, `docs/AI_CONTEXT.md`, `QUALITY-GATES.md`, seu relatorio
`.claude/RELATORIO-PARIDADE-FULL-LITE-2026-10-23.md` e a revisao obrigatoria
`.claude/REVISAO-CODEX-PARIDADE-FULL-LITE-2026-10-23.md`.

Resolva os cinco achados P1, com referencias a codigo, contratos exatos e
casos de teste. Nao basta listar como outra decisao humana. Diferencie
problemas tecnicos solucionaveis das poucas escolhas financeiras a confirmar.
Entregue pareamento sem perda, com revisoes no mesmo dia, categorias distintas,
PENDING_RULE, acumulado canonico e pagamento unico entre folha e avulso.
Corrija a proposta de indice com enum cast, com DDL revisada ainda nao executada.

Saida exclusiva:
`.claude/RESPOSTA-REVISAO-PARIDADE-FULL-LITE-2026-10-23.md`.
Nao sobrescrever os relatorios anteriores nem editar fontes, docs globais,
schema, migrations, lockfiles ou arquivos de outros agentes. Nenhum teste que
recrie banco, .env, dados reais, acesso online, migracao, deploy ou commit/push.

Manter HOLD para implementacao. Gadotti permanece no Lite e os bancos seguem
separados. Ao terminar, informar arquivo entregue e o que nao foi verificado.
