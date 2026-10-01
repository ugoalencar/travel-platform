# Travel Lite — Migration Readiness

## Objetivo

Definir o verificador de prontidão para upgrade Lite → Full. O verificador deve apontar pendências antes de agendar migração.

## Checagens obrigatórias

- Tenant com nome e slug válidos.
- Usuários ativos com e-mail válido.
- Pelo menos um MASTER.
- Vendedores vinculados quando necessário.
- Clientes sem CPF inválido.
- Vendas com status válido.
- Recebíveis e pagamentos balanceados.
- Comissões sem estado impossível.
- Outbox sem falhas críticas pendentes.

## Resultado esperado

Relatório por severidade:

- **Bloqueador:** impede migração.
- **Atenção:** permite migração com validação humana.
- **Informativo:** não impede.

## Ações sugeridas

Cada item deve indicar:

- problema;
- entidade afetada;
- impacto;
- ação recomendada;
- quem pode corrigir.

## Interface

Inicialmente pode ser relatório técnico/operacional. Evolução futura:

- tela em Configurações;
- botão "Verificar prontidão";
- exportação PDF/CSV.

## Critérios de aceite

- Relatório não altera dados.
- Não acessa produção/staging sem autorização.
- Pode ser rodado antes de qualquer migração.
