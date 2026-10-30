# Revisao e complemento da Fase 0 de comissoes

Data: 2026-10-23. Entrada: `RELATORIO-PARIDADE-FASE0-2026-10-23.md` e codigo
presente no checkout. Nao presumir conclusao COM-01/02/03 pela Fase 0.

## Autorizacao e isolamento

O usuario autorizou explicitamente criar/aplicar migrations apenas em banco
local novo e descartavel. Testes executados com projeto/container
`travel-full-lite-align-20261023`, bind `127.0.0.1:55439`, base de teste.
Os fixtures de characterization e financial passaram a aceitar os overrides
de projeto/container ja suportados no compose, mantendo os defaults antigos.
Isso evita usar o nome compartilhado ou o demo de apresentacao na porta 55438.

Todos os testes limpam somente esse projeto/volume descartavel. Nenhum banco
online, Gadotti, credencial real, DNS ou dado de apresentacao foi alterado.

## Resultado da revisao

- Os 20 testes entregues pelo Claude passaram no ambiente isolado.
- Faltava revalidar comissao/folha no momento da alocacao do pagamento. Quatro
  testes novos reproduziram baixas indevidas com comissao cancelada, valor
  alterado ou obrigacao que nao correspondia a comissao integral.
- Criado `services/api/src/commission-payment-guard.ts`, usado por
  `allocatePayment`: trava folhas e entradas antes de pagamentos/payables,
  verifica canais, estados e correspondencia de valores; erro gera rollback.
- Um quinto teste reproduziu regeneracao de folha OPEN que aguardava aprovacao
  concorrente e depois alterava uma folha ja aprovada. `generatePayrollEntry`
  agora trava a linha existente antes de verificar seu estado e reservar.
- Contratos de negocio avancados e arredondamento historico nao foram alterados.

## Evidencias executadas

| Gate | Resultado |
| --- | --- |
| Characterization original | 20/20 aprovados |
| Novos testes de baixa antes da protecao | 4 falhas de comportamento reproduzidas |
| Nova corrida aprovacao/regeneracao antes do lock | 1 falha reproduzida |
| Characterization + financial apos complementos | **37/37 aprovados**, 2 arquivos, exit 0 |
| API Full lint | exit 0, 13 avisos fora dos novos arquivos |
| API Full build | exit 0 |
| API Full typecheck | exit 0 durante a integracao; reconferir apos CEP externo |

Comando de DB usado com overrides de teste:
`npm.cmd run test --workspace=@travel-platform/api -- tests/commission-characterization.test.ts tests/financial.test.ts`.
Os fixtures aplicam migrations somente no projeto isolado, incluindo a 100.

## Limites

Fase 0 nao entrega faixas progressivas, heranca/revisoes novas, liberacao por
recebimento, estorno, permissoes individuais, backup ou importacao Full.
Nao houve suite completa de todos os workspaces nem teste online. A frente
CEP esta sendo editada por outro agente; nao sobrescrever seus arquivos.
Reconciliacao de legado continua explicita, nao uma migracao automatica.
