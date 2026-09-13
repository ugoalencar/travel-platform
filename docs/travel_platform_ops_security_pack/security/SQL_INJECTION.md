# SQL Injection

## Regra absoluta
Nunca concatenar input do usuário em SQL.

Usar:
- prepared statements
- parâmetros posicionais
- query builders seguros
- Prisma parametrizado quando aplicável

Revisar:
- `$queryRawUnsafe`
- `$executeRawUnsafe`
- SQL com `${...}`
- concatenação de SELECT/INSERT/UPDATE/DELETE
- ORDER BY dinâmico

ORDER BY/column/table/report fields devem usar whitelist.

## Testes
Payloads:
'
" OR 1=1 --
'; DROP TABLE ...
UNION SELECT
URL encoded variants

Critério:
- consulta não muda
- sem cross-tenant leak
- DB não sofre alteração indevida
- erro não expõe SQL interno
