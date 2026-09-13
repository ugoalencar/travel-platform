# XSS / CSRF / IDOR-BOLA

## XSS
- revisar `dangerouslySetInnerHTML`
- sanitizar rich text/templates
- CSP
- escapar input

## CSRF
Se cookies:
- SameSite
- CSRF token quando necessário
- Origin/Referer validation em mutações sensíveis

## IDOR/BOLA
Toda rota com resourceId:
- tenant ownership
- role check
- self-scope customer/partner
- não confiar no ID do browser

Testar Tenant A tentando IDs de Tenant B.
