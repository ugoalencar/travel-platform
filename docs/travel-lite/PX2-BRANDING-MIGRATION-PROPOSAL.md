# PX2 — Branding por tenant: proposta de migration (NÃO aplicada)

> **Estado:** proposta. Nenhuma migration foi criada em `infrastructure/migrations-travel-lite/`, aplicada ou executada em qualquer banco (local, teste, staging ou produção). O SQL abaixo existe só neste documento, de propósito: os testes do `api-lite` aplicam todo `.sql` dessa pasta no banco de teste, então copiar o arquivo para lá já seria executar a migration. Isso exige aprovação explícita.

## 1. Por que precisa de migration

Auditoria do estado atual:

- `tenants` só tem `name`, `slug`, `status`, `external_id`, `source_system`, `sync_status` e timestamps. Não existe coluna de identidade visual.
- O runtime só pode `UPDATE` em `name, status, external_id, source_system, sync_status, updated_at` (`002_rls_policies.sql:111`); não há grant para colunas novas.
- Não há tabela genérica de configurações por tenant. `dashboard_settings.widgets` é um array de widgets do dashboard (`CHECK jsonb_typeof = 'array'`); guardar branding ali seria um desvio de propósito.
- O catálogo de permissões é lido do banco (`permissions`); uma permissão nova também exigiria migration. Por isso a primeira versão **reaproveita `dashboard.configure`** (só MASTER, por padrão), sem dado novo no catálogo.

Conclusão: o armazenamento exige uma tabela nova. O resto (validação, rotas, front, testes) foi implementado sem tocar no schema.

## 2. SQL proposto — `006_tenant_branding.sql`

```sql
-- Travel Lite 006 — identidade visual por tenant (PX2).
-- Aditiva e idempotente: não altera nem remove nada existente.

CREATE TABLE IF NOT EXISTS tenant_branding (
  tenant_id UUID PRIMARY KEY REFERENCES tenants (id),
  display_name TEXT
    CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 80),
  welcome_text TEXT
    CHECK (welcome_text IS NULL OR char_length(welcome_text) BETWEEN 1 AND 160),
  primary_color TEXT
    CHECK (primary_color IS NULL OR primary_color ~ '^#[0-9a-fA-F]{6}$'),
  secondary_color TEXT
    CHECK (secondary_color IS NULL OR secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  login_background TEXT
    CHECK (login_background IS NULL OR login_background ~ '^#[0-9a-fA-F]{6}$'),
  logo_mime TEXT
    CHECK (logo_mime IS NULL OR logo_mime IN ('image/png', 'image/jpeg', 'image/webp')),
  logo_data BYTEA
    CHECK (logo_data IS NULL OR octet_length(logo_data) BETWEEN 1 AND 153600),
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((logo_mime IS NULL) = (logo_data IS NULL)),
  FOREIGN KEY (tenant_id, updated_by) REFERENCES users (tenant_id, id)
);

-- O runtime lê e grava; não apaga (limpar = gravar NULLs).
GRANT SELECT, INSERT, UPDATE ON tenant_branding TO travel_lite_runtime;

ALTER TABLE tenant_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_branding FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tenant_branding' AND policyname = 'tenant_branding_select_tenant') THEN
    CREATE POLICY tenant_branding_select_tenant ON tenant_branding
      FOR SELECT USING (tenant_id = current_tenant_id()::uuid);
    CREATE POLICY tenant_branding_insert_tenant ON tenant_branding
      FOR INSERT WITH CHECK (tenant_id = current_tenant_id()::uuid);
    CREATE POLICY tenant_branding_update_tenant ON tenant_branding
      FOR UPDATE USING (tenant_id = current_tenant_id()::uuid)
      WITH CHECK (tenant_id = current_tenant_id()::uuid);
  END IF;
END $$;
```

- Mesmo desenho de RLS e grants de `004` (`dashboard_settings`), sem política de `DELETE`.
- As `CHECK` repetem as regras da aplicação como segunda barreira (cor `#RRGGBB`, tipos de imagem raster, teto de 150 KB, texto e arquivo juntos ou nulos).
- Logo em `BYTEA`: sem arquivo externo, sem serviço de storage novo, e ~33% menor que guardar o data URL em texto.

**Reversão:** `DROP TABLE IF EXISTS tenant_branding;` (sem dependentes; nenhuma outra tabela referencia esta).

## 3. Ordem de implantação

1. Aprovar e aplicar a migration (operador, no fluxo normal de migrations do Lite).
2. Só então publicar o código.

Se o código subir **antes** da migration, nada quebra o login nem o sistema:
- `GET /branding/public` responde 200 com o tema padrão (falha aberta, com `warn` no log);
- `GET /branding` responde 500 e o front mantém o visual padrão;
- o editor em Configurações mostra "Não foi possível carregar a identidade visual atual" e não permite salvar (para um erro de leitura nunca virar "sem branding" e apagar a identidade ao salvar);
- `PUT /branding` responde 500.

## 4. O que foi implementado (sem migration)

**`services/api-lite`**
- `src/branding.ts`: validação pura — cor estrita `#RRGGBB`, contraste mínimo do texto branco (primária ≥ 3:1, secundária ≥ 4,5:1), textos limitados e sem caracteres de controle, logo PNG/JPEG/WebP com conferência dos bytes iniciais (SVG recusado), teto de 150 KB, slug estrito.
- `src/routes/branding.ts`: `GET /branding/public?slug=` (login, sem sessão), `GET /branding` (qualquer usuário autenticado) e `PUT /branding` (`dashboard.configure`), com evento de auditoria `BRANDING_UPDATED` (só nomes dos campos alterados, nunca o conteúdo do logo).
- Registro em `src/app.ts` e novo evento em `src/audit-log.ts`.

**`apps/travel-lite`**
- `src/branding.ts` (helpers puros, revalidam tudo que chega da API) e `src/BrandingProvider.tsx` (carrega após o login, aplica as variáveis CSS e expõe o estado da leitura).
- Login: logo, nome fantasia, texto de boas-vindas, cor primária e fundo da agência. O slug vem de `?agencia=slug` (link por agência) ou do último usado no navegador, e a prévia é atualizada ao digitar.
- App autenticado: logo e nome no topo do menu, cor primária nos botões e destaques, cor secundária no menu lateral.
- Configurações › **Identidade visual** (`dashboard.configure`): nome, texto, três cores, logo (envio, prévia e remoção), salvar e restaurar o padrão com confirmação.
- Sem branding ou com valor inválido: tema padrão do sistema.

## 5. Decisões de segurança

- **Tenant nunca vem do front.** O público resolve o tenant pelo slug no servidor (mesmo caminho do login) e responde sem nenhum id; o autenticado usa o tenant da sessão. Um `tenantId` enviado em query, header ou corpo é ignorado (há teste).
- **Sem novo oráculo de existência de agência.** Slug desconhecido, inativo ou malformado recebe o mesmo `200` com tema padrão que um tenant sem branding. Ainda assim, quem tem branding configurado revela que o slug existe; é o preço de personalizar o login e é um dado já visível na tela de login daquela agência.
- **Falha aberta só no login.** Sem isso uma falha cosmética impediria o acesso; a leitura autenticada e a escrita falham fechadas.
- **Sem CSS livre nem SVG.** Só 3 cores `#RRGGBB` viram variáveis CSS e só imagem raster com bytes conferidos vira `<img>`; o front revalida o que a API devolve (valor corrompido no banco não chega a atributo de estilo nem a `src`).
- **Permissão:** `dashboard.configure` é concedida só ao MASTER. Uma permissão própria (`branding.configure`) é a evolução natural, mas exige linha nova em `permissions` (outra migration).

## 6. Riscos e limites conhecidos

- **O SQL das rotas e a migration não foram executados em nenhum banco.** Os testes de rota usam um banco simulado que roteia por trecho de SQL; eles provam autorização, validação, escopo de tenant e fallback, **não** a correção do SQL. `tests/branding-db.test.ts` (Postgres real: `CHECK`, RLS, grants, `keep/remove/set` do logo, auditoria) já está escrito e fica **pulado automaticamente** até existir uma migration com `branding` no nome na pasta de migrations; deve ser rodado logo após a aprovação.
- **Endpoint público sem limite de taxa** (o `api-lite` não tem rate limit hoje). Cada chamada com slug válido faz 2 consultas leves; vale incluir no pacote de proteção geral do login.
- **Logo dentro do JSON do login** (até ~200 KB em base64). Aceitável no piloto; para muitos tenants, trocar por URL com cache (storage + CDN).
- **Dois usuários editando ao mesmo tempo:** vale o último a salvar (sem controle de versão).
- Fora do escopo desta fase, como no `BRANDING.md`: editor visual avançado, tema por usuário, CSS livre.

## 7. Como testar depois da aprovação

```powershell
# 1. copiar o SQL da seção 2 para infrastructure/migrations-travel-lite/006_tenant_branding.sql
# 2. no worktree do Travel Lite:
npx turbo run test --filter=@travel-platform/api-lite --force   # inclui tests/branding-db.test.ts
```
