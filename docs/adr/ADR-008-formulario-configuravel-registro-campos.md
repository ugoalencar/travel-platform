# ADR-008: Formulário configurável e registro de campos (cliente e venda por categoria)

## Status

**Aceito pelo usuário em 2026-10-23**, como rascunhado. Antes de implementar: a
Fase 0 de comissões precisa estar integrada e validada, a decisão de permissões
(Q4) ainda depende do desenho de SEC-01, e nenhuma migration é aplicada em banco
real sem autorização específica.

## Metadados

- **Origem:** `.claude/ESPECIFICACAO-AJUSTES-GADOTTI-2026-10-23.md`, §2.3, §3.2
  (Frente 2), §4 (campos por modalidade), §5 (Frente 3), §12 (Frente 10) e §13
  (Onda 0, item c).
- **Decisões de referência:** F1 (catálogo de categorias no Full), F2 (pendente,
  não afeta este ADR), SEC-01 (nomes de permissão). Nenhuma decisão
  Gadotti D1–D7 é diretamente usada aqui.
- **Relacionados:** ADR-006 (linhas de venda e pagamento), ADR-007 (passageiros e
  `passenger_count`), DEC-007, ADR-005.
- **Revisão Codex:** não ocorreu.

## Contexto

### Cadastro de cliente

- **Lite:** nome obrigatório; CPF validado e único por tenant; demais campos
  opcionais (`001_initial_schema.sql:66-91`, `routes/customers.ts:174-241`).
- **Full:** campos muito mais numerosos (passaporte, RG, nacionalidade, estado
  civil, profissão, contato de emergência). Só `name` é obrigatório. A lista de
  campos opcionais é fechada: `CUSTOMER_OPTIONAL_STRING_FIELDS`
  (`packages/domain/types.ts:64-98`, `routes/customers.ts:162-196`).
- **Nenhum dos dois** tem configuração de habilitar, desabilitar ou tornar
  obrigatório (spec §3.2, verificado por busca de `required_fields` e
  `customerFields` sem resultado).

### Venda e categoria

- **Lite:** categoria de venda = nome, ativo, ordem, sem campos
  (`001_initial_schema.sql:129-139`). A venda tem um vendedor, uma categoria,
  uma forma de pagamento e um valor. Não há itens nem produto
  (`sales.ts:35-37`, spec §5).
- **Full:** `TravelProduct.category` é enum fixo de 19 valores
  (`types.ts:1089-1150`). Categorias de comissão só existirão com F1
  (`commission_categories`). A venda (`Sale`) não referencia produto, categoria
  nem forma de pagamento (`types.ts:303-318`).
- **Campos legais e de mercado** (spec §4): a maioria é **por passageiro**
  (identidade, documento, menor de idade). Origem, destino, embarque, quantidade de
  passageiros e data da venda são campos de **negócio** pedidos pela Gadotti. Os
  dados de hotel (FNRH) são obrigação do estabelecimento, não da agência.

### Requisito

A agência monta o formulário de venda de cada categoria, marcando campos além do
padrão. Ela não quer hardcode para a Gadotti nem para nenhuma outra agência. Os
campos precisam funcionar como subconjunto Full → Lite (DEC-007).

## Decisão proposta

### 1. Registro de campos versionado em código

- Cada campo tem um `field_key` estável e os atributos:
  - `scope`: `customer`, `sale` ou `sale_passenger`;
  - `type`: `text`, `date`, `integer`, `money`, `enum`, `passenger_list` ou
    `price_components`;
  - `validator`;
  - `available_in`: `['FULL', 'LITE']` ou `['FULL']`;
  - `locked`: campo não configurável (ver item 3);
  - `classification`: `LEGAL`, `MARKET` ou `SUGGESTION`. É metadado de
    documentação, **não** altera comportamento;
  - `label_key` para tradução.
- O registro fica em código, não em banco. Motivo: validadores e tipos são
  revisados e testados; a configuração da agência fica no banco e referencia o
  campo por chave. Assim a migração entre bancos não exige DDL (spec §2.3).
- **Teste de paridade:** o conjunto de campos disponíveis no Lite é subconjunto do
  conjunto do Full. Qualquer campo com `available_in` contendo `'LITE'` precisa
  existir também no Full.

### 2. Configuração por escopo, em tabelas

```text
customer_field_settings(
  scope_id, field_key TEXT, enabled BOOL, required BOOL,
  updated_by, updated_at, legacy_ref,
  UNIQUE (scope_id, field_key),
  CHECK (NOT required OR enabled))

sale_category_fields(
  category_id, field_key TEXT, enabled BOOL, required BOOL,
  sort_order, group, ...)
```

- `scope_id` é a agência (Full) ou o tenant (Lite). Não se assume que
  `tenant_id ≡ agency_id` (spec §2.3); a identidade é por FK composta.
- Alterações de configuração não são append-only, mas **cada mudança gera evento
  de auditoria** com antes e depois.

### 3. Efeitos no servidor (autoridade; a UI só reflete)

- **Criação:** todos os campos `required` e habilitados são validados. Campo
  **desabilitado** enviado na escrita → **422** `field_disabled`. Nunca é ignorado
  em silêncio.
- **Edição (PATCH):** valida **apenas os campos presentes**. Mudar a
  obrigatoriedade não invalida clientes antigos. Pergunta A1 (Q1).
- **Campos travados** (não configuráveis): `name`; identificador interno; `status`;
  carteira ou responsável (Lite: escopo de acesso); qualquer campo exigido por
  unicidade. Tentar desabilitar um campo travado → 400.
- **Desabilitar não apaga dado.** Os valores existentes permanecem. `GET
  /customers/:id` continua devolvendo o que existe, para quem tem permissão.
- **Leitura de formulário:** `GET /customers/field-settings` devolve a configuração
  para a UI. Campos desabilitados saem do formulário, não dos dados.
- **Importação:** aplica as mesmas regras e devolve relatório de linhas rejeitadas
  (proposta, A2). **Migração Lite → Full** não rejeita registro histórico; preserva
  o dado e sinaliza pendências.
- **Venda:** a escolha de categoria devolve apenas as opções configuradas. O
  servidor valida campos obrigatórios da categoria. Campo desabilitado → 422.

### 4. Categoria de venda configurável

- Full: a mesma entidade de `commission_categories` (F1). Lite: `sale_categories`.
  Contrato comum: `{ id, name, active, sort_order, legacy_ref }`.
- O enum `TravelProductCategory` do Full permanece como **tipo de produto**
  (legado), não como categoria de venda.
- Não criar um segundo catálogo de categorias no Full.

### 5. Campos de primeira classe, não JSON

Colunas próprias na venda, todas opcionais por categoria:

- `sale_date` (Lite já tem, `001:168`; Full precisa de coluna equivalente);
- `travel_start_date` e `travel_end_date`;
- `origin_text` e `destination_text` (texto livre com sugestão; normalização por
  IATA ou IBGE fica fora do escopo, A4);
- `passenger_count`.

Demais dados da modalidade ficam em `sales.modality_data JSONB`, indexados por
`field_key`. Passageiros ficam em tabela filha `sale_passengers` (dados pessoais
e documentos sensíveis, com mascaramento e leitura restrita pelo
`document-masking.ts` existente).

### 6. Snapshot da venda

- `sales.form_snapshot JSONB`: versão do perfil, rótulos, obrigatoriedades
  aplicadas no momento da venda.
- Mudar o perfil da categoria **não altera vendas existentes**. Desativar um campo
  não apaga o valor.

### 7. Presets opcionais

- Presets ("Aéreo", "Excursão rodoviária", "Cruzeiro", "Hospedagem", "Pacote") são
  **opcionais**. O administrador pode aplicá-los e editá-los. Não são padrão
  imposto.
- Nenhum preset carrega valores da Gadotti. Nenhuma aba, preset ou texto cita a
  Gadotti. Os exemplos do registro viram fixtures de teste.

### 8. Proteção contra atribuição em massa

- O endpoint de venda aceita apenas valores de campo. Campos de regra (`rate`,
  `base`, `deadline`, `commission`) enviados pelo cliente → **422** (spec §12).

### 9. Permissões e auditoria

- Propostas: `customers.fields_manage` (cadastro de cliente) e `catalog.manage`
  (categorias, formulário e produtos).
- No Lite, o catálogo `access.ts` recebe as novas permissões, com migration e teste
  espelho conforme `docs/travel-lite/ACCESS-CONTROL.md`. Hoje o Lite usa
  `settings.manage` para cadastros (`categories.ts:39`). Reaproveitar ou criar nova
  é a pergunta Q4.
- Eventos: `CUSTOMER_FIELD_SETTINGS_UPDATED`, `SALE_CATEGORY_FORM_UPDATED`,
  `CATALOG_PRODUCT_CREATED`, `CATALOG_PRODUCT_UPDATED`.

## Alternativas consideradas

1. **Colunas fixas por produto, sem configuração.** Rejeitada: não atende ao
   requisito de configuração por agência.
2. **Tudo em JSONB, sem registro.** Rejeitada: sem tipagem, sem validação e sem
   relatório. Gera deriva entre produtos.
3. **Registro editável no banco pela agência.** Rejeitada para o registro:
   validadores são código. A configuração continua no banco. Custo aceito: incluir
   campo novo exige deploy.
4. **EAV (uma linha por campo e por valor) na venda.** Rejeitada: relatórios e
   filtros por origem e destino ficam complexos. Campos de relatório viram colunas.
5. **Somente presets.** Rejeitada: impõe um padrão e contraria o requisito de
   configuração sem hardcode.

## Consequências

**Positivas**

- Uma única fonte de validação e de rótulos por campo, com paridade Full → Lite
  testada.
- Venda com campos de relatório em colunas, prontos para filtros de origem,
  destino e data.
- Mudança de perfil não reescreve histórico.

**Negativas**

- Mais tabelas, mais testes e formulários dinâmicos na UI.
- Campos novos exigem código e deploy, não são criados pela agência.
- Dados pessoais de passageiros exigem mascaramento e controle de leitura.

**Testes previstos** (propostos, ainda não existem)

- `customer-field-settings.test.ts` (Full e Lite): matriz habilitado × obrigatório
  × travado; PATCH parcial; auditoria com rollback; isolamento; teste de registro
  Lite ⊆ Full.
- `sale-category-forms.test.ts`: validação por perfil; snapshot imutável; campo
  desabilitado → 422.
- `catalog-products.test.ts`: produto inativo não selecionável; fornecedor de outro
  tenant → 404 ou 422.
- Teste de mass-assignment de regra na venda (item 8).
- UI: `CustomerFieldsTab.test.tsx`, `SaleForm.test.tsx` (campos dinâmicos).

Casos de referência (propostos):

1. Categoria "Aéreo" com `origin_text` e `destination_text` obrigatórios; venda
   sem eles → 422.
2. Categoria deixa de exigir `destination_text`; venda antiga mantém a exigência
   do `form_snapshot`.
3. Cliente com `phone` obrigatório; POST sem `phone` → 422 `required`.
4. Cliente antigo sem `phone`; PATCH só com `notes` → 200 (A1).
5. Tentar desabilitar `name` → 400 (travado).
6. Usuário sem `customers.fields_manage` → 403. Outro tenant não vê nem altera.

## Impacto no Lite e DEC-007 (Full primeiro)

- O Lite é subconjunto de campos. Pode omitir campos que só o Full tem (passaporte,
  RG, nacionalidade etc.), conforme DEC-007 §3. Não pode expor campo que o Full não
  tenha. O teste de registro Lite ⊆ Full impede isso.
- **Lacuna de paridade a fechar no Full primeiro (DEC-007 §4):** `sale_date` existe
  no Lite (`001:168`) e não tem coluna equivalente na venda do Full. Pelo princípio,
  o Full recebe antes.
- **Categoria:** o Full precisa do catálogo configurável (F1) antes de a categoria do
  Lite ganhar campos. A ordem é Full → Lite.
- **Itens de venda e produto** no Lite (ADR-006 e ADR-007 dependem deles) só entram
  depois que o formulário do Full estiver validado.
- A decisão de arquitetura continua exigindo ADR. Este documento não cria serviço
  novo nem fusão de bancos.

## Dependências e decisões humanas pendentes

| Item | Tipo | Efeito neste ADR | Estado |
| --- | --- | --- | --- |
| **F1** (catálogo de categorias) | Decisão tomada, implementação pendente | Pré-requisito da categoria configurável. | Aceita; sem implementação. |
| **SEC-01** (nomes de permissão) | Dependência | Nome final de `customers.fields_manage` e `catalog.manage`. | Pendente |
| **F2** (fonte de "exige recebimento") | Decisão **pendente** | **Não afeta este ADR.** Forma de pagamento não está no registro de campos de venda. | Continua pendente, sem efeito aqui |
| **Q1** (A1) Validação em PATCH | Pergunta | Valida só campos tocados ou o registro inteiro? Proposta: só campos tocados. | Aberta |
| **Q2** (A2) Importação e migração | Pergunta | Proposta: importação aplica regras; migração preserva histórico. | Aberta |
| **Q3** (A3) Conflito de CPF | Pergunta de privacidade | 409 revela existência de cliente de outra carteira. Proposta: mensagem genérica, revisar com SEC-01. | Aberta |
| **Q4** Permissão do Lite | Pergunta técnica | Reaproveitar `settings.manage` ou criar `customers.fields_manage` e `catalog.manage`? | Aberta |
| **Q5** CPF no Lite | Pergunta | CPF é único por tenant. Ele pode ser desabilitado? Proposta: não, é travado por unicidade. | Aberta |
| **Q6** (A4) Origem e destino | Pergunta | Texto livre com sugestão (proposta) ou lista normalizada? | Aberta |
| **Q7** Classificação LEGAL × MARKET | Pergunta de produto | A classificação é só metadado. Quem valida a exigência legal? Parecer jurídico (spec §4.3 e §15). | Aberta |

**Não decidido por este ADR:** lista exata de campos por modalidade, presets e
obrigatoriedades reais. Isso é configuração da agência, e a lista de campos legais
depende de confirmar fontes listadas como não verificadas na spec §15.

## Riscos

- **Bloqueio operacional no balcão.** Campo obrigatório mal configurado impede
  venda. Mitigação: a UI mostra prévia de obrigatórios, e a alteração gera
  auditoria e pode ser revertida.
- **Deriva entre registro Full e Lite.** Mitigação: teste de paridade do registro,
  rodado no gate.
- **Exposição de dados pessoais** de passageiros e de documentos. Mitigação:
  mascaramento, leitura restrita e não exposição no endpoint de lookup
  (lookup de cliente da Frente 1, spec §3.1).
- **Crescimento do snapshot** de formulário em vendas com muitos passageiros.
  Mitigação: snapshot contém só o perfil aplicado, não os dados do passageiro.
- **Mistura entre configuração e regra.** A venda aceitar campo de regra
  (mass-assignment). Mitigação: item 8, com teste.
- **Relatórios e filtros** dependem de colunas de primeira classe. Campos apenas em
  JSON não entram em relatório até virarem coluna.

## Verificação deste rascunho

- Nada foi executado: nenhum código, migration, teste, banco, deploy ou acesso
  online.
- Fatos de código vêm da spec §3.2, §4, §5 e §12. Foram conferidos por leitura
  pontual das referências citadas na spec. Não reverificados nesta sessão.
- Nenhum dado real da Gadotti foi usado.

## Aprovação

- **Status atual:** Aceito (2026-10-23).
- **Aprovação humana:** pendente.
- **Data da aprovação:** pendente.
- **Aprovado por:** pendente.
