# SSRF — Pescador

Bloquear:
- localhost
- 127.0.0.0/8
- ::1
- RFC1918
- link-local
- 169.254.169.254
- metadata endpoints
- file://, ftp://, gopher://
- redirects para IP privado
- DNS rebinding

Permitir apenas HTTP/HTTPS.

Validar DNS/IP:
- antes da requisição
- após redirects

Aplicar:
- timeout
- limite de redirects
- limite de tamanho
- sem cookies/headers internos
- egress control quando possível
