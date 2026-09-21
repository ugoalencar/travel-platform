# Travel Platform — Centro de Implantação e Migração de Dados

**Status:** ESPECIFICAÇÃO  
**Data:** 2026-09-20  
**Escopo:** Capacidade permanente de importação/migração de dados  
**Idioma:** Português do Brasil

---

## OBJETIVO

Transformar migração de dados em capacidade oficial da Travel Plataforma.
Cada novo assinante poderá importar dados de sistemas anteriores de forma
segura, auditável e assistida.

---

## ARQUITETURA CONCEITUAL

```
┌─────────────────────────────────────────────────┐
│                AGENCY APP (UI)                   │
│  ┌───────────────────────────────────────────┐  │
│  │         IMPLANTAÇÃO E DADOS               │  │
│  │  ┌─────────┐ ┌──────────┐ ┌──────────┐   │  │
│  │  │ Visão   │ │ Importar │ │ Caixa de │   │  │
│  │  │ Geral   │ │ Dados    │ │ Entrada  │   │  │
│  │  └─────────┘ └──────────┘ └──────────┘   │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐  │  │
│  │  │Mapea-   │ │Histórico │ │Pendências│  │  │
│  │  │mentos   │ │          │ │          │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘  │  │
│  │  ┌──────────────────────────────────────┐ │  │
│  │  │         Conciliação                  │ │  │
│  │  └──────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────┐
│              FASTIFY API                         │
│  ┌───────────────────────────────────────────┐  │
│  │  /import/upload                           │  │
│  │  /import/parse                            │  │
│  │  /import/preview                          │  │
│  │  /import/confirm                          │  │
│  │  /import/history                          │  │
│  │  /import/:id/status                       │  │
│  │  /import/templates                        │  │
│  └───────────────────────────────────────────┘  │
└──────────┬──────────────────────┬───────────────┘
           │                      │
┌──────────▼──────┐    ┌──────────▼──────┐
│  Supabase       │    │  Supabase       │
│  PostgreSQL     │    │  Storage        │
│  (import_jobs)  │    │  (imports/)     │
└─────────────────┘    └─────────────────┘
```

---

## MÓDULOS DA UI (Direction A)

### Tela Principal: Implantação e Dados

```
┌─────────────────────────────────────────────────┐
│  IMPLANTAÇÃO E DADOS                            │
│                                                 │
│  Status de Implantação                          │
│  ┌─────────────────────────────────────────┐    │
│  │ ✅ Clientes         384 importados      │    │
│  │ ✅ Fornecedores      52 importados      │    │
│  │ ⏳ Viagens          Ainda não importado │    │
│  │ ⏳ Financeiro       Pendente de revisão │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  [📥 Importar Dados]                            │
│                                                 │
│  Histórico Recente                              │
│  ┌─────────────────────────────────────────┐    │
│  │ 20/09 14:30  Clientes    384 linhas  ✅ │    │
│  │ 20/09 15:00  Fornecedores 52 linhas  ✅ │    │
│  │ 20/09 15:30  Viagens     120 linhas  ⚠️ │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### Tela: Importar Dados (Wizard)

```
Passo 1: Selecionar Arquivo
  - Arrastar ou selecionar CSV/XLSX
  - Máximo 10MB, 10.000 linhas

Passo 2: Tipo de Dados
  - Clientes
  - Fornecedores
  - Funcionários
  - Desejos
  - Ofertas
  - Propostas
  - Viagens
  - Documentos
  - Financeiro

Passo 3: Mapeamento
  - Coluna do arquivo → Campo Travel Plataforma
  - Detectar campos obrigatórios
  - Permitir ignorar colunas

Passo 4: Dry Run
  - 384 linhas totais
  - 370 válidas
  - 9 warnings
  - 5 errors
  - Preview de 5 linhas

Passo 5: Confirmar e Importar
  - Resumo final
  - [Confirmar Importação]
```

---

## SCHEMA SQL — IMPORT JOBS

```sql
-- Migration 082: Import Jobs
-- Centro de Implantação de Dados

CREATE TYPE import_job_status AS ENUM (
  'UPLOADED',
  'ANALYZING',
  'MAPPING_REQUIRED',
  'READY',
  'PROCESSING',
  'COMPLETED',
  'COMPLETED_WITH_WARNINGS',
  'FAILED',
  'CANCELLED'
);

CREATE TYPE import_job_type AS ENUM (
  'CUSTOMERS',
  'SUPPLIERS',
  'EMPLOYEES',
  'WISHES',
  'OFFERS',
  'PROPOSALS',
  'TRIPS',
  'DOCUMENTS',
  'SALES',
  'RECEIVABLES',
  'PAYABLES',
  'OTHER'
);

CREATE TABLE import_jobs (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  agency_id TEXT NOT NULL REFERENCES agencies(id),
  type import_job_type NOT NULL,
  file_name TEXT NOT NULL,
  file_key TEXT NOT NULL, -- secureFileKey no Supabase Storage
  source_system TEXT, -- ex: "SistemaXPTO"
  status import_job_status NOT NULL DEFAULT 'UPLOADED',
  mapping JSONB, -- mapeamento de colunas
  totals JSONB, -- { rows, valid, warnings, errors }
  warnings JSONB DEFAULT '[]'::jsonb,
  errors JSONB DEFAULT '[]'::jsonb,
  uploaded_by TEXT NOT NULL,
  started_at TIMESTAMPTZ(6),
  completed_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) DEFAULT now(),
  updated_at TIMESTAMPTZ(6) DEFAULT now()
);

-- RLS: tenant isolation
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs FORCE ROW LEVEL SECURITY;

CREATE POLICY import_jobs_tenant_isolation ON import_jobs
  USING (agency_id = current_setting('app.agency_id')::text);

-- Indexes
CREATE INDEX import_jobs_agency_idx ON import_jobs(agency_id);
CREATE INDEX import_jobs_agency_status_idx ON import_jobs(agency_id, status);
CREATE INDEX import_jobs_agency_type_idx ON import_jobs(agency_id, type);

-- Grants
GRANT SELECT, INSERT, UPDATE ON import_jobs TO travel_app_runtime;

-- Audit trigger
CREATE TRIGGER import_jobs_audit_trigger
  BEFORE UPDATE ON import_jobs
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_trigger();
```

---

## SCHEMA SQL — IMPORT MAPPING TEMPLATES

```sql
-- Migration 083: Import Mapping Templates

CREATE TABLE import_mapping_templates (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  agency_id TEXT NOT NULL REFERENCES agencies(id),
  name TEXT NOT NULL, -- ex: "Planilha Sistema XPTO"
  type import_job_type NOT NULL,
  mapping JSONB NOT NULL, -- mapeamento de colunas
  source_system TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ(6) DEFAULT now(),
  updated_at TIMESTAMPTZ(6) DEFAULT now(),

  UNIQUE(agency_id, name)
);

ALTER TABLE import_mapping_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_mapping_templates FORCE ROW LEVEL SECURITY;

CREATE POLICY import_mapping_templates_tenant_isolation ON import_mapping_templates
  USING (agency_id = current_setting('app.agency_id')::text);

GRANT SELECT, INSERT, UPDATE, DELETE ON import_mapping_templates TO travel_app_runtime;
```

---

## SCHEMA SQL — EXTERNAL ID (Rastreamento de Migração)

```sql
-- Migration 084: External ID para rastreamento de migração
-- Adiciona colunas source_system e external_id em tabelas de domínio

ALTER TABLE customers ADD COLUMN source_system TEXT;
ALTER TABLE customers ADD COLUMN external_id TEXT;

ALTER TABLE suppliers ADD COLUMN source_system TEXT;
ALTER TABLE suppliers ADD COLUMN external_id TEXT;

-- Índices para deduplicação
CREATE UNIQUE INDEX customers_agency_source_external_idx
  ON customers(agency_id, source_system, external_id)
  WHERE source_system IS NOT NULL AND external_id IS NOT NULL;

CREATE UNIQUE INDEX suppliers_agency_source_external_idx
  ON suppliers(agency_id, source_system, external_id)
  WHERE source_system IS NOT NULL AND external_id IS NOT NULL;
```

---

## FLUXO DE IMPORTAÇÃO — DETALHAMENTO

### 1. Upload

```
POST /import/upload
Content-Type: multipart/form-data

- Validar MIME type (text/csv, application/vnd.ms-excel, etc.)
- Validar tamanho (≤ 10MB)
- Validar extensão (.csv, .xlsx)
- Salvar arquivo original em Supabase Storage (bucket: imports)
- Criar import_job com status UPLOADED
- Retornar job_id + preview das primeiras 5 linhas
```

### 2. Parse

```
POST /import/parse
Body: { jobId }

- Ler arquivo do Storage
- Parsear CSV (papaparse) ou XLSX (xlsx)
- Detectar encoding (UTF-8, ISO-8859-1, etc.)
- Detectar delimitador (CSV)
- Retornar colunas detectadas + sample data
- Status → ANALYZING
```

### 3. Map

```
POST /import/map
Body: { jobId, mapping: { "Nome Cliente": "name", "Celular": "phone", ... } }

- Validar que campos obrigatórios estão mapeados
- Validar tipos de dados
- Salvar mapping no import_job
- Status → MAPPING_REQUIRED → READY
```

### 4. Dry Run

```
POST /import/dry-run
Body: { jobId }

- Processar todas as linhas SEM gravar
- Para cada linha:
  - Aplicar normalização (trim, lowercase, formatação)
  - Validar campos obrigatórios
  - Verificar duplicidades (email, cpf, external_id)
  - Classificar: NEW / POSSIBLE_DUPLICATE / MATCHED / INVALID
- Retornar:
  - total: 384
  - valid: 370
  - warnings: 9
  - errors: 5
  - samples: [...]
- Status → READY
```

### 5. Preview

```
POST /import/preview
Body: { jobId }

- Retornar primeiras 20 linhas processadas
- Mostrar classificação de cada linha
- Mostrar warnings e errors detalhados
```

### 6. Confirm

```
POST /import/confirm
Body: { jobId }

- Status → PROCESSING
- Processar linhas válidas:
  - Usar services/repositories existentes
  - Criar Customer via customers service
  - Criar Supplier via suppliers service
  - Preservar tenant isolation
  - Registrar external_id para deduplicação
- Atualizar totais
- Status → COMPLETED ou COMPLETED_WITH_WARNINGS
- Gerar audit log
```

### 7. History

```
GET /import/history
Query: ?page=1&limit=20

- Listar import_jobs do tenant
- Filtro por status, tipo, data
```

---

## SEGURANÇA

### Regras

1. ImportJob é tenant-scoped (agency_id obrigatório)
2. Tenant A não vê jobs de B (RLS)
3. Tenant A não baixa arquivo de B (storage policy)
4. Support não acessa tenant sem autorização
5. Upload não executa conteúdo (não há eval de fórmulas)
6. CSV/XLSX não podem injetar SQL (parametrized queries)
7. Fórmulas de planilha são tratadas como texto

### CSV Export / Formula Injection

Se houver exportação CSV, proteger contra formula injection:
- Tratar células iniciadas por: `=`, `+`, `-`, `@`
- Prefixar com `'` quando necessário

---

## DUPLICIDADE

### Estratégia

| Sinal | Prioridade | Ação |
|---|---|---|
| external_id + source_system | ALTA | Match exato |
| cpf (quando aplicável) | ALTA | Match exato |
| email | MÉDIA | POSSIBLE_DUPLICATE |
| telefone | BAIXA | Só como hint |

### Classificação

- `NEW` — nenhum match encontrado
- `POSSIBLE_DUPLICATE` — match por email ou telefone
- `MATCHED` — match por external_id ou cpf
- `INVALID` — dados obrigatórios faltando ou inválidos

---

## ASSISTED IMPLANTAÇÃO

### Fluxo A: Agência importa próprios dados

- Usuário da agência faz upload
- Mesmo fluxo acima
- Historial visível na UI

### Fluxo B: Equipe Travel executa implantação

- Usuário Platform Admin ou Support acessa
- Seleciona tenant de destino
- Executa mesma pipeline
- Registro: "implantação assistida"
- Tenant vê no histórico: "Implantado pela equipe Travel Platform"

### Autorização

- Somente roles: PLATFORM_ADMIN, SUPPORT_ADMIN
- Ação registrada em platform_audit_logs
- Nenhum acesso global permanente

---

## NOTIFICAÇÃO

Ao finalizar importação assistida:

```
Assunto: Importação de clientes concluída

Olá,

A importação de clientes foi concluída com sucesso.

Criados: 384
Atualizados: 21
Pendentes: 7

Acesse o Centro de Implantação para detalhes.
```

Usar infraestrutura Resend existente.

---

## CONCILIAÇÃO (FUTURO)

### Distinção

- **IMPORTAÇÃO** = trazer histórico/dados de outro sistema
- **CONCILIAÇÃO** = conferir arquivo recorrente com dados existentes

### Fluxo Conceitual

```
Arquivo → Parse → Transactions → Deterministic Matching → Sugestões → Revisão Humana → Confirmação
```

### Sinais de Match

- amount (valor)
- date (data)
- reference (referência)
- customer (cliente)
- document (documento)

### Confidence Levels

- EXACT — match por external_id + amount + date
- HIGH — match por customer + amount + date
- MEDIUM — match por amount + date ± tolerância
- UNMATCHED — nenhum match

### Regras

- Somente regras determinísticas documentadas
- Nenhum LLM nesta fase
- Nunca match silencioso ambíguo
- Nunca alterar financeiro automaticamente sem confirmação

---

## LIMITES PARA PILOTO

| Limite | Valor |
|---|---|
| Tamanho arquivo | 10 MB |
| Linhas por arquivo | 10.000 |
| Jobs simultâneos | 3 |
| Formatos | CSV, XLSX |
| Templates salvos | 10 por tenant |

---

## TEMPLATES

### Template CSV Clientes

```csv
nome,email,telefone,whatsapp,cpf,passport,rg,data_nascimento,nacionalidade,notas
"Maria Silva","maria@email.com","+5511999998888","","12345678901","","","","Brasileira","Cliente fiel"
```

### Template XLSX Clientes

Gerar baseado no schema real de customers:
- name (obrigatório)
- email
- phone
- whatsapp
- cpf
- passport
- rg
- birth_date (formato: YYYY-MM-DD)
- nationality
- notes

**Somente gerar templates depois de auditar quais campos realmente são necessários para o piloto.**
