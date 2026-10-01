# Travel Lite — Upgrade para Plataforma Full

## Objetivo

Permitir que uma agência comece no Lite e migre para a Plataforma Full sentindo principalmente a diferença de ambiente e amplitude, não perda de dados.

## Princípios

- O Lite deve capturar dados compatíveis com a plataforma Full sempre que possível.
- UUIDs e `external_id` devem apoiar rastreabilidade.
- Migração deve ser agendada e verificável.
- Nenhum dado deve ser descartado silenciosamente.

## Fluxo recomendado

1. Agência solicita upgrade.
2. Sistema gera relatório de prontidão.
3. Pendências são corrigidas no Lite.
4. Migração é agendada.
5. Dados são exportados/sincronizados.
6. Operador valida amostras.
7. Agência acessa ambiente Full.

## O que deve migrar

- Agência/tenant.
- Usuários elegíveis.
- Clientes.
- Vendedores.
- Categorias.
- Vendas.
- Recebíveis.
- Pagáveis.
- Comissões.
- Lançamentos financeiros.
- Auditoria relevante.

## O que pode exigir decisão humana

- Planos comerciais.
- Recursos Full ainda sem equivalente no Lite.
- Campos customizados.
- Dados inconsistentes ou incompletos.

## Critérios de aceite

- Existe relatório antes da migração.
- Existe trilha de quais registros foram migrados.
- Existe plano de rollback operacional.
