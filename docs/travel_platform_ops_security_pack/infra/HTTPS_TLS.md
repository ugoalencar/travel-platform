# HTTPS / TLS

## Produção
Browser → HTTPS → Frontend → HTTPS → API → TLS → DB/providers.

Obrigatório:
- redirect HTTP→HTTPS
- TLS 1.2+
- preferir TLS 1.3
- certificado e renovação automáticos
- cookies Secure + HttpOnly + SameSite
- HSTS somente após validação completa

Local pode continuar HTTP controlado.
