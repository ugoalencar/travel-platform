# Relatório — Consulta de CEP no cadastro de clientes do Travel Lite

Data: 2026-10-22
Agente: OpenCode
Prompt: `.opencode/NEXT-PROMPT-LITE-CEP-2026-10-22.md`
Branch observada: `wip/organizacao-2026-10-20` (checkout `D:/travel-platform`), git status contendo apenas os arquivos de coordenação/prompts desta rodada; nenhum arquivo foi modificado além deste relatório.
Natureza: **documental (HOLD para implementação)**. Nenhum código, teste, migração, dependência, `.env` ou servidor foi alterado/iniciado.

## Resumo executivo

1. Hoje o CEP do Lite é **100% manual**: campo livre no formulário de
   cliente, sem máscara, sem consulta a provedor, sem validação de
   formato (nem no frontend, nem no backend). O campo existe e é
   persistido, mas **não existe nenhuma consulta de endereço
   implementada** — CEP armazenado ≠ consulta de CEP.
2. A **fonte oficial** (API Busca CEP dos Correios) existe, é REST/HTTPS
   e retorna rua/bairro/cidade/UF por CEP — mas **exige contrato
   comercial PJ com o serviço "API BUSCA CEP" (código 86738) habilitado
   e token gerado via CWS**; homologação só é liberada após produção.
   Nenhum acesso contratado foi confirmado → **bloqueio** para uso
   oficial nesta etapa.
3. **ViaCEP** foi verificado como alternativa gratuita sem autenticação
   (opção para decisão humana; não é oficial Correios, não tem SLA e
   avisa que uso massivo pode bloquear acesso — cache/rate-limit são
   obrigatórios). Nenhum provedor terceiro foi escolhido ou assumido.
4. Proposta: **adaptador backend único** (proxy com URL fixa, timeout,
   rate-limit, validação de resposta, sem SSRF) + UX de preenchimento
   assistido com regras anti-sobreposição e resposta atrasada descartada.
   Cadastro manual **nunca** fica bloqueado por indisponibilidade do
   provedor.

---

## 1. Diagnóstico atual (com evidência de arquivo:linha)

### Frontend (`apps/travel-lite`)

- Formulário do cliente é inline em `CustomersPage.tsx` (não há
  componente de formulário separado)
  (`apps/travel-lite/src/pages/CustomersPage.tsx:54`, `:219-395`).
- Campos opcionais incluem `zip_code, street, number, complement,
  neighborhood, city, state`
  (`CustomersPage.tsx:7-21`); estado inicial vazio
  (`CustomersPage.tsx:42-47`).
- Campo CEP: `<input>` com `placeholder="00000-000"` e apenas
  `maxLength={12}`; `onChange` grava o valor bruto — **sem máscara, sem
  regex, sem consulta** (`CustomersPage.tsx:271-279`).
- Único campo obrigatório do formulário é "Nome"
  (`CustomersPage.tsx:225-231`).
- Envio: `POST /customers` ou `PATCH /customers/:id` via `api()`;
  opcionais em branco omitidos na criação e enviados como `null` na
  edição (limpa) (`CustomersPage.tsx:137-157`).
- Cliente HTTP `apps/travel-lite/src/api.ts`: fetch relativo
  `/api${path}` (`api.ts:99`), token Bearer de sessionStorage
  (`api.ts:77-79`), **sem timeout/AbortController** (`api.ts:87-99`).
- Não existe `src/lib/` neste app (o prompt sugeriu `src/lib`; os
  helpers reais ficam em `src/` — `api.ts`, `branding.ts`, etc.).
- **Não existe `viacep|correios|postal` em nenhum código-fonte** de
  `apps/*/src` e `services/*/src` (busca case-insensitive nesta rodada):
  zero integração de consulta de CEP em todo o repositório.

### Backend (`services/api-lite`)

- Rotas de clientes: `GET/POST/PATCH/DELETE /customers`
  (`services/api-lite/src/routes/customers.ts:109-361`), todas com
  `protectedHooks` (autenticação + contexto de tenant, `app.ts:103-105`).
- Persistência do CEP: POST valida apenas `optionalString(..., { max: 12 })`
  (`customers.ts:212`); PATCH passa `zip_code` por loop genérico com
  `max: 254` (`customers.ts:262-276`) — **assimetria**: 12 chars na
  criação, 254 na edição. Nenhuma validação de formato (contrastar com
  CPF: `isValidCpf` + unicidade por tenant, `customers.ts:85-102`).
- Colunas `zip_code, street, number, complement, neighborhood, city,
  state` são `TEXT` anuláveis, sem índice/unicidade
  (`infrastructure/migrations-travel-lite/001_initial_schema.sql:75-81`,
  `:93-94`).
- Única chamada HTTP externa existente no api-lite: e-mail via Resend
  (`services/api-lite/src/email.ts:72-82`, fetch simples **sem
  timeout**) — é o padrão mais próximo reutilizável, ainda sem
  abstração de adaptador.
- Não há utilitário genérico de timeout outbound; há rate-limit por
  requisição (`createLiteRequestRateLimitHook`,
  `services/api-lite/src/rate-limit.ts:138-191`).
- Config (`services/api-lite/src/config.ts:11-18`): apenas
  `nodeEnv/host/port/databaseUrl/migrationsDatabaseUrl/frontendDistDir`.

### PWA / rede

- Service worker `public/sw.js` **nunca intercepta `/api/*`** (`sw.js:8-11`,
  `:57-58`); offline só para shell/navegação. Logo, indisponibilidade
  de provedor sempre aparece como fetch rejeitado no `catch` da página.

### Importação (fora do fluxo de consulta)

- Import CSV/XLSX mapeia coluna `zip_code` sem validação de formato
  (`services/api-lite/src/routes/imports.ts:221`, `:321-332`,
  `:638-654`; rótulo "CEP" em
  `apps/travel-lite/src/pages/ImportDataPage.tsx:41`). A proposta abaixo
  **não altera** a importação em massa (v1).

## 2. Fonte oficial — API Busca CEP dos Correios (verificada em 2026-10-22)

URLs consultadas (sem raspar o Busca CEP interativo; sem burlar
contrato/autenticação; nenhuma chamada autenticada foi feita):

- Manual API Busca CEP:
  https://www.correios.com.br/atendimento/developers/manuais/manual-api-busca-cep
  (acesso 2026-10-22)
- Manual API Token:
  https://www.correios.com.br/atendimento/developers/manuais/manual-uso-da-api-token
  (v1.0, criado em 03/11/2025; acesso 2026-10-22)
- Swagger de produção (requer credenciais): https://cws.correios.com.br/
- Homologação: http://cwshom.correios.com.br/ (Swagger) +
  https://meucorreioshom.correios.com.br/

Fatos extraídos do manual oficial:

- **Escopo**: consulta de endereçamento por CEP (também localidades,
  bairros, unidades, lockers). REST, HTTPS, JSON.
- **Base/endpoint relevantes**: `https://api.correios.com.br/cep/v2/enderecos`
  (lista paginada, filtro `cep`) e `GET /cep/v2/enderecos/{cep}` para um
  CEP (o manual exibe grafias `enderecos` e `endereços`; a grafia
  canônica deve ser confirmada no Swagger do CWS após credenciais —
  ponto de atenção, não presumir).
- **Exemplo de resposta** (CEP 01001001): `cep, uf, localidade,
  logradouro, bairro, complemento, tipoCEP, numeroInicial, numeroFinal`.
- **`tipoCEP`** (chave para "CEP genérico"): 1=Localidade (município),
  2=Logradouro, 3=Promocional, 4=Caixa Postal Comunitária,
  5=Grande Usuário, 6=Unidade Operacional. `tipoCEP` ≠ 2 ⇒ o CEP não
  identifica rua (cidade/UF apenas).
- **Autenticação**: exclusivamente Bearer Token, obtido pela API Token
  (autenticação Basic no gerador):
  - `POST https://api.correios.com.br/token/autentica` (usuário idCorreios);
  - `POST /v1/autentica/contrato` (body `{"numero","dr"?}` — contrato);
  - `POST /v1/autentica/cartaopostagem`.
  Token expira; manual recomenda renovar antes do vencimento; risco de
  `429` documentado.
- **Exigências de credencial (item 3.2)**: conta PJ no Meu Correios;
  contrato comercial firmado (manual cita exceção "Clube Correios");
  contrato deve conter o serviço **API BUSCA CEP, código 86738**;
  criar código de acesso às APIs no CWS; gerar token com
  `/v1/autentica/contrato`.
- **Documentação completa dos endpoints**: somente no Swagger do CWS
  após permissões (item 5.1).
- **Homologação**: exige primeiro acesso em produção habilitado no
  contrato; depois pedir ao representante comercial a replicação do
  contrato em homologação. **Não há sandbox público gratuito.**
- **Suporte**: gestor comercial do contrato ou chamado via
  faleconosco (suporte ao cliente com contrato).
- **Preços**: não constam no manual; condições são comerciais.

### Bloqueio oficial

Nenhum contrato, código de serviço 86738, credencial CWS ou token foi
confirmado pelo usuário (e não foi buscado/provisionado nesta rodada).
Portanto: **a integração oficial está bloqueada** por dependência
comercial externa. Anunciar "consulta pelos Correios" antes disso seria
impróprio.

## 3. Alternativas gratuitas — apenas opções para decisão humana

Nenhuma destas foi aprovada; nenhuma é oficial Correios.

### ViaCEP (verificado em 2026-10-22)

- Site/docs: https://viacep.com.br/ · exemplo:
  https://viacep.com.br/ws/01001000/json/
- Gratuito, **sem autenticação**, JSON/XML/JSONP; 8 dígitos; CEP
  inválido ⇒ HTTP 400; CEP inexistente ⇒ JSON com `erro: true`.
- Resposta inclui `logradouro, bairro, localidade, uf, ibge, ddd` etc.
  Cidades sem logradouro cadastrado retornam sem `logradouro` (estado
  "genérico" natural).
- Aviso no próprio site: "Uso massivo para validação de bases de dados
  locais, poderá automaticamente bloquear seu acesso"; "Não
  distribuímos ou comercializamos bases de dados". Base declarada:
  1.608.415 CEPs em 21/10/2026.
- Sem SLA publicado, sem contrato, mantida por projeto de terceiros
  (fonte própria com atualização comunitária).

### Outras opções (não verificadas nesta rodada)

- BrasilAPI e similares agregadores comunitários existem; **não foram
  consultados** e não devem ser tratados como oficiais nem aprovados
  sem rodada própria de verificação + decisão humana.

Recomendação de postura (não de provedor): qualquer alternativa entra
atrás do **mesmo adaptador** e permanece **desabilitada por padrão** até
decisão explícita.

## 4. Desenho do adaptador backend (proposta)

Objetivo: uma única saída HTTP controlada; o frontend nunca vê chaves;
impossível explorar o servidor como proxy arbitrário (SSRF).

- **Interface** `CepLookupProvider` (novo arquivo proposto
  `services/api-lite/src/cep.ts`):
  `lookup(digits8: string): Promise<CepLookupResult>`.
- **Resultado normalizado interno**:
  `{ status: 'ok'|'not_found'|'generic', street?, neighborhood?, city?, state?, source: 'correios'|'viacep' }`
  (nomes em inglês internos; UI em pt-BR).
- **Provedores**:
  - `disabled` (padrão): endpoint responde `503` com mensagem estável
    ("consulta de CEP não habilitada") — ou rota nem registrada; decisão
    de contrato fica para o Codex.
  - `correios`: base URL **constante** `https://api.correios.com.br`
    + caminho fixo `/cep/v2/enderecos/{cep}`; Authorization Bearer com
    token obtido via API Token (login/senha/contrato em env vars do
    backend, com cache em memória do token até expirar, renovando
    antes do vencimento); `tipoCEP` 1/4/5 ⇒ `generic`.
  - `viacep`: base constante `https://viacep.com.br` + caminho fixo
    `/ws/{cep}/json/`; `erro: true` ⇒ `not_found`; sem
    `logradouro`/`bairro` ⇒ `generic`.
- **Anti-SSRF**: host nunca vem do usuário; entrada aceita apenas
  `^\d{8}$` após normalização; `fetch` com `redirect: 'error'`;
  sem proxy genérico.
- **Timeout**: `AbortController` com default 3s (chave de config
  proposta `TRAVEL_LITE_CEP_TIMEOUT_MS`) — a lacuna de timeout do
  `email.ts` não deve ser repetida.
- **Rate-limit por usuário/sessão** reutilizando o padrão
  `LiteMemoryRateLimitStore` (ex.: 10 consultas/min, a calibrar);
  resposta 429 com `retry-after` (padrão já existente em
  `rate-limit.ts:160-169`).
- **Validação da resposta**: schema mínimo manual (sem dependência
  nova): tipos, recorte de tamanhos compatíveis com as colunas
  (street 200, neighborhood/city 100, state 50), descarte de qualquer
  corpo não-JSON. Resposta malformada ⇒ erro controlado (nunca
  exceção vazando stack).
- **Privacidade**: requisição ao provedor contém **apenas o CEP**;
  nenhum nome, CPF, e-mail ou endereço completo sai do sistema.
  Logs: apenas CEP + status + provedor + duração — **sem dados
  pessoais** (mesmo padrão de log seguro de `email.ts:35-38`).
- **Cache (opcional, decisão humana)**: TTL 24h por CEP, em memória ou
  tabela futura; reduz risco de bloqueio no ViaCEP e latência.
- **Endpoint proposto** (novo módulo `routes/cep.ts`):
  - `GET /cep/lookup?cep=01001001` (e variante com prefixo `/api`,
    pelo duplo registro já existente em `app.ts:127-137`).
  - Autenticação: `protectedHooks`. Permissão: sugestão
    `customers.create` **ou** escopo de atualização
    (`customers.update_all|update_own`) — catálogo de permissões não é
    editável nesta rodada; fica como ponto de integração do Codex.
  - Retorno (contrato proposto):
    `HTTP 200 { status, street, neighborhood, city, state, source }`,
    `404 { error: 'cep_not_found' }`, `400` CEP malformado,
    `429` rate-limit, `503` provedor desabilitado/indisponível.
  - **Não persiste nada** em customers; não há efeito colateral.

## 5. UX proposta (frontend)

- Normalização: aceitar dígitos e formatar máscara `00000-000`
  enquanto digita; disparar consulta quando completar **8 dígitos**
  (debounce ~400ms + reprocessar no blur).
- Estados da consulta: **ocioso · carregando · preenchido · não
  encontrado · CEP genérico · erro (com botão "tentar novamente")**.
  Mensagens em pt-BR, discreto (não modal).
- **Número e complemento são sempre manuais** — nunca preenchidos pela
  consulta.
- Rua/bairro/cidade/UF **sempre editáveis** após o preenchimento.
- Preenchimento seletivo: na resposta, preencher **apenas campos
  vazios**; se um campo preenchido divergir do provedor, **não
  sobrescrever** — mostrar nota "valor difere do CEP consultado;
  ajuste manualmente se necessário".
- Abrir a edição de um cliente **não apaga endereço existente** nem
  dispara consulta sozinho; consulta só por ação do usuário (digitação
  completa/blur).
- Disponibilidade: erro/offline/timeout/429 **não bloqueiam** o
  cadastro manual — o formulário segue submetendo pelo caminho atual.
- Respostas atrasadas: cada consulta carrega um identificador de
  sequência local; resposta de CEP anterior (ou CEP já substituído no
  campo) é **descartada silenciosamente**; edição manual feita durante
  a consulta prevalece sobre a resposta.
- Importação em massa: inalterada nesta proposta.

## 6. Persistência e validação backend (proposta)

- Corrigir a assimetria: validação de formato de CEP em POST **e**
  PATCH (normalizado para `^\d{5}-\d{3}$` aceito também como 8 dígitos
  e armazenado com hífen), limitando PATCH a 12 chars — troca de
  validação, **sem migração** (colunas continuam TEXT).
- **CEP consultado não é endereço comprovado**: nenhum selo/campo de
  "verificado" na v1; o preenchimento assistido é conveniência, não
  auditoria.
- Registro de fonte: por enquanto **apenas em log operacional**
  (provedor + CEP + status). Coluna opcional futura
  (`address_lookup_source`) seria migração aditiva — listar como ponto
  de integração do Codex, não executar.

## 7. Mapa de arquivos propostos (não executado)

Backend:

- `services/api-lite/src/cep.ts` — novo: interface, provedores,
  normalização, timeout, validação.
- `services/api-lite/src/routes/cep.ts` — novo: rota acima.
- `services/api-lite/src/app.ts` — **ponto de integração Codex**:
  registrar `registerCepRoutes` no array `registrars`
  (`app.ts:108-125`).
- `services/api-lite/src/config.ts` — **ponto de integração Codex**:
  chaves novas (`TRAVEL_LITE_CEP_PROVIDER=disabled|correios|viacep`,
  `TRAVEL_LITE_CEP_TIMEOUT_MS`, `TRAVEL_LITE_CEP_RATE_LIMIT_PER_MIN`,
  credenciais Correios quando aplicável — somente backend).
- Catálogo de permissões / hook — **ponto de integração Codex**:
  definir permissão concedida (sugestão na seção 4).
- `services/api-lite/src/routes/customers.ts` — ajustar `max` de
  `zip_code` no PATCH (254→12) + formato comum POST/PATCH.

Frontend:

- `apps/travel-lite/src/cep.ts` — novo: `normalizeCepDigits`,
  `maskCep`, estados/labels pt-BR (puro, testável).
- `apps/travel-lite/src/pages/CustomersPage.tsx` — máscara, debounce,
  fluxo de estados, descarte de resposta atrasada, preenchimento
  seletivo.
- `apps/travel-lite/src/api.ts` — opcional: suporte a `AbortSignal`
  na chamada de lookup (sem quebrar usos atuais).
- `apps/travel-lite/src/helpContent.ts` — opcional: artigo "Consulta
  de CEP" (ponto de integração).

Nenhuma dependência nova é necessária (fetch nativo, como no `email.ts`).

## 8. Testes propostos (mocks; fixtures fictícios)

Frontend (`apps/travel-lite/src/cep.test.ts(x)` + extensão de
`App.test.tsx`/página):

1. CEP válido ⇒ rua/bairro/cidade/UF preenchidos; número/complemento
   intactos.
2. CEP inválido (7/9 dígitos, letras) ⇒ máscara corrige/bloqueia
   disparo; nenhuma chamada de rede.
3. CEP inexistente ⇒ estado "não encontrado"; campos preservados.
4. CEP genérico ⇒ aviso + preenchimento parcial (cidade/UF).
5. Timeout ⇒ estado erro + "tentar novamente"; botão salvar segue
   ativo.
6. Offline/rede caída ⇒ mesmo tratamento do timeout.
7. Resposta malformada vinda do backend (500/HTML) ⇒ erro controlado.
8. Respostas fora de ordem (CEP A responde depois do B) ⇒ resposta A
   descartada.
9. Edição manual durante a consulta ⇒ valores digitados prevalecem;
   abrir edição não limpa endereço nem dispara consulta.

Backend (`services/api-lite/tests/cep-lookup.test.ts`, mockando `fetch`
global — mesmo estilo dos testes existentes com provider/fetch
controlado):

- normalização `01001-000`/`01001000` ⇒ mesmo resultado;
- `status` ok/not_found/generic mapeados de cada provedor (fixture
  ViaCEP e fixture Correios com `tipoCEP: 1|2`);
- resposta malformada ⇒ 500 de domínio controlado (mensagem estável);
- provedor `disabled` ⇒ 503;
- rate-limit ⇒ 429;
- 401 sem token; SELLER autenticado consegue consultar (conforme
  permissão definida);
- SSRF: tentativas de entrada não-dígitos ⇒ 400 antes de qualquer
  fetch;
- (Correios, quando habilitado) token expirado ⇒ renovação mockada.

Fixtures: somente CEPs de exemplo públicos conhecidos (ex. 01001001) e
strings sintéticas — **zero clientes reais, zero credenciais**.

## 9. Critérios de aceite (para a futura implementação)

- Com provedor desabilitado, o comportamento atual é preservado e o
  endpoint informa indisponibilidade.
- Consulta preenche rua/bairro/cidade/UF e nunca toca em
  número/complemento.
- Cadastro manual funciona com provedor fora do ar ou offline.
- Resposta atrasada e edição manual nunca são sobrescritas.
- Nenhum dado pessoal trafega ao provedor nem aparece em logs.
- Frontend sem credenciais; backend sem URL configurável pelo usuário.
- `npm run lint`, `npm run typecheck`, testes do api-lite e do app
  travem os 10 cenários acima (gates de `QUALITY-GATES.md`).

## Arquivos lidos (somente leitura)

- `AGENTS.md`, `docs/AI_CONTEXT.md`, `QUALITY-GATES.md`,
  `.claude/COORDENACAO-LITE-FINANCEIRO-2026-10-22.md`.
- `apps/travel-lite/src/pages/CustomersPage.tsx`,
  `apps/travel-lite/src/api.ts`, `apps/travel-lite/src/menu.ts`,
  `apps/travel-lite/src/App.tsx`, `apps/travel-lite/src/helpContent.ts`,
  `apps/travel-lite/src/mobile.test.tsx`, `apps/travel-lite/src/App.test.tsx`,
  `public/sw.js`, `public/manifest.json`, `vite.config.ts`.
- `services/api-lite/src/routes/customers.ts`, `imports.ts`, `app.ts`,
  `email.ts`, `rate-limit.ts`, `config.ts`, `validation.ts`,
  `services/api-lite/tests/hardening.test.ts`,
  `infrastructure/migrations-travel-lite/001_initial_schema.sql`.
- Web (2026-10-22): manuais Correios (Busca CEP, API Token) e ViaCEP.

## Riscos

- ViaCEP: bloqueio por uso massivo (mitigação obrigatória: cache +
  rate-limit + debounce); sem SLA; terceiro não oficial.
- Correios: contrato pendente; token expira (renovação); 429 por
  requisição; grafia do path deve ser confirmada no Swagger do CWS.
- Dados de terceiros: só CEP sai do sistema; manter assim evita
  discussão de compartilhamento de dados pessoais.
- Assimetria atual 12/254 do `zip_code` é aceitação acidental de lixo
  em PATCH — corrigir junto.

## Bloqueios

- **Integração oficial Correios**: depende de contrato PJ com serviço
  86738 + código de acesso CWS + token; homolog exige produção antes.
  Nada disso confirmado → não implementar caminho `correios` como
  ativo.
- Escolha do provedor ativo é decisão humana (seção 3).

## Decisões pendentes (para o humano)

1. Provedor: Correios (após contrato), ViaCEP (imediatamente, com
   cache/rate-limit), outro (verificar antes) ou manter desabilitado.
2. Permissão do endpoint de consulta (sugestão: criar/editar cliente).
3. Cache: habilitar? TTL? memória vs tabela.
4. Limites numéricos de rate-limit e timeout (sugestões: 10/min, 3s).
5. Coluna `address_lookup_source` na v1 ou depois.
6. Confirmar no CWS (quando houver credencial) a grafia canônica do
   path e limites de requisição/token.
7. Artigo de ajuda dedicado: sim/não.

## Status

**HOLD para implementação.** Este relatório é documental; não autoriza
código, migração, instalação, commit nem escolha de provedor. O
encaminhamento dos demais relatórios (folha, comissões) e a
consolidação do desenho são do humano/coordenação
(`.claude/COORDENACAO-LITE-FINANCEIRO-2026-10-22.md`). Nenhuma mensagem
foi enviada a outros agentes.
