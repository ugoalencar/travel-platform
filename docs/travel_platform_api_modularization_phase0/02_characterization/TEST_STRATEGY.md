# Characterization Tests

Para cada rota do piloto congelar:
- method
- URL
- success status
- validation status
- auth
- RBAC
- tenant
- entitlements
- request schema
- response shape
- audit
- error safety
- cross-tenant behavior

Os mesmos testes devem passar antes e depois da extração.
Se o teste precisar ser relaxado para o refactor passar, presumir regressão.
