# Especificação técnica e de produto — Ajustes Gadotti (23/10/2026)

Data: 2026-10-23 (elaborada ~12h–13h, GMT-3). Autor: Claude (sessão de especificação documental).
Entrada: `docs/00-product/GADOTTI-ADJUSTMENTS-2026-10-23.md` (registro), `docs/AJUSTES-23-10-2026-GADOTTI.MD`
(fonte original, preservada), `docs/00-product/FULL-LITE-ALIGNMENT-PLAN.md`,
`docs/travel-lite/COMMISSION-ENGINE-SPEC.md`, `.claude/RELATORIO-PARIDADE-FULL-LITE-*.md`,
`.claude/RESPOSTA-REVISAO-PARIDADE-FULL-LITE-2026-10-23.md`, leitura do código (somente leitura) e pesquisa web.

> **HOLD de implementação.** Este documento é **somente especificação**. Nenhum código, schema, migration,
> teste, banco, `.env`, deploy, acesso online à Gadotti, commit ou push foi feito. SQL/TypeScript abaixo são
> **ilustrativos e não aprovados**; nomes de tabelas, permissões, eventos e números de migration são **propostas**.
> A Gadotti permanece no Lite (bancos separados). Nada aqui é default para a Gadotti: **os valores do registro
> (R$ 1.000, 30%, 7%, 15 dias, 10x, R$ 100) são exemplos**, nunca valores padrão do produto.

---

## 0. Como ler este documento

Cada afirmação carrega um rótulo:

| Rótulo | Significado |
| --- | --- |
| **[VERIFICADO]** | li o código/documento citado (arquivo:linha) na árvore de trabalho atual (inclui alterações não commitadas) |
| **[NÃO ENTREGUE]** | requisito dos ajustes que o código atual não atende (lacuna) |
| **[AMBÍGUO]** | regra comercial/financeira não definida; **não inventei**; listada em §14 |
| **[LEGAL]** / **[MERCADO]** / **[SUGESTÃO]** | classificação dos campos de venda por modalidade (§4) |
| **[PROPOSTA]** | desenho meu, sujeito a revisão |

Limite desta rodada: o Codex está indisponível; por isso o documento tenta ser autocontido e crítico (§15 lista o que não verifiquei).

---

## 1. Resumo executivo

1. **Dez frentes** foram especificadas (§3 e §5–§12). Algumas já têm base no Lite (baixa parcial de recebível,
   regras de comissão versionadas, forma de pagamento com `requires_receipt`), mas **o Full está atrás do Lite
   em vários pontos** exigidos pela regra Full-first: o Full tem **um único recebível por venda**
   (`010_financial_foundation.sql:51`, `UNIQUE (agency_id, sale_id)`), a venda do Full não tem vendedor, categoria,
   forma de pagamento, data de venda nem origem/destino (`packages/domain/types.ts:303-318`) e não há busca de clientes
   (`services/api/src/customers.ts:102-116` devolve **todos**).
2. **Duas linhas de dinheiro distintas** (o relato da Gadotti é claro): (a) **receita da agência**, comissão que a
   agência recebe do fornecedor; (b) **comissão do funcionário**, que a agência paga. A spec as mantém em
   entidades, permissões, telas e relatórios **separados**, ligadas só por vínculo rastreável (sem netting).
3. O **maior risco de projeto** é o modelo do fluxo de caixa: *quem recebe o dinheiro do cliente* (agência ou fornecedor).
   Sem essa escolha, receivables e projeções ficam errados. É a decisão humana nº 1 (§14).
4. O desenho reutiliza padrões já decididos (versões imutáveis, snapshots, canal único, PENDING_RULE) para **não criar
   um terceiro motor** desconectado.
5. **Ordem de entrega**: Full primeiro em cada onda, depois Lite (§13). Nada começa antes de Fase 0 concluída
   (outra sessão), decisões humanas e ADR.

---

## 2. Princípios transversais e contratos compatíveis com migração entre bancos

### 2.1 Separar valores (evitar dupla contagem)

| Conceito | Definição | Onde vive (proposta) | Nunca confundir com |
| --- | --- | --- | --- |
| **Valor vendido (meta)** | total vendido ao cliente; serve de meta/progressão | `sales.gross_amount` (Lite) / `sales.total` (Full) | receita |
| **Componentes do pacote** | itens/linhas: tarifa, taxas, hospedagem, transfer, seguro | `sale_items` (Full já tem; Lite **não** tem) | total |
| **Receita da agência** | comissão devida **à agência** pelo fornecedor | `agency_revenue_entries` (novo) | margem, comissão do funcionário |
| **Repasse ao fornecedor** | custo pago ao fornecedor | `sale_cost_items`/`payables` (Lite), `sale_items.unit_cost`/`payables` (Full) | receita |
| **Comissão do funcionário** | obrigação da agência com o vendedor | `seller_commissions` (Lite) / `commission_entries` (Full) | receita |

Regra: relatórios de **resultado** somam receita **ou** margem por venda, nunca ambas; `margem = vendido − custo` é um
conceito do modelo "agência cobra tudo e repassa" (A); no modelo "cliente paga ao fornecedor" (B) só existe receita.
Por isso o modelo de arrecadação é parâmetro por fornecedor/produto (§14, D1).

### 2.2 Eventos distintos (nenhum implica o outro)

`VENDA CONFIRMADA` → `RECEBIMENTO DO CLIENTE (baixa)` → `QUITAÇÃO` → **`DIREITO`** da receita (elegibilidade) →
**`DISPONIBILIDADE`** (entra num lote/janela) → **`RECEBIMENTO EFETIVO DO FORNECEDOR`** (baixa em conta). Aprovação de cartão
**não** é dinheiro recebido; é só um evento de pagamento do cliente que o cadastro da forma de pagamento pode tratar como
quitado para fins de *direito* (§10), sem presumir liquidação real do fornecedor.

### 2.3 Contratos para futura migração (runbook `docs/travel-lite/MIGRACAO-LITE-PARA-FULL.md`)

- **Identidade**: toda tabela nova usa `id` opaco + coluna `legacy_ref` (id de origem) + chave natural estável
  (`key` textual) para configuração; **sem** assumir `tenant_id ≡ agency_id` por renomeação (FAL-PLAN "BASE").
- **Configuração por chave, não por coluna**: campos de cliente/venda são referenciados por `field_key` de um
  **registro de campos** versionado em código (§3.2), não por nome de coluna; assim Lite (subconjunto) e Full migram sem DDL.
- **Snapshots autocontidos**: cada venda guarda JSON com *rótulos, valores e versão* das regras aplicadas
  (`payment_condition_snapshot`, `form_snapshot`, `revenue_snapshot`), de modo que histórico migrado não dependa de regras
  existentes no destino. `calc_version` em todo cálculo.
- **Dinheiro**: `NUMERIC(14,2)`; taxas `NUMERIC(7,4)` em **pontos percentuais** (3 → 4 = +1 p.p.).
- **Datas**: prazos e vencimentos são **data civil** (`DATE`) no fuso da agência. Hoje o Lite usa `DATE`
  (`001_initial_schema.sql:284`) e o Full `TIMESTAMPTZ` (`010_financial_foundation.sql:33`) **[VERIFICADO]**; o contrato comum é
  data civil — evita deslocamento por UTC (risco R4 do relatório de paridade).
- **Pareamento sem perda**: nenhum destino ausente vira sucesso silencioso; se o Full não tiver destino para uma
  configuração Lite, o cliente fica **IMPEDIDO** (mesmo padrão de `RESPOSTA-REVISAO…` §7).
- **Isolamento**: nenhuma entrada aceita `tenant_id`/`agency_id`; FK composta + RLS idêntica ao padrão de cada produto.
- **Auditoria obrigatória** (rollback se a gravação do evento falhar), eventos novos propostos em §10.
- **Contagem de linhas nunca basta** como evidência de migração: exigir totais por venda/fornecedor/status.

### 2.4 Reconciliação com a Fase 0 e F1–F4 (sessão paralela)

Decisões já tomadas (F1–F4): Full ganha **atribuição de venda a funcionário** e **catálogo de categorias**; **canal único**
de pagamento de comissão; **COM-03 bloqueada**; **arredondamento atual mantido**. Efeitos nesta spec:

| Item da Fase 0/F | Efeito nos ajustes |
| --- | --- |
| F1 atribuição + categorias no Full | a categoria de comissão e a **categoria de venda** (frente 3) devem ser **um único catálogo** no Full (`commission_categories`); não criar segundo catálogo. A atribuição (`sale_commission_attributions`) é a ponte "venda → vendedor" também para relatórios (frente 9) |
| Versões imutáveis (COM-01) | o motor de **regras de receita** reutiliza o mesmo padrão (escopo + versões append-only + projeção de vigência), em vez de `valid_until` calculado (defeito R11) |
| F2 "exige recebimento" (forma de pagamento × perfil global) | o relato da Gadotti ("acrescentar no cadastro de forma de pagamento regra de recebimento") **é evidência** a favor de "forma de pagamento", mas **não é a confirmação humana**; COM-03 segue bloqueada até o humano confirmar. Esta spec **não** destrava COM-03 |
| F3 canal único / cancelar ⇒ 409 | idem para receita da agência: cancelar venda com receita **recebida** ⇒ 409 por padrão (§10, D6) |
| F4 arredondamento | para **comissão de funcionário** vale o arredondamento atual de cada produto (Full 0,55 × Lite 0,56 em 18,50×3%, reproduzido no relatório). Para **receita da agência** (módulo novo) propõe-se half-up decimal-safe (igual a `roundMoney` do Lite) — decisão D4 |
| Fase 0 edita `services/api/src/{financial,payroll,commissions}.ts` e `apps/agency` | **esta spec não toca**; qualquer implementação Full desta spec só começa depois que a Fase 0 mergear (conflito de arquivos: `financial.ts`, `sales.ts`, `PayrollPage`) |

Estado observado na árvore (apenas leitura): já existe `infrastructure/migrations/100_commission_channel_protection.sql`
e rota `GET /commissions/channel-conflicts` (`services/api/src/routes/commissions.ts:368`) — trabalho em andamento da Fase 0.
Numeração de migrations desta spec = **a definir na consolidação** (Full vai a 100+ na árvore; Lite vai a 011).

---

## 3. Frente 1 e 2 — Cliente: seleção na venda e configuração do cadastro

### 3.1 Frente 1 — Seleção de cliente (autocomplete + CPF colado)

**Requisito (fonte, linhas 2–3):** campo cliente com autocompletar (digita iniciais, lista filtra); opção de **colar CPF** e
carregar o cliente.

**Comportamento atual verificado**

| Produto | Fato | Evidência |
| --- | --- | --- |
| Lite | a tela de vendas carrega **só 100 clientes** (`/customers?pageSize=100`) num `<select>` | `apps/travel-lite/src/pages/SalesPage.tsx:140,297-302`; teto `MAX_PAGE_SIZE = 100` em `services/api-lite/src/routes/customers.ts:19,115` |
| Lite | a API de clientes **já tem** `?search=` (nome/e-mail/CPF) e escopo por carteira | `routes/customers.ts:110-156` (`cpf LIKE %termo%` na linha 130) |
| Lite | **lacuna de CPF colado**: o CPF é gravado normalizado (só dígitos, `normalizeCpf` em `validation/cpf.ts`), mas o termo de busca **não** é normalizado → "123.456.789-09" **não** casa com "12345678909" | `routes/customers.ts:127-131` × `validation/cpf.ts:10-12` |
| Lite | cliente fora da carteira de quem consulta é indistinguível de inexistente (404) | `routes/customers.ts:166-170`, `sales.ts:186-193` |
| Lite | criar cliente com CPF já existente responde 409 *tenant-wide* — revela existência de cliente de outra carteira | `routes/customers.ts:95-103,197` **[AMBÍGUO]** (§14, A3) |
| Full | **não há busca nem paginação**: `GET /customers` devolve todos os clientes do tenant | `services/api/src/customers.ts:102-116`, `routes/customers.ts:38-42` |
| Full | já existe seletor com busca **no cliente** (filtra lista inteira em memória), mostrando nome + data de nascimento "porque há várias Amandas" | `apps/agency/src/pages/ExcursionsPage.tsx:51-100`; `services/api/src/excursions.ts` (`customerBirthDate`) |
| Full | sem escopo por carteira (qualquer `VIEWER` lista todos) | `routes/customers.ts:38-42` |

**Lacuna:** (Lite) autocomplete real com limite, CPF formatado, desambiguação; (Full) endpoint de busca no servidor.

**Desenho proposto [PROPOSTA]**

- **Endpoint único de lookup** (mesmo contrato nos dois produtos):
  `GET /customers/lookup?q=<texto>&limit=<n≤20>` → `{ items: [{ id, name, cpf_masked, birth_date, status }] }`.
- **Regras do servidor**:
  1. `q` com menos de 2 caracteres → 400 (não lista tudo).
  2. se `q`, após remover pontuação, tem 11 dígitos **e** CPF válido → busca **exata** pelo CPF normalizado (no máximo 1 resultado);
     se for apenas dígitos parciais (≥4) → prefixo de CPF; caso contrário → nome por prefixo/contém, `ILIKE`, ordem alfabética.
  3. escopo **idêntico ao da listagem** (Lite: `customers.read_all` ou carteira própria; Full: papel mínimo `VIEWER` hoje; se o Full ganhar escopo por carteira, aplicar aqui).
     Cliente fora do escopo **não** aparece e não há mensagem diferente.
  4. resposta **mínima** (sem e-mail/telefone/endereço); CPF **mascarado** (`***.456.789-**`) — o cliente já selecionado é carregado por `GET /customers/:id` (autorizado).
  5. limite fixo, `ORDER BY name`, sem `OFFSET` profundo; rate-limit do próprio produto; log sem o termo (CPF é dado pessoal).
  6. nunca aceita `tenant_id`/`agency_id`; Full usa `getAgencyId()`, Lite usa `tenantId` do contexto.
- **UI** (Lite `SalesPage`, Full telas de venda): campo *combobox* com debounce (~250 ms), teclado (↑/↓/Enter/Esc), estado vazio
  ("nenhum cliente encontrado — cadastrar novo"), colar CPF dispara a busca exata e seleciona se houver exatamente 1 resultado.
  Mostrar nome + data de nascimento (padrão já existente no Full).
- **Accent-insensitive** ("joao" achar "João"): **[AMBÍGUO/NÃO VERIFICADO]** — a extensão `unaccent` não foi verificada no PostgreSQL de nenhum ambiente; sem ela, comparar normalizando em aplicação/coluna gerada. Não depende de decisão comercial; decisão técnica na implementação.
- **Compatibilidade**: o `?search=` atual do Lite continua funcionando; a correção de normalização de CPF vale para ele também (bug verificado).

**Casos numéricos/exemplos:** `q="joa"` com 3 clientes → 3 itens ordenados; `q="123.456.789-09"` (CPF válido existente) → 1 item; mesmo CPF
de cliente fora da carteira do vendedor → 0 itens; `q="1"` → 400; `limit=500` → clamp a 20.

**Plano de testes (Vitest)**: `services/api-lite/tests/customer-lookup.test.ts` (escopo por carteira, CPF formatado/dígitos/inválido, `limit`, q curto, resposta sem PII extra, outro tenant → 0); `services/api/tests/customer-lookup.test.ts` (idem + papel mínimo); `apps/*/src/**/CustomerCombobox.test.tsx` (debounce, teclado, colar CPF, vazio). Segurança: teste de que não há diferença observável entre "fora de escopo" e "inexistente".

**Ordem:** Full (endpoint + UI) → Lite (corrigir normalização + endpoint + UI). Independente de todas as outras frentes → pode ir **primeira**.

### 3.2 Frente 2 — Configuração do cadastro de cliente (habilitar/desabilitar/obrigatório)

**Requisito (fonte, linha 4):** uma área (pode ser aba "Cliente") com **todos os campos** do cadastro para o administrador habilitar/desabilitar e tornar obrigatório; Full e depois Lite.

**Comportamento atual verificado**

| Produto | Fato | Evidência |
| --- | --- | --- |
| Lite | campos: nome (obrigatório), cpf, nascimento, telefone, whatsapp, e-mail, endereço (cep…estado), notas, carteira; só `name` é exigido; CPF validado e único por tenant | `001_initial_schema.sql:66-91`; `routes/customers.ts:174-241` (name em :191) |
| Full | campos muito mais numerosos (passaporte, RG, nacionalidade, estado civil, profissão, contato de emergência…); só `name` exigido; lista fechada `CUSTOMER_OPTIONAL_STRING_FIELDS` | `packages/domain/types.ts:64-98`; `routes/customers.ts:162-196` |
| ambos | **não existe** configuração de obrigatoriedade/habilitação | busca por `required_fields`/`customerFields` sem resultado em `services/api/src` |
| Lite | aba existente para cadastros: `CatalogPage` com `SECTIONS` e `lite-tabs` | `apps/travel-lite/src/pages/CatalogPage.tsx:317-361`; menu `/cadastros` exige `settings.manage` (`menu.ts`) |

**Lacuna:** toda a frente.

**Desenho [PROPOSTA]**

- **Registro de campos** (código, versionado): lista de `field_key` (`cpf`, `birth_date`, `phone`, `whatsapp`, `email`, `address.zip`, …, `passport`, `rg`,
  `nationality`, …) com tipo, validador e `available_in: ['FULL','LITE']`. Campos que só o Full tem ficam fora do Lite (Lite é subconjunto — DEC-007);
  a lista Lite ⊆ Full é testada por um teste de paridade de registro.
- **Campos travados** (não configuráveis, por integridade/segurança): `name` (sempre habilitado e obrigatório), identificador interno, `status`,
  carteira/responsável (Lite: escopo de acesso), qualquer campo exigido por unicidade. Regra: **desabilitar não apaga dado**; dados existentes permanecem.
- **Tabela** (por produto, mesmo contrato): `customer_field_settings(id, scope_id, field_key TEXT, enabled BOOL, required BOOL, updated_by, updated_at, legacy_ref)`,
  `UNIQUE(scope_id, field_key)`, `CHECK (NOT required OR enabled)`. Alterações **não** são append-only (configuração), mas **cada mudança gera evento de auditoria** com antes/depois.
- **Efeito no servidor** (autoridade; UI só reflete):
  - criação: todos os `required` habilitados são validados; campo **desabilitado** enviado na escrita → **422** (`field_disabled`), nunca ignorado em silêncio;
  - edição: valida **apenas campos presentes no PATCH** (mudar a obrigatoriedade não invalida clientes antigos nem bloqueia edição de outro campo) — **[AMBÍGUO]** (A1: confirmar);
  - importação e migração aplicam as **mesmas** regras? **[AMBÍGUO]** (A2): proposta = importação aplica (com relatório de linhas rejeitadas); migração Lite→Full **não** rejeita registro histórico (preserva dado; sinaliza pendências).
  - leitura: campos desabilitados deixam de ser devolvidos na lista de formulário (`GET /customers/field-settings` para a UI); `GET /customers/:id` continua devolvendo o que existe (para não esconder dado de quem tem permissão).
- **Permissão**: nova `customers.fields_manage` (Lite: catálogo `access.ts` + migration + teste espelho conforme `docs/travel-lite/ACCESS-CONTROL.md`; Full: papel de administrador/`OWNER`+RLS). Hoje o Lite usa `settings.manage` para cadastros (`categories.ts:39`) — pode ser reaproveitada **ou** criada nova; decisão técnica na consolidação com SEC-01.
- **UI**: aba **"Cliente"** em Cadastros (Lite: nova seção em `CatalogPage`; Full: em Configurações). Tabela de campos com 2 colunas de interruptores (Habilitado / Obrigatório), campos travados com cadeado e dica.
- **Migração**: linhas por `field_key` (texto) — copiam entre bancos sem DDL.

**Casos:** (1) administrador marca `phone` obrigatório → POST sem phone → 422 `required`; (2) desabilita `rg` → POST com `rg` → 422; (3) cliente antigo sem phone → PATCH `{notes}` → 200 (A1); (4) tentar desabilitar `name` → 400 (travado); (5) usuário sem `customers.fields_manage` → 403; (6) outro tenant não vê nem altera.

**Testes:** `customer-field-settings.test.ts` (Full e Lite): matriz habilitado×obrigatório×travado; PATCH parcial; auditoria obrigatória (rollback se falhar); isolamento; teste de **registro Lite ⊆ Full**; UI `CustomerFieldsTab.test.tsx`.

**Ordem:** Full → Lite. Dependência leve de SEC-01 (nome da permissão). Independente das frentes financeiras.

---

## 4. Pesquisa de campos de venda por modalidade (fontes públicas)

> Pesquisa realizada em 23/10/2026 com fontes públicas; **limites**: o site do Planalto recusou conexão
> (`ECONNRESET`), então **não consegui ler o texto oficial integral** da Lei 11.771/2008, do CDC e do Decreto 7.962/2013 nesta sessão;
> os trechos abaixo vêm de resumos/trechos de busca e do texto da Res. ANAC 400 e da Portaria MTur 177, que **consegui abrir**. Toda
> exigência marcada [LEGAL] com fonte secundária deve ser **reconfirmada no texto oficial** antes de virar regra obrigatória do produto.
> Nenhum dado real da Gadotti foi usado.

### 4.1 Fontes

| # | Fonte | Uso |
| --- | --- | --- |
| S1 | Portaria MTur 130/2011 (revogada) → **Portaria MTur 38/2021** (consolida o Cadastur); base Lei 11.771/2008 art. 22 e Decreto 7.381/2010 arts. 18-19 — [legisweb 38/2021](https://www.legisweb.com.br/legislacao/?id=422772), [contabeis 130/2011](https://www.contabeis.com.br/legislacao/193520/portaria-mtur-130-2011/) | Cadastur obrigatório para agências, transportadoras turísticas e meios de hospedagem (fonte secundária) |
| S2 | **Resolução ANAC 400/2016**, lida em [anac.gov.br](https://www.anac.gov.br/assuntos/legislacao/legislacao-1/resolucoes/resolucoes-2016/resolucao-no-400-13-12-2016) — arts. 4, 5, 6, 8, 11, 16 | preço total discriminado, conteúdo do comprovante, correção de nome, desistência em 24 h, identificação |
| S3 | **Portaria MTur 177/2011** (art. 3, campos da FNRH), lida em [normasbrasil](https://www.normasbrasil.com.br/norma/portaria-177-2011_231058.html); alterada pela Portaria 216/2012 ([normasbrasil](https://www.normasbrasil.com.br/norma/portaria-216-2012_241601.html)); versão digital da FNRH posterior | campos da ficha de hóspede |
| S4 | **CDC (Lei 8.078/1990)** arts. 31, 49, 52 — resumos em [legjur](https://www.legjur.com/legislacao/nivel/lei_00080781990/-capitulo-vi-da-protecao-contratual), [Idec](https://idec.org.br/print/24305), [Câmara/Procon](https://www2.camara.leg.br/atividade-legislativa/comissoes/comissoes-permanentes/cdc/apresentacoes-em-eventos/apresentacoes-de-convidados-em-eventos-em-2023/alto-custo-para-remarcacao-ou-cancelamento-de-passagens/apresentacao-procon/view) | informação prévia de preço/parcelas/total, arrependimento 7 dias (art. 49), conflito com art. 11 ANAC (24 h) |
| S5 | **ECA art. 83** e Res. CNJ 131/2011 (internacional) / 295/2019 (nacional, complemento) — [TJRJ](https://www.tjrj.jus.br/web/portal-conhecimento/noticias/noticia/-/visualizar-conteudo/5736540/402013387), [TJSP](https://www.tjsp.jus.br/Download/CoordenadoriaInfanciaJuventude/pdf/AutorizacaoViagemMenor/AutorizacaoViagemMenorEsclarecimentos.pdf) | menores: documento, acompanhante, autorização |
| S6 | **ANTT Res. 4.777/2015** (fretamento; consolidada pela 5.818/2018 segundo notícia) — [legisweb](https://www.legisweb.com.br/legislacao/?id=316689) | fretamento turístico/circuito fechado; **a regra de lista de passageiros não foi confirmada** |
| S7 | ANTAQ / notícias de cruzeiro — [Panrotas 2016](https://www.panrotas.com.br/noticia-turismo/cruzeiros/2016/04/abav-rj-convoca-trade-contra-tarifa-extra-de-cruzeiros_125072.html) | taxa portuária por passageiro existe (valor de 2015 desatualizado); **nada oficial sobre estrutura de comissão** |

### 4.2 Campos por modalidade × formulários do Full existentes

Legenda do tipo: **L** = exigência legal (com fonte); **M** = prática de mercado (sem norma encontrada; vem do próprio relato da Gadotti ou da estrutura natural do produto); **S** = sugestão minha.
"Full hoje" = onde o Full já tem o campo (**[VERIFICADO]** em `packages/domain/types.ts`); "Lite hoje" = não tem (venda Lite só tem cliente, vendedor, categoria, descrição, valores, datas e parcelas — `sales.ts:35-37`).

| Campo | Modalidades | Tipo | Fonte/justificativa | Full hoje | Lite hoje |
| --- | --- | --- | --- | --- | --- |
| Nome completo do passageiro (por pessoa) | todas com transporte/hospedagem | **L** (aéreo: nome e sobrenome no comprovante) | ANAC 400 art. 6 e 8 (S2) | `AirService.customerId`/`BookingPassenger`; `SaleItem.travelers[]` | não |
| Documento de identificação (tipo/nº) e CPF | aéreo, ônibus, hospedagem, cruzeiro | **L** (embarque exige documento válido; hospedagem: documento na FNRH) | ANAC art. 16 (S2); Portaria MTur 177 art. 3 (S3) | `Customer.cpf/rg/passport/nationalIdType` | cliente só tem CPF |
| Data de nascimento / faixa etária (menor) | todas | **L** (menores: regras de viagem) + **M** (preço por faixa) | ANAC art. 16 (<12 anos, doméstico); ECA art. 83 (S5) | `Customer.birthDate`; `CustomerDependent` | `birth_date` no cliente |
| Acompanhante/responsável e autorização do menor | todas com menor | **L** | ECA art. 83; CNJ 131/295 (S5) | `CustomerDependent`, `emergencyContact*` | não |
| Origem e destino | aéreo, ônibus, cruzeiro (embarque/desembarque), pacote | **M** + pedido da Gadotti (linha 19) | relato; `AirService.origin/destination`, `Excursion.destination/origin` | **sim** (por serviço) — **não na venda** | **não** |
| Data de embarque/ida e retorno | todas | **M** (também usada para prazo de saldo) | relato (saldo "15 dias antes do embarque") | `Trip`, `AirService.departureDate`, `LandService.startDate/endDate` | **não** |
| **Data da venda** | todas | **M** + pedido (linha 19) | relato | `Sale.createdAt` (não editável/relatável como data de venda) | `sales.sale_date` **sim** (`001:168`) |
| Quantidade de passageiros | ônibus (fixo por passageiro), excursão, aéreo | **M** (base de comissão fixa por passageiro) | relato; `employee-commissions.ts:164-186` conta passageiros de excursão | `SaleItem.qty`, `excursion_customers` | **não** |
| Fornecedor por item | aéreo (vários), pacote, hospedagem | **M** (relato: "vários fornecedores, cada um com %") | relato | `SaleItem.supplierId`, `TravelProduct.supplierId` | `sale_cost_items.financial_party_id` (só custo) |
| Tarifa, taxas e fees discriminados | aéreo, cruzeiro | **L** (aéreo: preço total discriminado em transporte, tarifas aeroportuárias e valores governamentais) + **M** (cruzeiro: comissão só sobre taxas, relato) | ANAC art. 4-5 (S2) | `AirService.fare/taxes/fees`; `SaleItem.taxes/fees` | **não** |
| Localizador/PNR, nº do bilhete, cia aérea, nº do voo, classe, bagagem | aéreo | **M** (ANAC exige no comprovante dados do voo e serviços; PNR/bilhete é prática) | ANAC art. 6 (S2) | `AirService` (todos) | **não** |
| Nº de confirmação / voucher | hospedagem, serviços terrestres | **M** | prática | `LandService.confirmationNumber` | **não** |
| Dados da FNRH (nome, nacionalidade, nascimento, sexo, documento, endereço, profissão, procedência, destino, motivo, transporte, check-in/out, nº hóspedes) | hospedagem | **L** — **do estabelecimento hoteleiro**, não da agência | Portaria MTur 177 art. 3 (S3) | parcial em `Customer` | parcial |
| Política de cancelamento/remarcação/reembolso informada | aéreo, pacote | **L** (informar antes do pagamento: no-show, remarcação, reembolso e multas) + **L** (CDC art. 31/49) | ANAC art. 5 (S2); CDC (S4, **reconfirmar texto**) | `TravelProduct.cancellationPolicy` | **não** |
| Condições de pagamento (preço à vista, nº e periodicidade das parcelas, total com/sem financiamento, juros) | todas com parcelamento | **L** (CDC art. 52, S4 — **reconfirmar**) | S4 | **não estruturado** (`Supplier.paymentTerms` texto) | só `installment_count` |
| Cadastur do prestador / dados da agência (CNPJ, nome) na oferta/contrato | oferta online | **L** (Cadastur) + **L** (Decreto 7.962, e-commerce; **não consegui ler**) | S1 | `agencies`/branding | `tenant_branding` |
| Lista de passageiros do fretamento | ônibus fretado | **L?** — **não confirmado** (ANTT Res. 4.777/5.818) | S6 | `excursion_customers` | **não** |
| Cabine/categoria, navio, data de embarque no porto, taxa portuária por passageiro | cruzeiro | **M** + valor oficial **não confirmado** | S7 | `TravelProductCategory.CRUISE`, `LandServiceType.CRUISE` (sem campos de cabine) | **não** |
| Seguro-viagem: apólice, vigência | seguro | **M** | prática | `InsurancePage`/`LandServiceType.TRAVEL_INSURANCE` | **não** |

### 4.3 Conclusões da pesquisa para o desenho

1. Os **campos legais** são sobretudo **por passageiro** (identidade, documento, menor) e de **informação de preço/condições ao consumidor** — não "campos de formulário por categoria". Por isso o formulário configurável (frente 3) precisa suportar **passageiros** (lista) e **componentes de preço discriminados**, não só campos escalares.
2. **Origem/destino/embarque/passageiros/data da venda** são campos de **negócio** (não legais) pedidos explicitamente; devem ser **colunas de primeira classe** (relatórios), não apenas JSON.
3. **FNRH é obrigação do meio de hospedagem**, não da agência: a agência só coleta os dados que o hotel exigirá (sugestão); **não** impor como obrigatório.
4. **Cruzeiro "só sobre taxas"** e **ônibus "fixo por passageiro"** não aparecem em norma: são **política comercial** do fornecedor — logo **configuração**, não regra do produto (confirma o pedido "sem hardcode").
5. O **conflito arrependimento (CDC art. 49, 7 dias) × desistência ANAC em 24 h** é discutível (Procon argumenta conflito; não encontrei decisão final) → o produto **não decide**: registra a **política de cancelamento do fornecedor/condição** como texto/versão no snapshot e deixa a regra jurídica a cargo da agência. Recomendação: parecer jurídico antes de automatizar devolução.
6. Itens **não confirmados** (lista de passageiros ANTT, valor oficial da taxa de cruzeiro, campos da FNRH digital atual, textos integrais Lei 11.771/CDC/Decreto 7.962) estão em §15.

---

## 5. Frente 3 — Produto, fornecedor e categoria (formulário de venda configurável)

**Requisito (fonte, linhas 15 e 18):** cadastrar produto e **atrelá-lo ao fornecedor**; o fornecedor tem **suas configurações de pagamento de comissão**;
a **categoria** (aéreo, terrestre…) não deve ser só nome — a agência **monta o formulário de venda** marcando os campos necessários além do padrão; o usuário
"aponta na venda o que vai aplicar".

**Comportamento atual verificado**

| Produto | Fato | Evidência |
| --- | --- | --- |
| Lite | categoria de venda = **nome, ativo, ordem** (sem campos) | `001_initial_schema.sql:129-139`; `routes/categories.ts:42-43,54` |
| Lite | **não existe produto**; fornecedor = `financial_parties` (SUPPLIER/…) usado só em **custos da venda** e pagáveis | `005_imports_financial_parties_sale_costs.sql:68-101`; `routes/sale-costs.ts:218-286` |
| Lite | a venda tem **uma** categoria, **um** vendedor, **uma** forma de pagamento, valor único; sem itens | `001:157-189`; `sales.ts:35-37,231-278` |
| Full | `TravelProduct` com `supplierId`, `category` (enum **fixo** de 19 valores), `commissionPercent`, `cancellationPolicy`, `destination`, `validFrom/Until` | `packages/domain/types.ts:1089-1150` |
| Full | `commission_percent` do produto é **armazenado e validado, mas não consumido** por nenhum cálculo de comissão (grep em `services/api/src`: só `travel-products*.ts`) | **[VERIFICADO por grep]** |
| Full | `Supplier` tem categorias (enum fixo), `paymentTerms` **texto livre**, dados bancários; **sem** regra de comissão da agência | `types.ts:1013-1075` |
| Full | `SaleItem` já tem `supplierId`, `travelers[]`, `qty`, `unitCost`, `unitPrice`, `taxes`, `fees`, `discount`, `commission`, `lineMargin` | `types.ts:330-354` |
| Full | a **venda** (`Sale`) não referencia produto/categoria/forma de pagamento | `types.ts:303-318`; `sales.ts:110-223` |
| Full | categorias de comissão de funcionário só existirão com F1 (`commission_categories`) | RESPOSTA §3 |

**Lacuna:** (a) Lite: produto, itens da venda, fornecedor vinculado, formulário por categoria. (b) Full: categoria **configurável** (enum fixo hoje), formulário configurável, regra de pagamento de comissão por fornecedor/produto. (c) ambos: campos de primeira classe na venda (origem, destino, embarque, passageiros).

**Desenho [PROPOSTA]**

1. **Categoria de venda configurável** = a mesma entidade de `commission_categories` (F1) no Full e `sale_categories` no Lite; contrato comum `{ id, name, active, sort_order, legacy_ref }`. O enum `TravelProductCategory` do Full permanece como **tipo de produto** (legado), **não** como categoria de venda.
2. **Perfil de formulário por categoria** (`sale_category_fields(category_id, field_key, enabled, required, sort_order, group)`), selecionando do **registro de campos de venda** (código, versionado) com tipos: texto, data, inteiro, dinheiro, enum, lista de passageiros, componentes de preço. O registro inclui os campos de §4.2. **Presets opcionais** ("Aéreo", "Excursão rodoviária", "Cruzeiro", "Hospedagem", "Pacote") que o administrador pode aplicar e editar — **não** são default imposto; nenhum preset carrega valores da Gadotti.
3. **Campos de primeira classe na venda** (colunas, não JSON), todos opcionais por categoria: `travel_start_date` (embarque/ida), `travel_end_date`, `origin_text`, `destination_text`, `passenger_count`; `sale_date` já existe no Lite e precisa de coluna equivalente no Full. Texto livre com sugestão de valores já usados (normalização por IATA/IBGE **fora do escopo** — [AMBÍGUO] A4).
4. **Dados da modalidade** em `sales.modality_data JSONB` (`{ field_key: valor }`) + `sales.form_snapshot JSONB` (versão do perfil, rótulos, obrigatoriedades aplicadas). Passageiros em tabela filha `sale_passengers(sale_id, customer_id|dados, role, birth_date, document_type, document_number…)` — documento sensível: **mascaramento** e permissão de leitura própria (Full tem `document-masking.ts` — segurança root).
5. **Produto e vínculo com fornecedor**: Lite ganha `catalog_products(id, name, category_id, default_supplier_id, active, legacy_ref)`; Full reaproveita `TravelProduct` (já tem `supplierId`). **Sem** novo catálogo no Full. O fornecedor é `financial_parties` (Lite) / `suppliers` (Full); contrato comum: `{ id, name, document, active }`.
6. **Itens da venda** (componentes): Lite ganha `sale_items` espelhando `SaleItem` do Full (descrição, produto, fornecedor, qty, `unit_price`, `taxes`, `fees`, `discount`, `line_total`). `sales.gross_amount` passa a ser **soma dos itens** quando houver itens (servidor deriva; cliente não envia o total junto com itens). Venda sem itens continua válida (legado e importação).
7. **O que a venda "aponta"**: ao escolher categoria/produto, o servidor devolve as **opções permitidas** (condições de pagamento aplicáveis, regra de receita candidata, forma de pagamento) e o usuário escolhe **entre as configuradas**; a escolha vira snapshot (§8 e §10). Quem não tem permissão de sobrescrever só aceita a sugestão padrão.
8. **Mudar o perfil da categoria não altera vendas existentes** (snapshot); desativar campo não apaga valor.

**Autorização/tenant/auditoria:** `catalog.manage` (nova; Lite hoje usa `settings.manage`, `categories.ts:39`); eventos `SALE_CATEGORY_FORM_UPDATED`, `CATALOG_PRODUCT_CREATED/UPDATED`; isolamento por FK composta (`tenant_id,category_id`) e RLS (Lite) / `agency_id` (Full).

**Casos:** (1) categoria "Aéreo" com `origin` e `destination` obrigatórios → venda sem eles → 422; (2) mudar a categoria para não exigir `destination` depois → venda antiga intacta, `form_snapshot` mantém a exigência vigente à época; (3) venda com itens (fare 2.000, taxes 300) → `gross_amount` = 2.300 derivado; cliente envia 9.999 → ignorado/422; (4) produto inativo não selecionável; fornecedor de outro tenant → 404/422.

**Testes:** `sale-category-forms.test.ts` (validação por perfil, snapshot imutável, campo desabilitado), `sale-items-lite.test.ts` (total derivado, paridade de contas com `computeLineTotal` do Full), `catalog-products.test.ts`, isolamento/FKs, UI `SaleForm.test.tsx` (campos dinâmicos), teste de **registro Lite ⊆ Full**.

**Ordem:** Full (categoria configurável + perfil + campos de 1ª classe + sale_date) → Lite (itens, produto, perfil). **Depende de F1** (catálogo de categorias) e da Fase 0 (`sales.ts`/`financial.ts`).

---

## 6. Frente 4 — Condições de pagamento (parcelas, parcela mínima, entrada, vencimento relativo ao embarque)

**Requisito (fonte, linhas 11–12):** cartão até 10x sem juros com parcela mínima (ex.: R$ 100); no mesmo produto, boleto/Pix parcelado com entrada obrigatória (ex.: 30%) e saldo até X dias antes do embarque; "regra de recebimento" no cadastro da forma de pagamento; tudo configurável.

**Comportamento atual verificado**

| Produto | Fato | Evidência |
| --- | --- | --- |
| Lite | forma de pagamento = nome, ativo, ordem, `requires_receipt` (libera comissão do **funcionário** conforme recebimento) | `001:141-151`; `routes/financial-catalog.ts:75-84`; `011_commission_release_by_receipt.sql:18-27` |
| Lite | a venda cria **N recebíveis iguais**, mensais a partir de `due_date` (`base = floor(gross/n,2)`, **última parcela absorve o resíduo**); `installment_count` de 1 a 999; **sem** parcela mínima, entrada ou vínculo ao embarque | `routes/sales.ts:30-31,111-119,296-324` |
| Lite | forma de pagamento **não influi** no cronograma (só na liberação de comissão) | `sales.ts:326-332` |
| Full | um recebível por venda, vencimento `now()`; **sem parcelas** (`UNIQUE (agency_id, sale_id)`); a decisão D5 (demo) usa `revenues` como cronograma | `sales.ts:187-192`; `010_financial_foundation.sql:26-52`; `docs/decisions/D5-FINANCIAL-INSTALLMENTS-DEMO-DECISION.md` |
| Full | `Supplier.paymentTerms` é texto livre; **não há** entidade de forma/condição de pagamento | `types.ts:1073` |

**Lacuna:** regras estruturadas de condição de pagamento nos dois; no Full, **parcelamento real** de recebíveis.

**Desenho [PROPOSTA]**

- **Entidade `payment_conditions`** (config, por categoria/produto/forma de pagamento via tabela de aplicabilidade):

| Campo | Significado |
| --- | --- |
| `name` | nome livre |
| `schedule_kind` | `SINGLE` (um recebível; usado p/ cartão: parcelamento é do **viajante**, informativo) · `EQUAL_INSTALLMENTS` (N recebíveis iguais) · `DOWN_PAYMENT_PLUS_BALANCE` (entrada + saldo de baixas livres) |
| `max_installments` | inteiro ≥ 1 |
| `min_installment_amount` | dinheiro ≥ 0 (nulo = sem mínimo); `N_máx = min(max_installments, floor(total / mínimo))` |
| `interest_free` / `interest_rate_pp` | informar juros (CDC art. 52 pede taxa efetiva) — **sem cálculo de juros na v1** (condição com juros fica **[AMBÍGUO]** A5; v1 só aceita sem juros) |
| `down_payment_mode` / `down_payment_value` | `NONE`·`PERCENT`·`AMOUNT`; `down_payment_required` BOOL |
| `balance_deadline_anchor` | `SALE_DATE` · `TRAVEL_START` ; `balance_deadline_offset_days` (negativo = antes do embarque) |
| `allows_partial_payments` | baixas livres no saldo |
| `treat_as_settled_on_authorization` | cartão tratado como quitado para fins de **direito** de receita (§10) — nunca presume liquidação real |
| `applicable_payment_method_ids`, `applicable_category_ids/product_ids` | onde pode ser escolhida |

- **Validação no servidor** (cliente envia só: condição escolhida, nº de parcelas, forma de pagamento): `N ≤ N_máx`; `entrada ≥ mínimo` quando obrigatória; saldo com prazo = `embarque + offset`; **embarque ausente com âncora TRAVEL_START → 422** (não adivinha data).
- **Cronograma gerado pelo servidor**, **não** pelo cliente: `SINGLE` → 1 recebível (valor total); `EQUAL_INSTALLMENTS` → algoritmo atual do Lite (resíduo na última, verificado) — **no Full também**, para paridade; `DOWN_PAYMENT_PLUS_BALANCE` → recebível `ENTRADA` + recebível `SALDO` (aceita baixas parciais livres).
- **Snapshot**: `sales.payment_condition_snapshot` = condição completa (valores, rótulos, versão) + escolha efetiva + cronograma. Alterar a condição depois **não muda** vendas existentes (revisão de venda explícita: §6.1).
- **Entrada obrigatória**: **[AMBÍGUO]** D2 — bloqueia a confirmação da venda ou só sinaliza "aguardando entrada"? Proposta: **não bloqueia** a confirmação; a venda fica com sinalização derivada `down_payment_pending` (relatório + bloqueio de direito de receita), sem novo status de venda.
- **Full**: exige mudança de modelo — remover `UNIQUE (agency_id, sale_id)` em `receivables` (migration **nova**, nunca editar a 010) e adicionar `installment_number/installment_count/kind`; ADR obrigatória (altera modelo financeiro; AGENTS.md) + atualização do decisão D5. Estatuto de `revenues` como cronograma muda → plano de transição (não apagar nada).
- **Sem hardcode Gadotti:** o preset "Excursão rodoviária Gadotti" **não existe**; os exemplos do registro viram **fixtures de teste**.

**6.1 Mudança de data de embarque após a venda [AMBÍGUO] (D5):** proposta = não recalcular automaticamente; operação **"revisar condição da venda"** (permissão própria, motivo obrigatório, auditoria) gera **nova versão de snapshot** e reprograma só recebíveis **abertos**; recebíveis pagos/parcialmente pagos não mudam.

**Casos numéricos (valores = exemplos do registro, parametrizados)**

| # | Entrada | Esperado |
| --- | --- | --- |
| P1 | total 1.000,00; cartão; `max=10`; mínimo 100,00 | N_máx = min(10, ⌊1000/100⌋=10) = **10**; 10 × 100,00; N=11 → 422 (parcela 90,90 < mínimo) |
| P2 | total 999,00; mínimo 100,00; `max=12` | N_máx = ⌊9,99⌋ = **9** → 9 × 111,00 = 999,00 |
| P3 | total 1.000,00; N=3 | 333,33 + 333,33 + 333,34 (resíduo na última — algoritmo atual `sales.ts:298-300`) |
| P4 | total 1.000,00; entrada 30% obrigatória; saldo até 15 dias antes do embarque 20/12/2026 | entrada **300,00** (venc. na venda); saldo **700,00** com limite **05/12/2026** |
| P5 | total 1.050,05; entrada 30% | 315,015 → **315,02** (half-up); saldo = total − entrada = **735,03** (soma sempre fecha) |
| P6 | baixas no saldo: 200,00; 250,00; 250,00 | saldo 500,00 → 250,00 → **0,00**; `settled_at` = data da última baixa |
| P7 | baixa de 250,00 depois do limite | aceita (dinheiro entrou) e **marca atraso** (`late`) — efeito sobre o direito da receita é **[AMBÍGUO]** (A6) |
| P8 | cartão `SINGLE` com 10x do viajante | 1 recebível 1.000,00; parcelas do viajante só informativas (`traveler_installments=10`) |
| P9 | N=11 para total 1.000,00 via API direta | 422 (servidor é a autoridade; UI não basta) |

**Testes (Vitest):** `payment-conditions.test.ts` (P1–P9 como tabela; falha fechada se embarque ausente; condição não aplicável à forma/categoria → 422; N inválido; entrada obrigatória), `payment-schedule.test.ts` (paridade Full×Lite do algoritmo — mesmo oráculo), isolamento e RLS, migração Full de `receivables` (teste `test:db` em banco descartável, com autorização), UI `PaymentConditionsTab.test.tsx`.

**Ordem:** Full (ADR + migration + serviço de cronograma + UI) → Lite (condições + usar o serviço; hoje só `installment_count`). **Maior item de risco do Full** (mexe em `financial.ts`/receivables — esperar Fase 0).

---

## 7. Frente 5 — Baixas e saldos

**Requisito (fonte, linha 12):** dar baixa a cada pagamento; no exemplo, o saldo de 700 pode ser pago como o cliente quiser até o prazo; refletir quitação sem depender de parcelas rígidas.

**Comportamento atual verificado**

| Produto | Fato | Evidência |
| --- | --- | --- |
| Lite | `POST /receivables/:id/receive` aceita **valor parcial** (padrão = saldo restante), recusa excesso, cancelado e já quitado; atualiza status do recebível e da venda; auditoria e outbox | `routes/cash-flow.ts:220-285` (excesso em :239-243) |
| Lite | **estorno** de pagamento existe e serializa por venda (lock) | `routes/cash-flow.ts:556`; relatório de revisão (obs. P1 de corrida resolvida) |
| Lite | não há "baixa na venda" que distribua pelo saldo; cada baixa é por recebível; não há visão consolidada de saldo da venda além do detalhe | `sales.ts:481-574` (detalhe lista recebíveis) |
| Full | alocação parcial por pagamento existe (`PARTIALLY_PAID`, valida excesso) | `financial.ts:937,1162,2093-2120,2806` |
| Full | status de **venda**: `PENDING/CONFIRMED/PAID/CANCELLED/REFUNDED` (**sem** PARTIALLY_PAID) e `markSalePaid` | `types.ts:517-523`; `sales.ts:402` |
| Full | um recebível por venda → a "baixa por parcela" não existe | §6 |

**Lacuna:** saldo consolidado da venda, baixa livre sobre o saldo, `settled_at` explícito, paridade Full (parcelas).

**Desenho [PROPOSTA]**

- `GET /sales/:id/balance` → `{ total, received, remaining, receivables:[{kind,amount,paid,due,status}], next_due, last_payment_at, settled_at, down_payment_pending, balance_deadline, late }`.
- `POST /sales/:id/payments` `{ amount, account_id, method, paid_at, reference, notes, receivable_id? , idempotency_key }`: servidor aloca por **ordem de vencimento** nos recebíveis abertos (ou no recebível indicado); recusa `amount > remaining`; **idempotência** por chave para reenvio; trava por venda (advisory lock — padrão já usado no estorno do Lite).
- `settled_at` gravado quando `remaining` chega a 0; **estorno** que reabre saldo limpa `settled_at` e **reverte efeitos dependentes** (direito de receita ainda não recebido volta a `FORECAST`; já recebido → bloqueia estorno com 409, igual a F3).
- Status de venda do Full ganha equivalente a `PARTIALLY_PAID` **derivado** (não novo valor de enum) — decisão de modelagem no ADR; sem quebrar `SaleStatus`.
- A quitação **não** depende de parcelas rígidas: em `DOWN_PAYMENT_PLUS_BALANCE` o saldo é um recebível único com baixas livres.
- **Autorização:** `finance.manage` (Lite, já exigida em `receive`), papel financeiro no Full; leitura por escopo de venda.

**Casos:** (1) venda 1.000 com entrada 300 paga + saldo 700: baixa 200 → `remaining 500`, status `PARTIALLY_PAID`; (2) baixa 600 → 422 (excede 500); (3) duas baixas simultâneas de 500 → uma passa, outra 422/409 (lock); (4) estorno da baixa de 250 → `remaining` +250 e `settled_at` limpo; (5) reenvio com mesma `idempotency_key` → resposta idêntica, 1 baixa.

**Testes:** `sale-balance.test.ts` (Lite e Full), `sale-payments-concurrency.test.ts` (DB), idempotência, estorno com direito de receita, UI `SaleBalancePanel.test.tsx`.

**Ordem:** Full → Lite; depende da frente 4 (cronograma) e da Fase 0.

---

## 8. Frente 6 — Receita/comissão da agência (regra por fornecedor/produto, bases e eventos)

**Requisito (fonte, linhas 9–15):** a agência **revende**; recebe **% sobre o total**, **% sobre parte** (taxas, tarifas…), **fixo por passageiro** (ônibus intermunicipal), **só taxas** (cruzeiro), **vários fornecedores com % distintos** (aéreo/pacotes); produto atrelado a fornecedor; fornecedor com configuração de comissão; direito, liberação e recebimento efetivo.

**Comportamento atual verificado**

- **Não existe receita da agência** em nenhum produto: o Lite só tem `seller_commissions` (vendedor) e o Full só `commission_entries`/`employee_commission_rules` (funcionário) — `COMMISSION-ENGINE-SPEC.md` §1; `employee-commissions.ts`. `TravelProduct.commissionPercent` do Full é **dado órfão** (§5). `SaleItem.commission` (Full) é campo numérico de item **[VERIFICADO tipo; semântica de uso não verificada]**.
- Bases de **funcionário**: Lite `GROSS|MARGIN`, `TOTAL|EXCESS`, progressivo (`commission-engine.ts:159-237`); Full `PRODUCT_TOTAL/PACKAGE_TOTAL/PER_PASSENGER/PER_TICKET/FIXED_PER_*` (`types.ts:787-795`). **Lite não tem fixo por passageiro**: `FIXED` é por venda (`commission-engine.ts:183-194`).

**Lacuna:** toda a frente (é novo domínio), nos dois produtos — **Full primeiro**.

**Desenho [PROPOSTA]**

**8.1 Regra de receita** (mesmo padrão COM-01: escopo + versões imutáveis + projeção de vigência; **não** reaproveitar tabelas de comissão de funcionário — são obrigações diferentes):

```sql
-- ILUSTRATIVO, NÃO EXECUTADO.
agency_revenue_scopes(id, scope_owner_id, supplier_id NULL, product_id NULL, category_id NULL, status, legacy_ref)
  -- precedência: produto+fornecedor > produto > fornecedor+categoria > fornecedor > categoria > padrão da agência
agency_revenue_rule_versions(id, scope_id, version_number, effective_from DATE, revised_at, revised_by, reason,
  mode            -- PERCENTAGE | FIXED_PER_PASSENGER | FIXED_PER_SALE | FIXED_PER_ITEM | NONE
  base_selector   -- LINE_TOTAL | NET_FARE | TAXES | FEES | TAXES_AND_FEES | MARGIN   (só p/ PERCENTAGE)
  value NUMERIC(14,4),
  entitlement_event,   -- ON_SALE_CONFIRMATION | ON_FULL_SETTLEMENT | ON_BALANCE_DEADLINE   (§10)
  settlement_policy_id,
  calc_version)
```

- **Bases elegíveis**: `base_selector` escolhe o componente do **item** (`SaleItem`): `LINE_TOTAL` = qty×preço−desconto+taxes+fees; `NET_FARE` = qty×preço−desconto; `TAXES`, `FEES`, `TAXES_AND_FEES`; `MARGIN`. Isso cobre "só taxas" (cruzeiro) sem hardcode. Fixo por passageiro usa `passenger_count` da venda/item.
- **Cálculo por item e por fornecedor** (aéreo com vários): `receita_item = round(base_item × taxa/100)` (half-up decimal-safe, D4); `receita_venda = Σ receita_item`; cada item é uma linha em `agency_revenue_entries` com **snapshot completo** (versão, base, taxa, memória de cálculo, `calc_version`). Itens sem fornecedor/regra aplicável → entrada `PENDING_RULE` (valor 0, **fora** de relatórios de receita reconhecida, igual padrão de comissão).
- **Entradas** `agency_revenue_entries(id, sale_id, sale_item_id?, supplier_id, rule_version_id, base_amount, rate_or_fixed, amount, status, entitled_at, batch_id?, received_amount, snapshot, legacy_ref)`; **estados**: `FORECAST` → `ENTITLED` → `AVAILABLE` (em lote/janela) → `RECEIVED` | `CANCELLED`. Transições só no servidor, uma função única de domínio, com auditoria.
- **Imutabilidade**: regra nova (futura) não altera entradas existentes; regra retroativa **não** nesta versão (mesma política do Lite `assertNotRetroactive`).
- **Arrecadação (D1)**: parâmetro `collection_model` por fornecedor/produto: `AGENCY_COLLECTS` (padrão proposto = comportamento atual do Lite: recebíveis do total + custos/pagáveis) ou `SUPPLIER_COLLECTS` (cliente paga ao fornecedor; agência só rastreia pagamento para fins de **direito** e recebe só a comissão). Sem essa escolha **não calcular fluxo de caixa**.
- **Permissões** (propostas): `revenue.rules_manage`, `revenue.read_all`, `revenue.receive`; Lite precisa de catálogo + migration + teste espelho (`ACCESS-CONTROL.md`).
- **Tenant/auditoria:** FKs compostas, RLS; eventos `AGENCY_REVENUE_RULE_CREATED/REVISED`, `AGENCY_REVENUE_CALCULATED`, `AGENCY_REVENUE_ENTITLED`, `AGENCY_REVENUE_RECEIVED`, `AGENCY_REVENUE_CANCELLED` (obrigatórios).

**Casos numéricos** (valores ilustrativos; **não** são da Gadotti)

| # | Cenário | Cálculo | Resultado |
| --- | --- | --- | --- |
| R1 | Excursão: total 1.000,00; 7%; `LINE_TOTAL` | 1.000 × 7% | **70,00** |
| R2 | Ônibus intermunicipal; fixo **por passageiro** (ex. 25,00); 4 passageiros | 25,00 × 4 | **100,00**; com 3 passageiros → 75,00 |
| R3 | Cruzeiro: 2 pax; tarifa 8.000,00; taxas 1.200,00; 10% só sobre `TAXES` (ex.) | 1.200 × 10% | **120,00** (≠ 920,00 que daria sobre o total 9.200 — erro de base evitado) |
| R4 | Aéreo c/ 3 fornecedores: A tarifa 2.000 @5%; B hotel 3.000 @12%; C seguro 150 @30% | 100,00 + 360,00 + 45,00 | **505,00** sobre venda 5.150,00 (3 entradas, 3 snapshots) |
| R5 | Item 333,33 @7% | 23,3331 | **23,33** |
| R6 | 18,50 @3% (meio centavo) | 0,555 | **0,56** (half-up; para **comissão de funcionário** vale o arredondamento atual de cada produto — Full 0,55 × Lite 0,56, F4) |
| R7 | Entrada sem regra para o fornecedor | — | entrada `PENDING_RULE`, 0,00, fora do reconhecido |

**Testes:** `agency-revenue-rules.test.ts` (seleção por precedência, vigência, sobreposição impossível, versões no mesmo dia), `agency-revenue-calc.test.ts` (R1–R7 como tabela; módulo **puro** compartilhado como `commission-calculation.ts`, com paridade Full×Lite), `agency-revenue-lifecycle.test.ts` (transições válidas/inválidas, concorrência, cancelamento), isolamento, auditoria com rollback.

**Ordem:** Full → Lite. Depende de: itens da venda (frente 3), condições/baixas (4–5), decisões D1/D3/D4. **Não** depende de COM-02/03, mas deve usar o padrão de versões da COM-01.

---

## 9. Frente 7 — Comissão do funcionário (distinta da receita da agência)

**Requisito (fonte, linha 15):** "duas linhas de comissão: a do funcionário e a da agência, dois ambientes de comissionamento".

**Verificado:** Lite — motor com regras versionadas, categorias, progressão e liberação `ON_SALE/ON_RECEIPT` (`commission-engine.ts`; spec §12). Full — motor por funcionário × produto com bases por item/passageiro e folha (`employee-commissions.ts`, `payroll.ts`); atribuição venda→funcionário e categorias **ainda não existem** (F1).

**Lacuna:** (a) separação formal e vínculo rastreável com a receita da agência; (b) paridade já em curso pela Fase 0/COM-01..03; (c) **fixo por passageiro** no Lite (Full tem `FIXED_PER_PASSENGER`) — é lacuna de **paridade existente**, não nova.

**Desenho [PROPOSTA]**

- **Ambientes separados**: telas, permissões, tabelas e relatórios próprios. Menu: "Comissões de funcionários" (existente) × "Receita da agência" (novo).
- **Vínculo rastreável opcional**: `commission_entries.agency_revenue_entry_id` / `seller_commissions.agency_revenue_entry_id` (nulo permitido), só para **análise** ("receita da venda − comissão do funcionário"), **sem netting**: a obrigação com o funcionário **não** depende de a agência já ter recebido o fornecedor (D3, padrão proposto: independente; a liberação existente por recebimento do **cliente** permanece como está).
- **Base futura** `AGENCY_REVENUE` para regra de funcionário (ex.: "30% da receita da agência") — **fora do escopo v1** (trilha), pois mistura os dois ambientes e cria dependência de recebimento; só com decisão humana.
- **Não duplicar despesa**: DRE usa a comissão do funcionário como despesa e a receita da agência como receita; a venda bruta não é receita (§2.1).
- Respeita F1–F4: atribuição Full necessária; `canal único`; arredondamento atual.

**Caso:** venda 1.000 · receita agência 7% = 70,00 · comissão do vendedor 3% sobre bruto = 30,00 · resultado derivado **40,00**; vendedor recebe 30,00 mesmo que o fornecedor ainda não tenha pago os 70,00 (D3 padrão).
Progressão (oráculo já aprovado): faixas 0–50 mil@3%, 50–100 mil@4%, 100 mil+@5%; acumulado 45.000 + venda 20.000 = **750,00**; 45.000 + 70.000 = **2.900,00** (`CALC-07/08`).

**Testes:** (adicionais aos da Fase 0) `revenue-commission-link.test.ts`: vínculo opcional, sem alterar valores, cancelamento de receita **não** cancela comissão automaticamente (sinaliza), relatório derivado correto; `fixed-per-passenger-lite.test.ts` (paridade).

**Ordem:** após Fase 0/COM-01..03 e frente 6. Full → Lite.

---

## 10. Frente 8 — Quitação e recebimento da comissão (por pacote, lotes, janelas; cartão × viajante × fornecedor)

**Requisito (fonte, linhas 11–13):** comissão só na **quitação**; cartão = à vista; no parcelado, até X dias antes do embarque; a agência informa se a comissão é paga **por pacote quitado**, **em lotes** ou **janelas de datas**.

**Verificado:** não existe nenhum conceito de lote/janela; `payment_methods` só tem `requires_receipt` (comissão de **funcionário**) — `011:18`; recebível de venda é do **cliente**.

**Lacuna:** toda a frente.

**Desenho [PROPOSTA]**

1. **Evento de direito** (`entitlement_event` da regra, §8 da regra de receita, frente 6): `ON_SALE_CONFIRMATION` · `ON_FULL_SETTLEMENT` (quitação total da venda) · `ON_BALANCE_DEADLINE` (data limite do saldo). Direito = a entrada passa de `FORECAST` a `ENTITLED`, com `entitled_at`. **Não** é dinheiro recebido.
2. **Natureza da forma de pagamento** (aba "Formas de pagamento" ganha seção "Regra de recebimento", conforme pedido linha 8): `counts_as_settled_on_authorization` (cartão = à vista **para fins de direito**), `expected_cash_lag_days` (previsão de caixa; **só projeção**), e o `requires_receipt` **existente** (comissão do funcionário, **não confundir** — rotular na UI "libera comissão do funcionário só conforme recebimento"). Cartão **parcelado pelo viajante** é `schedule_kind=SINGLE` (frente 4).
3. **Política de recebimento do fornecedor** `revenue_settlement_policies(id, name, mode, window_kind, window_anchor, payout_day_offset)`: `PER_SALE` (cada entrada `ENTITLED` vira `AVAILABLE` na hora) · `BATCH` (agrupa por fornecedor e **janela**: semanal/quinzenal/mensal/intervalo configurável; **data de corte** = `entitled_at`). Sem calendário hardcoded.
4. **Lote** `agency_revenue_batches(id, supplier_id, window_start, window_end, expected_amount, received_amount, status OPEN|CLOSED|RECEIVED, closed_by, received_at, legacy_ref)`; fechar o lote congela as entradas; **recebimento efetivo** = registro de entrada em conta (`payments` IN ou equivalente) com alocação ao lote/entradas, valor, data, conta, referência. **Diferença** (`expected − received`) permanece **visível e aberta**; não há baixa automática por "perda".
5. **Cancelamento/estorno**: entrada `FORECAST/ENTITLED/AVAILABLE` → `CANCELLED` sem efeito financeiro; `RECEIVED` → **409** por padrão (D6); estorno de baixa do cliente que desfaz quitação **antes** do recebimento do fornecedor devolve a entrada a `FORECAST` (se `ENTITLED`); depois de `AVAILABLE` em lote fechado → bloqueia (409) e exige ajuste manual (fora da v1).
6. **Inadimplência/atraso do saldo**: venda com saldo vencido (limite do saldo ultrapassado) **não** vira `ENTITLED` por `ON_BALANCE_DEADLINE` sem quitação; fica sinalizada (`late`) — efeito exato **[AMBÍGUO]** (A6, D5).
7. **Autorização:** `revenue.receive` separada de `revenue.rules_manage`; fechar lote e registrar recebimento geram auditoria obrigatória; reautenticação opcional para recebimento > limite (SEC-01).
8. **Canal único**: uma entrada de receita pertence a **no máximo um lote** (`UNIQUE` parcial por `entry_id` ativo) — mesma lição de F3.

**Casos** (ilustrativos)

| # | Cenário | Resultado |
| --- | --- | --- |
| Q1 | venda 1.000, 7%; cartão `counts_as_settled=true`, evento `ON_FULL_SETTLEMENT` | direito **imediato na autorização do cartão**: `ENTITLED` 70,00; recebimento real só ao registrar o lote |
| Q2 | boleto parcelado; quitação em 04/12 (limite 05/12) | `ENTITLED` em 04/12; antes disso permanece `FORECAST` |
| Q3 | lote mensal de outubro: entradas 70,00 + 45,00 + 120,00 | `expected` **235,00**; fornecedor paga 220,00 → `received` 220,00, **diferença 15,00 aberta** |
| Q4 | cancelar venda com entrada `ENTITLED` | `CANCELLED`; sem estorno |
| Q5 | cancelar venda com entrada `RECEIVED` | **409** (D6) |
| Q6 | estornar baixa que quitava, entrada `ENTITLED` | volta a `FORECAST` |

**Testes:** `revenue-entitlement.test.ts` (Q1–Q2, Q6), `revenue-batches.test.ts` (janelas, corte por `entitled_at`, congelamento, diferença, unicidade de lote, concorrência de fechar/receber), `revenue-cancel.test.ts` (Q4–Q5), permissões e auditoria, isolamento.

**Ordem:** Full → Lite; depende das frentes 4–6.

---

## 11. Frente 9 — Relatórios e projeções

**Requisito (fonte, linhas 12 e 19):** relatórios e **projeções de recebimento de comissões** com filtros; data da venda, origem e destino em relatório.

**Verificado:** Lite — `GET /reports/sales|sellers|commissions|cash-flow|sale-costs`; filtros de venda: **período, vendedor, categoria, status** (`reports.ts:229-240`); sem origem/destino/fornecedor/forma de pagamento/embarque; CSV via `?format=csv` (`reports.ts:27-35,96-134`); limite `REPORT_LIMIT 50_000`. Full — `/financial/reports/{dre,overdue,margin,cash-flow}` (`routes/financial.ts:483-548`) e `/commissions/report`; **sem** filtros por origem/destino (sem esses campos na venda).

**Lacuna:** filtros novos, relatórios de receita da agência, saldos por fornecedor, projeção.

**Desenho [PROPOSTA]**

- **Filtros comuns** (todos os relatórios de venda/receita): `sale_date` (de/até), `travel_start_date`, `origin`, `destination` (texto, `ILIKE`/igualdade), `category_id`, `product_id`, `supplier_id`, `seller_id` (atribuição no Full), `payment_method_id`, `status`, `entitlement_status`, `batch_id`. Escopo por permissão idêntico ao existente (`sales_all/own`, `revenue.read_all`).
- **Relatórios novos**: (1) `/reports/revenue` (receita por período/fornecedor/categoria/estado); (2) `/reports/revenue-forecast` (projeção de recebimento da receita: por data prevista = `entitlement` + política de lote + janela; classes **CONTRATADO** (entrada `ENTITLED/AVAILABLE`), **PROJETADO** (`FORECAST` com data estimável), **INDEFINIDO** (sem data possível)); (3) `/reports/supplier-balances` (esperado × recebido × diferença por fornecedor/lote); (4) `/reports/receivables-projection` (recebíveis de clientes por vencimento, separando `late`); (5) comissões de funcionário **inalterados**, só ganham filtros novos.
- **Projeção — regras**: usa **somente** dados do servidor; `expected_cash_lag_days` é previsão; **nunca soma receita de entradas `PENDING_RULE`**; separa valores **vendido (meta)** × **receita** × **repasse** × **comissão de funcionário** em colunas distintas (sem soma total que dupla-conte); total de projeção por moeda/mês.
- **Performance/limites**: paginação + índices em `(tenant, sale_date)`, `(tenant, supplier_id, status)`, `(tenant, travel_start_date)`; manter `REPORT_LIMIT`; sem N+1.
- **CSV**: seguir o contrato do CSV-01 (OpenCode) — **não** especificar CSV aqui; relatórios novos adotam o mesmo formato/escape quando CSV-01 for consolidado.
- **Segurança**: relatório respeita escopo de carteira; sem dados pessoais de passageiros; filtros de texto parametrizados.

**Casos:** (1) filtro destino "Gramado" e `sale_date` out/2026 → só vendas daquele destino/mês; (2) projeção: 3 entradas `ENTITLED` (70, 45, 120) em janela mensal fechando 31/10 com `payout_day_offset=+10` → previsão 10/11 = **235,00** CONTRATADO; (3) vendedor `read_own` vê só as próprias; (4) entrada `PENDING_RULE` não aparece em receita nem projeção.

**Testes:** `reports-revenue.test.ts`, `reports-forecast.test.ts` (tabela de datas × política), escopo/permissão, `reports-filters-origin-destination.test.ts`, UI `ReportsFilters.test.tsx`.

**Ordem:** Full → Lite; filtros de origem/destino/data da venda podem sair **assim que a frente 3 (campos de 1ª classe) estiver pronta**; projeções só depois de 6/8.

---

## 12. Frente 10 — Organização da configuração (abas) e seleção na venda

**Requisito (fonte, linha 17):** ambiente em **abas**; cada aba configura um aspecto com seus valores; na venda o usuário aponta o que se aplica.

**Verificado:** Lite já tem página **Cadastros com abas** (`CatalogPage.tsx:317-361`: categorias de venda, favorecidos, contas, categorias financeiras, formas de pagamento…) e página própria `/regras-comissao` (`menu.ts`); permissões por menu (`menu.ts`). Full: `SettingsPage` (agency/team/notificações) e telas de cadastro dispersas (`CategoriesPage`, `SuppliersPage`, `CommissionPlansPage`) — **organização única não verificada em detalhe**.

**Desenho [PROPOSTA]** — "Cadastros" (Lite) / "Configurações > Vendas e finanças" (Full), com as abas, **cada uma entregue junto com a onda da sua frente** (não tudo de uma vez):

| Aba | Frente | Permissão |
| --- | --- | --- |
| Cliente (campos) | 2 | `customers.fields_manage` |
| Categorias e formulário | 3 | `catalog.manage` |
| Produtos | 3 | `catalog.manage` |
| Fornecedores | 3/6 | existente (`settings.manage` Lite / papel Full) |
| Condições de pagamento | 4 | `payment_conditions.manage` |
| Formas de pagamento (regra de recebimento) | 4/8 | `settings.manage` |
| Receita da agência (regras) | 6 | `revenue.rules_manage` |
| Recebimento de receita (políticas/lotes) | 8 | `revenue.rules_manage`/`revenue.receive` |
| Comissão de funcionários | 7 | `commissions.rules_manage` (existente) |

- **Venda**: ao escolher categoria/produto, o servidor retorna **apenas as opções aplicáveis** e uma **pré-visualização somente leitura** (`POST /sales/preview`: cronograma, receita prevista, comissão prevista; sem gravar). O usuário seleciona entre opções configuradas; **não** digita taxa, base ou prazo. Escolhas ficam no snapshot da venda.
- **Plano/capacidade (Lite)**: respeitar `planCapabilities.ts` (recursos por plano) — **não verificado** como cada aba entra no plano; decisão de produto na consolidação.
- **Ajuda/Manual**: atualizar `helpContent.ts` e manual do usuário (Lite) a cada aba (AGENTS.md exige doc atualizada).
- **Sem hardcode Gadotti**: nenhuma aba, preset ou texto cita a Gadotti; exemplos só em fixtures/manual.

**Testes:** `settings-tabs.test.tsx` (visibilidade por permissão, rota inacessível sem permissão, API continua autoridade), teste de que a venda **não** aceita campo de regra vindo do cliente (mass-assignment: `rate`, `base`, `deadline` → 422).

**Ordem:** incremental junto com cada onda; Full primeiro.

---

## 13. Ordem de entrega consolidada (Full primeiro, depois Lite)

**Onda 0 — pré-requisitos (sem código desta spec):** Fase 0 mergeada (outra sessão); decisões humanas D1–D7 (§14); ADRs: (a) parcelamento real de recebíveis no Full, (b) domínio "receita da agência", (c) formulário configurável/registro de campos; atualização da decisão D5; consolidação BASE (Codex); conferência dos textos legais (§4).

| Onda | Conteúdo | Full | Lite | Depende de |
| --- | --- | --- | --- | --- |
| A | Frente 1 (lookup) | endpoint+UI | normalizar CPF + endpoint + UI | nada |
| A | Frente 2 (campos de cliente) | tabela+API+aba | idem | SEC-01 (nome da permissão) |
| B | Frente 3 (categoria/perfil/campos 1ª classe/sale_date/itens/produtos) | categoria configurável (F1), `sale_date`, campos | itens, produto, perfil | Fase 0, F1 |
| C | Frentes 4+5 (condições, cronograma, saldo, baixa) | ADR + migration de recebíveis | condições + serviço | B, Fase 0, D2/D5 |
| D | Frente 6 (+7 vínculo) | domínio receita | idem | B, C, D1/D3/D4 |
| E | Frente 8 (direito, políticas, lotes, recebimento) | tudo | tudo | D, D6/D7 |
| F | Frente 9 (relatórios/projeções) | relatórios | relatórios | D, E (filtros de origem/destino já na B) |
| ∥ | Frente 10 (abas) | com cada onda | com cada onda | — |

Em **cada onda**: (1) testes de caracterização/vermelhos → (2) Full backend + testes → (3) Full UI + testes → (4) matriz de paridade → (5) Lite backend + testes → (6) Lite UI → (7) `lint`, `typecheck`, `test`, `test:db` (banco descartável autorizado), `build`, `secrets:scan`, `migrations:validate` → (8) revisão Codex → (9) validação local com o usuário. **Deploy/migration em ambiente da Gadotti exigem autorização específica** (registro, passo 4).

---

## 14. Decisões humanas indispensáveis (lista curta — 7)

Cada uma tem padrão proposto e consequência. Nada abaixo foi decidido.

| # | Decisão | Padrão proposto | Consequência se errar |
| --- | --- | --- | --- |
| **D1** | **Quem recebe o dinheiro do cliente**: a agência cobra o total e repassa ao fornecedor, ou o cliente paga ao fornecedor e a agência só recebe comissão? Pode variar por fornecedor/produto? | parâmetro por fornecedor/produto; padrão `AGENCY_COLLECTS` (= Lite hoje) | projeções de caixa, receivables e "margem" ficam incorretos; refazer cronograma |
| **D2** | **Entrada obrigatória** bloqueia a confirmação da venda ou só sinaliza e bloqueia o direito de receita? | não bloqueia; sinaliza (`down_payment_pending`) e bloqueia o direito | venda confirmada sem entrada pode gerar reserva sem lastro; ou, se bloquear, travar vendas no balcão |
| **D3** | **Comissão do funcionário depende do recebimento da receita pelo fornecedor?** | não (independente; mantém liberação por recebimento do **cliente**, F2 pendente) | agência paga funcionário antes de receber (risco de caixa) × funcionário espera o fornecedor |
| **D4** | **Arredondamento da receita da agência** (módulo novo) | half-up decimal-safe, por item (= `roundMoney` do Lite); comissão de funcionário segue F4 | diferenças de centavos entre produtos |
| **D5** | **Embarque alterado / saldo em atraso**: recalcular cronograma e direito? | não automático; "revisar condição" com motivo e auditoria; atraso só sinaliza | cronogramas inconsistentes ou recálculo silencioso de dinheiro |
| **D6** | **Cancelar/estornar com receita já recebida do fornecedor** | bloquear (409); sem clawback automático | receita indevida mantida ou estorno automático perigoso |
| **D7** | **Lotes/janelas**: calendário e corte | janela configurável por política; corte por `entitled_at`; pagamento previsto por `payout_day_offset`; sem padrão fixo | previsão de caixa errada; lotes com cortes divergentes do fornecedor |

**Também pendente de confirmação humana (já existente, não resolvido aqui):** F2 (fonte de "exige recebimento"); o relato desta rodada **sugere** forma de pagamento, mas não confirma.

### Regras ambíguas (não bloqueantes; padrão técnico proposto)

| ID | Ambiguidade | Padrão proposto |
| --- | --- | --- |
| A1 | Mudar obrigatoriedade de campo de cliente: valida só campos tocados no PATCH ou o registro inteiro? | só campos tocados |
| A2 | Importação/migração aplicam obrigatoriedade? | importação aplica (relatório de rejeições); migração preserva histórico |
| A3 | Criar cliente com CPF existente em outra carteira (409 revela existência) | mensagem genérica de conflito; revisar com SEC-01 |
| A4 | Origem/destino: texto livre ou lista normalizada? | texto livre + sugestões; normalização depois |
| A5 | Juros em parcelamento (CDC art. 52 exige informar taxa) | v1 só sem juros; condição com juros bloqueada |
| A6 | Atraso do saldo afeta o direito da receita? | não; sinaliza e exibe em relatório |
| A7 | Cartão `SINGLE` com chargeback | tratar como estorno de baixa (frente 5/8) |
| A8 | Receita de item sem fornecedor | `PENDING_RULE` |
| A9 | Venda com vários vendedores/fornecedores no Lite | Lite mantém 1 vendedor/venda; fornecedores por item |
| A10 | Política de cancelamento/arrependimento automática | **não** automatizar; parecer jurídico (§4.3) |

---

## 15. O que NÃO foi verificado nem executado

- **Nada foi executado**: nenhum teste (os propostos não existem), gate, DDL, consulta a banco, `.env`, acesso online, migração, deploy, commit ou push. Nenhum arquivo existente foi editado; apenas este arquivo foi criado.
- **Fontes legais**: Planalto (Lei 11.771, CDC, Decreto 7.962) recusou conexão; art. 31/49/52 do CDC e Cadastur vêm de fontes secundárias/trechos — **reconfirmar**. Não confirmei: regra de lista de passageiros do fretamento (ANTT), taxa oficial de cruzeiro, versão digital atual da FNRH, vigência da Portaria MTur 38/2021 após 2021.
- **Código não lido por completo**: `services/api/src/financial.ts` (só trechos), `employee-commissions.ts` (só trechos e relatórios de outra sessão), `apps/agency` (organização de configurações), `sales-analytics.ts` do Lite (campos exatos de filtro além do objeto retornado), `planCapabilities.ts` (impacto de plano), `reports.ts` do Full. A existência do endpoint `GET /commissions/channel-conflicts` e da migration 100 foi observada, mas pertence à Fase 0 em andamento.
- **Não verificado em banco**: versão do PostgreSQL, extensão `unaccent`, aceitação da DDL ilustrativa (inclusive enums e índices parciais), RLS das tabelas propostas.
- **`SaleItem.commission` do Full**: tipo verificado; semântica de uso não verificada.
- **Estado da árvore**: li arquivos com alterações **não commitadas** de outras sessões; números de linha podem mudar.
- **Não foi consultado** nenhum dado real da Gadotti; os exemplos numéricos são do registro (parametrizados) ou ilustrativos meus.
- A **revisão do Codex não ocorreu**; este documento exige revisão antes de qualquer implementação. **Implementação continua em HOLD.**
