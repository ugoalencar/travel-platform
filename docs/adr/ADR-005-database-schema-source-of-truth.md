# ADR-005: Fonte de verdade do schema — SQL migrations vs. Prisma schema

## Status

**Aceito**

Decisão humana registrada: Opção A aprovada como direção oficial do
projeto.

```
infrastructure/migrations/*.sql = authoritative
schema.prisma                    = derived representation
```

`infrastructure/migrations/*.sql` é a fonte de verdade do schema físico e
das garantias de banco: tabelas, colunas, tipos, constraints, FKs
compostas tenant-safe, `CHECK` constraints, índices, índices parciais,
grants, RLS e demais invariantes PostgreSQL. `schema.prisma` é uma
representação derivada do banco real, sincronizada por introspecção
controlada (`prisma db pull`), nunca editada à mão para divergir das
migrations. Não deve existir evolução independente do `schema.prisma` que
contradiga o SQL. `prisma generate` continua permitido normalmente — gera
só o cliente TypeScript, não toca no banco nem no schema versionado.

O achado da auditoria original de 18/08, que apontava ausência de FKs
compostas tenant-safe no Prisma, foi **refutado** pela revisão linha a
linha feita nesta análise (ver "Comparação Detalhada" abaixo) e não deve
permanecer registrado como dívida conhecida em nenhum outro documento.

## Contexto

O repositório mantém dois artefatos que descrevem o mesmo schema de banco:

- `infrastructure/migrations/001_initial_schema.sql` e
  `002_rls_policies.sql` — SQL escrito à mão, aplicado via `psql`.
- `packages/database/schema.prisma` — schema Prisma, hoje **não conectado
  a nenhum pipeline**: `packages/database/package.json` não tem scripts de
  `build`/`test`/`lint`/`generate`; não aparece em nenhum passo do
  `.github/workflows/ci.yml`; nenhum código em `packages/domain` importa
  `@prisma/client`. O Prisma existe hoje só como arquivo, sem cliente
  gerado, sem nenhum consumidor.

Isso significa que ainda não há nenhum código de produção dependendo do
cliente Prisma — o momento de decidir é agora, antes que essa dependência
exista, quando o custo de qualquer direção é mínimo.

## Comparação Detalhada

Comparei os dois arquivos linha a linha. Resultado:

| Elemento | SQL migrations | Prisma schema |
|---|---|---|
| 11 tabelas, colunas, tipos | Completo | Completo, equivalente |
| FKs compostas tenant-safe (`agency_id, x_id`) | Completo (11 FKs compostas) | **Completo** — `@relation(fields: [agencyId, xId], references: [agencyId, id])` em todos os modelos filhos |
| `@@unique([agencyId, id])` para suportar as FKs compostas | Completo (`*_agency_id_key`) | Completo, exceto `commissions` (ver Risco 1) |
| Row-Level Security (`ENABLE`/`FORCE RLS`, `CREATE POLICY`) | 44 políticas, completo | **Inexistente** — RLS não é expressável na linguagem de schema do Prisma |
| Funções de contexto (`current_agency_id()`, `set_tenant_context()`, etc.) | Completo | **Inexistente** — funções PL/pgSQL não são expressáveis no Prisma schema |
| `CHECK` constraints (11 no total: preço não-negativo, range de datas, etc.) | Completo | **Inexistente** — Prisma não tem atributo nativo de `CHECK` constraint na versão em uso |
| Índices únicos parciais (`WHERE cpf IS NOT NULL AND deleted_at IS NULL`) | Completo (2 índices) | **Inexistente** — Prisma não suporta condição `WHERE` em `@@unique`/`@@index` |
| Grants/roles de runtime (`travel_app_runtime_local`, sem `BYPASSRLS`) | Completo, testado | **Inexistente** — fora do escopo de schema, não é gerenciável por Prisma de qualquer forma |
| Geração de tipos TypeScript | Não | Sim — essa é a única capacidade que só o Prisma oferece |

**Achado corrigido em relação à auditoria original:** minha auditoria de
18/08 havia apontado que o Prisma "usa relações simples por id" sem FKs
compostas. Ao reler o `schema.prisma` atual linha a linha para este ARC-01,
isso está **incorreto para o estado atual do arquivo** — o Prisma já usa
`@relation(fields: [agencyId, xId], references: [agencyId, id])`
consistentemente. O schema Prisma foi mantido em bom nível de paridade
estrutural com o SQL nesse aspecto específico. A divergência real e
que importa para esta decisão está em RLS, `CHECK` constraints e índices
parciais — recursos que o Prisma schema **não consegue expressar em
nenhuma versão atual**, não em um lapso de manutenção corrigível.

## Opções Consideradas

### Opção A — SQL como fonte de verdade; Prisma gerado por introspecção

O SQL em `infrastructure/migrations/` continua sendo escrito e revisado à
mão, como já acontece. Prisma é usado só como gerador de cliente
tipado: `prisma db pull` (introspecção) regenera `schema.prisma`
automaticamente a partir do banco real, nunca o contrário.

**Prós:** RLS, `CHECK`, índices parciais e grants continuam expressos
onde já funcionam. Sem risco de o Prisma "esquecer" de aplicar uma
proteção de segurança porque sua linguagem de schema não a representa.
Consistente com `docs/04-database/conventions.md`, que já proíbe
`prisma migrate`/`db push`/`generate` sem autorização.

**Contras:** o time perde o fluxo padrão do Prisma
(`prisma migrate dev`) para evolução rápida de schema. `schema.prisma`
vira um artefato derivado, não editado à mão — precisa de disciplina para
não ser editado manualmente por engano.

### Opção B — Prisma como fonte de verdade; RLS/CHECK/índices parciais via `migrations.d/` complementar

O `schema.prisma` seria escrito à mão e `prisma migrate dev` geraria as
migrations base. Um segundo conjunto de arquivos SQL "de reforço"
(RLS, `CHECK`, índices parciais, grants) rodaria depois, via
`prisma migrate diff`+hook ou script customizado.

**Prós:** fluxo Prisma nativo para 90% do schema (colunas, tabelas,
relações, enums).

**Contras:** dois pipelines de migration coexistindo é uma fonte clássica
de drift e de erro humano (esquecer de rodar o segundo). RLS é o
mecanismo de segurança mais crítico do projeto — colocá-lo num pipeline
secundário, não-oficial, é o oposto do que a auditoria de segurança já
recomendou (ARCH-02, SEC-05).

### Opção C — Duas fontes mantidas manualmente em paralelo (status quo)

Continuar como está: dois arquivos editados independentemente, sem
verificação de consistência.

**Contras:** já é a causa raiz do achado ARCH-01 original — divergência
silenciosa, sem CI que a detecte. Não é uma opção real, é a ausência de
decisão.

### Opção D — Abandonar Prisma, usar só SQL + query builder leve

Remover `packages/database/schema.prisma` e `@prisma/client` do projeto,
usar um query builder fino (ex.: `pg` com helpers tipados manualmente, ou
Kysely) sobre o SQL.

**Prós:** elimina a fonte de divergência por completo — só existe SQL.

**Contras:** `AGENTS.md` já declara Prisma como ORM oficial do projeto
("Baseline: ORM: Prisma"); mudar isso é uma decisão de stack maior que
ARCH-01, fora do escopo desta tarefa, e perde a geração de tipos
TypeScript que é a única vantagem real do Prisma aqui.

## Recomendação

**Opção A: SQL como fonte de verdade; Prisma gerado por introspecção.**

Razão decisiva: a maior parte do valor de segurança deste projeto — RLS,
`CHECK` constraints, índices únicos parciais, controle de grants — **não
é representável na linguagem de schema do Prisma em nenhuma versão
atual**. Não é uma limitação de disciplina de manutenção, é uma limitação
estrutural da ferramenta. Forçar o Prisma a ser fonte de verdade
significaria mover a parte mais crítica da segurança do projeto para um
pipeline secundário e informal (Opção B) ou abrir mão dela (impossível).
Manter o SQL como fonte de verdade e usar o Prisma só para o que ele faz
bem — gerar tipos TypeScript a partir de um schema real — evita esse
problema por construção.

Esta recomendação também é a que exige **menos mudança**: já é,
implicitamente, o que `docs/04-database/conventions.md` descreve hoje.
ARCH-01 formaliza uma direção que o projeto já estava seguindo de fato,
sem ADR que a registrasse.

## Trade-offs

| | Opção A (recomendada) | Opção B |
|---|---|---|
| Segurança (RLS/CHECK) | Alta — sempre no pipeline principal | Média — depende de disciplina para rodar o segundo pipeline |
| Velocidade de iteração de schema simples | Média — SQL manual para toda mudança | Alta — `prisma migrate dev` para 90% dos casos |
| Risco de drift | Baixo, com gate de CI (ver Drift Detection) | Alto — dois pipelines |
| Familiaridade para devs vindos de outros projetos Prisma | Baixa | Alta |
| Esforço de configurar agora | Baixo | Médio-alto |

## Impacto em Prisma

- `schema.prisma` deixa de ser editado à mão. Fluxo passa a ser: alterar
  SQL em `infrastructure/migrations/` → aplicar no banco de
  desenvolvimento local → `prisma db pull` → revisar o diff gerado →
  commitar.
- `prisma generate` continua sendo o único comando Prisma "de escrita"
  permitido sem autorização especial (gera só o cliente TS, não toca no
  banco) — isso já é consistente com `AGENTS.md`, que já proíbe
  `prisma migrate`/`db push`/`generate` sem autorização; a única mudança
  é que `db pull` passa a ser o comando esperado para sincronizar o
  arquivo, não `migrate dev`.
- Perde-se a capacidade de usar `prisma migrate dev` para prototipagem
  rápida de schema. Aceitável dado que o schema já está estável (V1
  definido, 11 tabelas).

## Impacto em Migrations

- Nenhuma mudança na forma como `infrastructure/migrations/*.sql` já é
  escrita e revisada — este ADR formaliza a prática atual, não a altera.
- `scripts/validate-migrations.cjs` continua validando só nomenclatura de
  arquivo; poderia futuramente crescer para também rodar a checagem de
  drift descrita abaixo (fora do escopo desta proposta).

## Impacto em CI

- Nenhuma mudança obrigatória imediata. Uma melhoria futura (não parte
  desta decisão, precisa de tarefa própria) seria adicionar um passo que
  rode `prisma db pull` contra o banco de teste já usado por `test:db` e
  falhe se `schema.prisma` versionado divergir do gerado — students
  exatamente o "drift check" da seção seguinte.
- CI não precisa passar a rodar `prisma migrate` em nenhum momento.

## Impacto em Developer Experience

- Positivo: um único lugar (`infrastructure/migrations/`) para entender
  o schema real, incluindo segurança — sem precisar cruzar dois arquivos
  para saber se uma coluna tem `CHECK` ou índice parcial.
- Negativo: quem está acostumado ao fluxo Prisma-first (`prisma migrate
  dev`, ver o schema mudar e a migration aparecer sozinha) precisa se
  adaptar a escrever SQL diretamente. Mitigável com um guia curto em
  `docs/04-database/` (não incluído nesta proposta, seria parte da
  implementação).

## Estratégia de Drift Detection

Recomendação para uma tarefa de implementação futura (não parte desta
proposta):

1. Job de CI que sobe o banco descartável já usado por `test:db`, aplica
   `001_initial_schema.sql` + `002_rls_policies.sql`, roda
   `prisma db pull --print` (ou equivalente) e compara a saída contra o
   `schema.prisma` versionado.
2. Divergência → falha o CI com um diff legível, apontando exatamente
   qual modelo/campo saiu de sincronia.
3. Esse job roda como parte do mesmo `Quality Gates` já existente, não
   como gate novo e paralelo — evita repetir o problema do DEP-01
   (gate declarado mas não amarrado ao pipeline real).

## Plano de Transição

Caso a Opção A seja aceita, a sequência de implementação (tarefa
separada, com autorização própria) seria:

1. Rodar `prisma db pull` contra um banco local com `001`+`002`
   aplicados; revisar o diff resultante manualmente.
2. Substituir o `schema.prisma` atual pelo gerado, preservando comentários
   úteis que a introspecção não recria (ex.: o aviso sobre índices
   parciais já presente no arquivo atual).
3. Adicionar o passo de drift detection ao CI (ver seção acima).
4. Atualizar `docs/04-database/conventions.md` para declarar
   explicitamente "SQL é fonte de verdade; Prisma é gerado por
   introspecção", com link para este ADR.
5. Mudar o Status deste ADR para "Aceito".

Nenhum desses passos foi executado como parte desta análise.

## Riscos

1. **`commissions` não tem `@@unique([agencyId, id])` no Prisma nem
   `UNIQUE (agency_id, id)` no SQL** — inconsistente com as outras 8
   tabelas tenant-scoped que têm FKs compostas apontando para elas. Hoje
   inofensivo (nada referencia `commissions` via FK composta), mas é
   uma lacuna que a introspecção vai expor no primeiro `db pull` — vale
   corrigir no SQL antes ou durante a transição, como parte da tarefa de
   implementação, não desta proposta.
2. **`prisma db pull` não recria comentários nem a formatação atual do
   arquivo** — o diff inicial vai parecer maior do que a mudança real;
   revisão manual cuidadosa é necessária no primeiro pull.
3. **Sem o drift check de CI implementado, a decisão sozinha não evita
   uma nova divergência** — a Opção A resolve "qual arquivo manda", não
   "como garantir que o outro nunca fique desatualizado". O drift check
   é parte necessária da implementação, não opcional.
4. **Prisma pode, em versões futuras, ganhar suporte nativo a `CHECK`
   e índices parciais** — se isso acontecer, vale reabrir esta decisão
   (já registrado como gatilho de revisão abaixo).

## Decisões Humanas Registradas

1. **Decidido:** Opção A aceita como direção oficial (SQL fonte de
   verdade, Prisma via introspecção).
2. **Decidido:** o drift-check entra no job `Quality Gates` já existente,
   não como job novo e paralelo.
3. **Decidido:** implementação controlada autorizada na branch
   `architecture/arch-01-schema-source-of-truth`, sem merge/push para
   `main` até revisão humana adicional.

## Decisões Humanas Ainda Pendentes

1. Aprovar o diagnóstico do achado `commissions` (ver seção própria) e a
   mudança mínima proposta antes de ela ser aplicada.
2. Aprovar o diff entre o `schema.prisma` atual e a representação
   introspectada antes de ele ser materializado no arquivo versionado.
3. Aprovar o desenho do drift-check antes de ele ser implementado no
   workflow de CI.
4. Autorizar merge desta branch para `main`, quando todo o acima estiver
   concluído e revisado.

## Gatilhos de Revisão

- Prisma passa a suportar `CHECK` constraints e índices parciais
  nativamente no schema DSL.
- O projeto decide trocar de ORM.
- Alguém começa a depender do `@prisma/client` gerado antes desta decisão
  ser formalizada — nesse caso, revisar com urgência antes de a dívida
  crescer.

## Related Documentation

- [AGENTS.md](../../AGENTS.md)
- [docs/04-database/conventions.md](../04-database/conventions.md)
- [docs/03-security/tenant-isolation.md](../03-security/tenant-isolation.md)
- [ADR-002 — Multitenancy](ADR-002-multitenancy.md)
- [infrastructure/migrations/001_initial_schema.sql](../../infrastructure/migrations/001_initial_schema.sql)
- [infrastructure/migrations/002_rls_policies.sql](../../infrastructure/migrations/002_rls_policies.sql)
- [packages/database/schema.prisma](../../packages/database/schema.prisma)
