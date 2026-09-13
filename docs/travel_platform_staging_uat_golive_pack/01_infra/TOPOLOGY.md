# Topologia de staging

Frontends:
- Agency
- Customer
- Platform Admin
- Marketing

API:
- Fastify em host Node separado, HTTPS obrigatório.

Dados:
- PostgreSQL staging isolado
- storage staging
- Redis se exigido por rate limits/jobs

Fluxo:
Browser -> HTTPS Frontend -> HTTPS API -> TLS DB/providers

Nunca compartilhar banco com produção.
