# Travel Lite — Migration Mapping

## Objetivo

Mapear entidades do Lite para a Plataforma Full, complementando `docs/travel-lite/INTEGRATION-MAPPING.md` com visão de produto e migração.

## Mapeamento inicial

| Lite | Full | Observação |
|---|---|---|
| `tenants` | agência/tenant | Slug identifica a agência no Lite. |
| `users` | usuários/membros | Perfis Lite precisam ser traduzidos para papéis Full. |
| `customers` | clientes | CPF, contato e status devem ser preservados. |
| `sellers` | funcionários/vendedores | Pode virar usuário, funcionário ou ambos no Full. |
| `sale_categories` | categorias/produtos/serviços | Exige validação de taxonomia. |
| `sales` | venda/booking/trip conforme regra Full | Lite concentra fluxo em venda. |
| `receivables` | contas a receber | Parcelas e status devem ser preservados. |
| `payables` | contas a pagar | Despesas e comissões aprovadas. |
| `seller_commissions` | comissões | Preservar status e origem. |
| `payments` | pagamentos/ledger | Ledger deve permanecer auditável. |

## Lacunas conhecidas

- Lite não possui todos os módulos comerciais do Full.
- Lite não separa alguns conceitos que no Full podem ser entidades distintas.
- Usuários SELLER podem exigir vínculo com funcionário/vendedor no Full.

## Regras

- Nunca migrar senha em texto puro.
- Nunca confiar em dados enviados pelo frontend para tenant.
- Dados com conflito devem ir para fila de revisão.
- Campos sem equivalente devem ser registrados no relatório.

## Critérios de aceite

- Cada entidade Lite tem destino ou decisão documentada.
- Conflitos são explícitos.
- Migração pode ser auditada por registro.
