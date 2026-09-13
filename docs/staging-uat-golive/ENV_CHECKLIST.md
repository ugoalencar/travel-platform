# Environment Checklist — Staging

**Data:** 2026-09-12
**Versão:** 0.1.0

---

## OBRIGATÓRIOS (devem estar definidos)

### Core

| Variável | Descrição | Valor Staging | Status |
|----------|-----------|---------------|--------|
| `NODE_ENV` | Ambiente | `staging` | ⏳ |
| `PORT` | Porta da API | `3000` | ⏳ |
| `HOST` | Host da API | `0.0.0.0` | ⏳ |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/travel_staging` | ⏳ |

### Database Pool

| Variável | Descrição | Valor Staging | Status |
|----------|-----------|---------------|--------|
| `DB_POOL_MAX` | Max connections | `10` | ⏳ |
| `DB_POOL_CONNECTION_TIMEOUT` | Connection timeout (ms) | `5000` | ⏳ |
| `DB_POOL_IDLE_TIMEOUT` | Idle timeout (ms) | `30000` | ⏳ |

### Auth

| Variável | Descrição | Valor Staging | Status |
|----------|-----------|---------------|--------|
| `ALLOW_DEV_AUTH` | Dev auth bypass | `false` | ⏳ |
| `JWT_SECRET` | JWT signing secret | *(gerar 32+ bytes)* | ⏳ |
| `JWT_EXPIRY` | Token expiry | `24h` | ⏳ |

### CORS

| Variável | Descrição | Valor Staging | Status |
|----------|-----------|---------------|--------|
| `CORS_ORIGINS` | Allowed origins (comma-separated) | `https://agency.staging.domain,https://customer.staging.domain` | ⏳ |

---

## PROVIDERS (sandbox para staging)

### Captcha

| Variável | Descrição | Valor Staging | Status |
|----------|-----------|---------------|--------|
| `CAPTCHA_ENABLED` | Enable captcha | `true` | ⏳ |
| `CAPTCHA_PROVIDER` | Provider type | `RECAPTCHA_V3` ou `HCAPTCHA` | ⏳ |
| `RECAPTCHA_V3_SECRET_KEY` | reCAPTCHA v3 secret | *(do Google Console)* | ⏳ |
| `RECAPTCHA_V3_SCORE_THRESHOLD` | Score threshold | `0.5` | ⏳ |
| `HCAPTCHA_SECRET` | hCaptcha secret | *(do hCaptcha dashboard)* | ⏳ |

### OCR (Document Extraction)

| Variável | Descrição | Valor Staging | Status |
|----------|-----------|---------------|--------|
| `OCR_PROVIDER` | OCR provider | `GOOGLE_VISION` ou `MOCK` | ⏳ |
| `GOOGLE_VISION_API_KEY` | Google Cloud Vision API key | *(do Google Cloud Console)* | ⏳ |

### MFA (Multi-Factor Auth)

| Variável | Descrição | Valor Staging | Status |
|----------|-----------|---------------|--------|
| `MFA_TOTP_ALGORITHM` | TOTP algorithm | `SHA1` | ⏳ |
| `MFA_TOTP_DIGITS` | OTP digits | `6` | ⏳ |
| `MFA_TOTP_PERIOD` | OTP period (seconds) | `30` | ⏳ |

### Social Connector (Meta/Instagram)

| Variável | Descrição | Valor Staging | Status |
|----------|-----------|---------------|--------|
| `CONNECTOR_META_ACCESS_TOKEN` | Meta page/user access token | *(do Meta App Dashboard)* | ⏳ |
| `CONNECTOR_META_PAGE_ID` | Facebook Page ID | *(do Meta App Dashboard)* | ⏳ |
| `CONNECTOR_META_API_VERSION` | Graph API version | `v21.0` | ⏳ |

### Email (Sandbox)

| Variável | Descrição | Valor Staging | Status |
|----------|-----------|---------------|--------|
| `EMAIL_PROVIDER` | Email provider | `SANDBOX` ou `RESEND` | ⏳ |
| `EMAIL_FROM` | Sender address | `noreply@staging.domain` | ⏳ |
| `RESEND_API_KEY` | Resend API key | *(se usar Resend)* | ⏳ |

### Storage

| Variável | Descrição | Valor Staging | Status |
|----------|-----------|---------------|--------|
| `STORAGE_PROVIDER` | Storage provider | `LOCAL` ou `S3` | ⏳ |
| `STORAGE_BUCKET` | S3 bucket name | *(se S3)* | ⏳ |

### Rate Limiting

| Variável | Descrição | Valor Staging | Status |
|----------|-----------|---------------|--------|
| `RATE_LIMIT_STORE` | Rate limit store | `memory` (staging) / `external` (prod) | ⏳ |
| `REDIS_URL` | Redis connection | *(se external store)* | ⏳ |

---

## FRONTENDS

### Agency Frontend

| Variável | Descrição | Valor Staging | Status |
|----------|-----------|---------------|--------|
| `VITE_API_URL` | API base URL | `https://api.staging.domain` | ⏳ |
| `VITE_AUTH_ISSUER` | OIDC issuer URL | *(do provider)* | ⏳ |
| `VITE_AUTH_CLIENT_ID` | OIDC client ID | *(do provider)* | ⏳ |

### Customer Frontend

| Variável | Descrição | Valor Staging | Status |
|----------|-----------|---------------|--------|
| `VITE_API_URL` | API base URL | `https://api.staging.domain` | ⏳ |
| `VITE_PORTAL_URL` | Customer portal URL | `https://customer.staging.domain` | ⏳ |

### Platform Admin

| Variável | Descrição | Valor Staging | Status |
|----------|-----------|---------------|--------|
| `VITE_API_URL` | API base URL | `https://api.staging.domain` | ⏳ |

### Marketing

| Variável | Descrição | Valor Staging | Status |
|----------|-----------|---------------|--------|
| `VITE_API_URL` | API base URL | `https://api.staging.domain` | ⏳ |

---

## CHECKLIST DE VALIDAÇÃO

### Pré-deploy

- [ ] `NODE_ENV=staging` definido
- [ ] `DATABASE_URL` apontando para PostgreSQL staging isolado
- [ ] `ALLOW_DEV_AUTH=false`
- [ ] `JWT_SECRET` gerado (32+ bytes, aleatório)
- [ ] `CORS_ORIGINS` configurado com todos os frontends
- [ ] Nenhum secret no Git

### Pós-deploy

- [ ] `GET /health` retorna 200
- [ ] `GET /readiness` retorna 200
- [ ] `GET /version` retorna versão correta
- [ ] Login funciona (dev-auth desabilitado)
- [ ] CORS funciona (testar de cada frontend)
- [ ] Rate limiting funciona
- [ ] Captcha funciona (sandbox)
- [ ] OCR funciona (sandbox ou mock)
- [ ] Social connector funciona (sandbox)
- [ ] MFA funciona (TOTP)
- [ ] Email funciona (sandbox)

### Segurança

- [ ] HTTPS obrigatório
- [ ] TLS válido (sem warning no browser)
- [ ] CORS restrito (apenas origins listados)
- [ ] RLS enforcement (testar cross-tenant)
- [ ] Sem secrets expostos em logs/errors
- [ ] Sem dev-auth público
- [ ] Sem service role no browser

### Dados

- [ ] Seed script executado (2 tenants)
- [ ] Cross-tenant isolation testada
- [ ] Dados sintéticos (nada real)

---

## NOTAS

- **Staging** usa dados sintéticos e providers sandbox
- **Produção** requer secrets distintos e providers reais
- **Dev auth** deve estar DESABILITADO no staging
- **Redis** é obrigatório apenas se `RATE_LIMIT_STORE=external`
- **Captcha** pode usar `MOCK` em staging se sandbox não estiver disponível
- **OCR** pode usar `MOCK` em staging se Google Vision não estiver configurado
- **Social** pode usar `INTERNAL_MOCK` em staging se Meta não estiver configurado
