# PX2 — Branding por tenant e login personalizado (Travel Lite)

- **Data/hora:** 2026-10-01 20:07
- **Prompt:** `.claude/NEXT-PROMPT-PX2-BRANDING-LOGIN-TENANT.md`
- **Worktree:** `D:\travel-platform\.worktrees\travel-lite` (`feature/travel-lite`, sobre o commit `0f07870`)
- **Estado:** código e testes prontos e verificados. **A migration é indispensável e NÃO foi criada na pasta de migrations nem aplicada em nenhum banco.** Nada commitado, enviado ou publicado.

## 1. Auditoria

| Ponto | Achado |
|---|---|
| Tabela `tenants` | Só `name`, `slug`, `status`, `external_id`, `source_system`, `sync_status` e timestamps. **Sem coluna de identidade visual** |
| Grants do runtime em `tenants` | `SELECT` e `UPDATE` só em `name, status, external_id, source_system, sync_status, updated_at` (`002_rls_policies.sql:111`) |
| Configuração por tenant já existente | Só `dashboard_settings` (array de widgets do dashboard). Usá-la para branding seria desvio de propósito |
| Permissões | Vêm do catálogo no banco (`permissions`); permissão nova também exigiria migration |
| Login | `POST /auth/login` resolve o tenant pelo `slug` no servidor e responde "Invalid credentials" igual para tenant inexistente (sem oráculo) |
| Front | Login com campo "Agência" (slug) e título fixo "Travel Lite"; menu lateral com cor fixa; `SettingsPage` só de usuários |
| Docs | `docs/travel-lite/product-experience/` existe só no checkout principal (não rastreado); o worktree não os tem |

**Conclusão:** o armazenamento exige uma tabela nova, então é **migration indispensável**. Seguindo o prompt, **não executei** e documentei o SQL. Implementei tudo o que não depende de aplicar schema.

## 2. Migration proposta (NÃO aplicada) — `006_tenant_branding.sql`

Cópia integral também em `docs/travel-lite/PX2-BRANDING-MIGRATION-PROPOSAL.md` (no worktree). O arquivo **não** está em `infrastructure/migrations-travel-lite/` de propósito: os testes do `api-lite` aplicam todo `.sql` dessa pasta no banco de teste, o que já seria executar a migration.

```sql
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

Aditiva e idempotente, mesmo desenho de RLS e grants da `004` (`dashboard_settings`), sem política de `DELETE`. **Reversão:** `DROP TABLE IF EXISTS tenant_branding;`.

**Coordenação necessária (decisão sua):** aprovar e aplicar a migration (operador, no fluxo normal do Lite) **antes** de publicar o código. Se o código subir antes, o login e o sistema não quebram: o login público cai no tema padrão, o sistema autenticado mantém o visual padrão e o editor avisa que não conseguiu carregar e não deixa salvar.

## 3. Implementação

### `services/api-lite`
- `src/branding.ts`: validação pura. Cor estrita `#RRGGBB`; contraste mínimo contra o texto branco (primária ≥ 3:1, secundária ≥ 4,5:1); textos limitados (80 e 160) e sem caracteres de controle; logo PNG/JPEG/WebP com conferência dos bytes iniciais (**SVG recusado**) e teto de 150 KB; slug estrito; valores corrompidos lidos do banco viram "padrão".
- `src/routes/branding.ts`:
  - `GET /branding/public?slug=` (login, sem sessão): tenant resolvido pelo slug **no servidor**; resposta sem nenhum id; slug desconhecido, inativo ou malformado recebe o **mesmo 200 com tema padrão**; falha de leitura cai no tema padrão (o login nunca quebra); `cache-control: no-store`.
  - `GET /branding` (autenticado): tenant da sessão; **falha fechada** (500) para o editor nunca partir de um "vazio" falso.
  - `PUT /branding` (`dashboard.configure`, só MASTER por padrão): tenant da sessão (`tenantId` no corpo, query ou header é ignorado), logo com `keep`/`remove`/`set`, auditoria `BRANDING_UPDATED` só com os **nomes** dos campos alterados (nunca o conteúdo do logo).
- `src/app.ts` (registro) e `src/audit-log.ts` (novo evento).

### `apps/travel-lite`
- `src/branding.ts` (helpers puros que **revalidam** tudo que chega da API) e `src/BrandingProvider.tsx` (carrega após o login, aplica variáveis CSS no documento e expõe o estado da leitura).
- **Login:** logo, nome fantasia, texto de boas-vindas, cor primária e fundo da agência. O slug vem de `?agencia=slug` (link por agência) ou do último usado no navegador, e a prévia atualiza ao digitar (com debounce). Sem branding ou com falha: visual padrão.
- **App autenticado:** logo e nome no topo do menu, cor primária em botões e destaques, cor secundária no menu lateral.
- **Configurações › Identidade visual** (`dashboard.configure`): nome, texto, 3 cores (seletor, hex e "Padrão"), logo (envio, prévia, remoção, validação de tipo e tamanho no cliente), salvar e restaurar o padrão com confirmação. O editor só abre depois de a identidade atual ter sido **realmente lida**; se a leitura falhar, mostra o aviso e não permite salvar (evita apagar a identidade por engano).
- `src/styles.css`: variáveis `--lite-sidebar` e `--lite-login-bg` (com os valores antigos como padrão) e classes do logo e do formulário.

## 4. Testes

| Suíte | Resultado |
|---|---|
| `services/api-lite/tests/branding.test.ts` (novo, banco simulado) | **31/31.** Validação (cores, contraste, textos, logo PNG/JPEG/WebP, SVG/tipo/bytes/tamanho, slug); público (tenant pelo slug, sem id, slug desconhecido/inativo/malformado com o mesmo padrão, `tenantId` do cliente ignorado, falha leva ao padrão); autenticado (401, tenant da sessão, falha fechada); `PUT` (401, 403 sem permissão, MASTER salva no tenant da sessão, auditoria só com nomes, `keep` e `remove`, 400 sem tocar no banco) |
| `apps/travel-lite/src/branding.test.tsx` (novo) | **18/18.** Sanitização de valores; login por link e por digitação; fallback; valores inseguros ignorados; slug inválido sem chamada; shell com e sem branding; editor (visibilidade por permissão, salvar sem `tenantId` e sem logo intocado, erro da API, logo grande ou não imagem, logo novo e remoção, restaurar com confirmação, leitura falha e editor fechado) |
| `services/api-lite/tests/branding-db.test.ts` (novo, **Postgres real**) | **Pulado automaticamente** até existir uma migration com "branding" no nome na pasta de migrations. Cobre `CHECK`, RLS, grants, `keep/remove/set`, auditoria e isolamento entre tenants |
| Totais | travel-lite 40/40 (22 anteriores + 18). api-lite **128 passaram e 6 puladas** (as 97 anteriores com Postgres + 31 novas; as 6 puladas são as do `branding-db`) |

**Os testes de segurança protegem de verdade** (mutação temporária, revertida): tirar `requirePermission` do `PUT` derruba o teste de 403; afrouxar a validação de cor no front derruba 3 testes.

## 5. Gates (no worktree)

| Gate | Resultado |
|---|---|
| `npx turbo run lint typecheck test build --filter=@travel-platform/api-lite --filter=@travel-platform/travel-lite --force` | **8/8 tarefas OK** |
| lint | 0 erros. 4 warnings `react-refresh` já existentes (`auth.tsx`, `charts.tsx`, `ui.tsx`); os erros que apareceram nos meus arquivos foram corrigidos |
| `npx tsc -p tsconfig.json --noEmit` (raiz do worktree) | OK |
| Docker | ligado durante os testes do `api-lite`; nenhum container foi criado, alterado ou removido por mim |

## 6. Smoke visual

App do worktree (Vite) contra uma **API de mentira local com dados fictícios**. Nenhuma credencial real, nenhum banco tocado; servidores encerrados e `localStorage` limpo.

- **Login por link da agência** (`/login?agencia=gadotti`): logo, "Gadotti Viagens", texto de boas-vindas e fundo creme da agência. OK.
- **App autenticado:** menu lateral marrom (secundária), item ativo laranja (primária), logo e nome no topo. OK.
- **Configurações › Identidade visual:** o editor abre com os valores atuais. OK.
- Uma captura do login saiu em branco uma vez por lentidão de pintura do painel; repetida, apareceu normal.

## 7. Riscos e pendências

1. **O SQL e a migration não foram executados em nenhum banco.** Os testes de rota provam autorização, validação, escopo de tenant e fallback, **não a correção do SQL**. O `branding-db.test.ts` cobre isso e deve rodar logo após a aprovação.
2. **Endpoint público sem limite de taxa** (o `api-lite` não tem rate limit hoje). Cada chamada com slug válido faz 2 consultas leves. Incluir no pacote de proteção do login.
3. **Quem tem branding revela que o slug existe** (o tema difere do padrão). É inevitável para personalizar o login, e a informação já é visível na tela daquela agência.
4. **Permissão reaproveitada:** `dashboard.configure` (MASTER). A evolução natural é `branding.configure`, que exige uma linha nova em `permissions` (outra migration).
5. **Logo dentro do JSON do login** (até ~200 KB em base64): aceitável no piloto; para muitos tenants, trocar por URL com cache.
6. **Edição simultânea:** vale o último que salvar.
7. **Identidade real da Gadotti** (logo e paleta do cliente) não foi cadastrada: depende da migration e dos arquivos do cliente.
8. Fora do escopo, como no `BRANDING.md`: editor visual avançado, tema por usuário, CSS livre.

## 8. Confirmações

- Não li `.env`; não acessei produção nem staging; **não rodei migrations, Prisma nem scripts de migration**; não instalei dependências.
- Tenant nunca vem do frontend: o público usa o slug resolvido no servidor, o autenticado usa a sessão, e há teste para o `tenantId` enviado pelo cliente.
- Arquivos novos ou alterados só em `apps/travel-lite`, `services/api-lite` e `docs/travel-lite`. Sem tocar em `services/api` (Full), `infrastructure/` ou `.opencode`.
- **Sem commit, push, PR ou merge.**

## 9. Próximos passos

1. **Decisão:** aprovar a migration `006_tenant_branding.sql` (e quem a aplica).
2. Copiar o SQL para `infrastructure/migrations-travel-lite/006_tenant_branding.sql`, aplicar no fluxo normal e rodar `npx turbo run test --filter=@travel-platform/api-lite --force` (inclui o `branding-db.test.ts`).
3. Commitar o PX2 (autorização explícita) e cadastrar a identidade da Gadotti pelo editor, com o logo e a paleta do cliente.
