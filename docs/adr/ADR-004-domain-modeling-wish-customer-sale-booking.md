# ADR-004 — Modelagem de Wish, identidade do cliente e separação Sale/Booking

## Status

Aceito

## Aprovacao

Aprovado humanamente pelo Product Owner em 2026-08-17.

## Contexto

A modelagem definitiva do Prisma precisa fechar decisoes de dominio antes de
qualquer migration estrutural: o significado de Wish, a identidade do cliente
final, a separacao entre Sale e Booking, e os limites conceituais entre Offer,
Proposal, Sale, Booking e Trip.

Essas decisoes afetam diretamente o CRM da agencia, o portal/PWA do cliente, o
futuro app nativo, multi-tenancy, historico de viagens, desejos, ofertas,
propostas, vendas, reservas, comissoes e integracoes futuras. Sem essa base, o
schema pode misturar conceitos comerciais, operacionais e de autenticacao em
entidades erradas.

## Decisao 1 — Wish

Wish entra no V1.

Wish representa uma intencao estruturada de viagem do cliente, com estrutura
suficiente para virar um pedido comercial depois. Wish nao representa uma Offer,
uma Proposal, uma Sale, um Lead nem uma oportunidade comercial.

O Wish pertence a um Customer dentro de uma Agency. Ele deve ser tenant-scoped
por `agencyId`, e o cliente no PWA deve acessar somente seus proprios Wishes no
contexto da agencia correspondente.

Quem pode criar:

- o cliente final, pelo portal/PWA;
- usuarios autorizados da agencia, em nome do cliente.

Quem pode editar:

- o cliente final, enquanto o Wish estiver em estado editavel;
- usuarios autorizados da agencia, respeitando tenant ownership e regras de
  permissao.

Relacao com Customer:

- um Customer pode possuir varios Wishes;
- cada Wish pertence obrigatoriamente a um Customer.

Relacao com Offer:

- Wish pode orientar matching manual ou futuro matching automatizado com Offers;
- Wish nao deve depender diretamente de Offer no V1;
- relacoes persistidas de matching podem ser adicionadas depois, se necessario.

Ciclo de vida recomendado:

```text
ACTIVE
  -> MATCHED
  -> PROPOSED
  -> FULFILLED
  -> EXPIRED / CANCELLED
```

Campos V1 recomendados:

- `id`
- `agencyId`
- `customerId`
- `destination`
- `startDate`
- `endDate`
- `budget`
- `travelersCount`
- `notes`
- `status`
- `createdAt`
- `updatedAt`

Campos adiados:

- preferencias detalhadas;
- flexibilidade de datas;
- score de matching;
- origem do Wish;
- historico de matches;
- IA/automacao;
- vinculo direto persistido com multiplas ofertas.

## Decisao 2 — Identidade do cliente

Customer deve pertencer diretamente a uma Agency no MVP.

O identificador tecnico principal do cliente deve ser `customer.id` (UUID).
Email nao deve ser identificador tecnico principal. Email pode ser usado como
dado de contato e busca, mas deve ser mutavel.

Email nao deve ser globalmente unico. No MVP, email pode ser unico por agencia
quando existir, mas a identidade interna do cliente nao deve depender dele. CPF
pode ser unico por agencia quando existir. CPF e email podem ajudar
identificacao e deduplicacao de negocio dentro da Agency, mas nao devem criar
uma identidade tecnica nem uma identidade global.

Customer deve ser tenant-scoped por `agencyId`. A mesma pessoa pode existir em
varias agencias como registros separados. Historico multiagencia nao faz parte
do MVP.

Relacao com User/autenticacao:

- User representa usuario interno da agencia;
- Customer nao deve ser tratado como User da agencia;
- o cliente final deve ter uma identidade de login separada, chamada
  conceitualmente de `CustomerAccount`, vinculada ao Customer.

Comportamento no PWA:

- o cliente autentica pela identidade propria de cliente;
- a sessao resolve o Customer vinculado;
- o acesso deve ser limitado ao Customer e a Agency correspondentes;
- o frontend nao deve enviar `agencyId` como fonte de verdade.

Classificacao V1:

- CustomerAccount entra no V1 porque o portal/PWA do cliente tera area
  autenticada no primeiro MVP.

Compatibilidade com app nativo futuro:

- o mesmo modelo de Customer tenant-scoped e identidade de login do cliente pode
  ser usado pelo PWA e pelo app nativo;
- nao deve existir dominio especifico para cada frontend.

Implicacoes para futuro multiagencia:

- uma entidade global de pessoa ou relacionamento multiagencia pode ser avaliada
  futuramente;
- essa evolucao nao deve ser requisito do MVP.

## Decisao 3 — Sale vs Booking

Sale e Booking devem ser entidades conceitualmente separadas.

Sale e a camada comercial/financeira:

- registra venda;
- guarda valores, descontos e status comercial/financeiro;
- vincula cliente, usuario vendedor, broker quando existir e comissao;
- serve como base primaria para Commission.

Booking e a camada operacional:

- representa reserva operacional;
- guarda fornecedor, localizador, emissao, status de reserva e cancelamento
  operacional;
- pode existir antes da quitacao, dependendo da operacao e do fornecedor.

Cardinalidade recomendada:

- uma Sale pode possuir varios Bookings;
- cada Booking pertence a uma Sale;
- Booking pode representar servicos diferentes dentro da mesma venda.

Relacao com Commission:

- Commission pertence primariamente a Sale;
- rateios por Booking ou item podem ser avaliados futuramente, mas nao sao
  recomendacao V1.

Classificacao V1/V1.1:

- Sale entra no V1;
- Booking nao sera implementado no V1;
- Booking fica classificado como V1.1;
- a separacao conceitual deve permanecer documentada para evitar que Sale
  acumule responsabilidades operacionais.

Relacao com Trip:

- Trip representa a viagem concreta do cliente e serve como base para historico;
- Trip nao representa produto generico, pacote de catalogo nem Offer;
- Offer e aquilo que a agencia oferece;
- Proposal e condicao comercial direcionada a um Customer;
- Sale e negocio comercial fechado;
- Booking representa reservas operacionais vinculadas a execucao da viagem a
  partir do V1.1.

Implicacoes:

- pagamentos pertencem ao fluxo comercial/financeiro da Sale;
- cancelamentos podem ter dimensoes comerciais em Sale e operacionais em
  Booking;
- fornecedores, emissao e integracoes futuras/GDS pertencem ao lado operacional
  de Booking.

## Decisao 4 — Proposal

Proposal entra no V1.

Offer e uma oferta reutilizavel/interna da Agency. Proposal e uma proposta
comercial direcionada a um Customer.

Proposal deve permitir futuramente:

- condicoes especificas;
- preco negociado;
- validade;
- observacoes;
- historico da negociacao.

Este ADR nao define campos adicionais de Proposal alem da documentacao
conceitual.

Fluxo comercial:

```text
Wish
  -> matching
Offer
  -> Proposal
Proposal
  -> aceite
Sale
```

## Decisao 5 — Escopo V1, V1.1 e Futuro

V1 obrigatorio:

- Auth;
- Agency;
- Users;
- Customers;
- Brokers;
- CustomerAccount;
- Wish;
- Trips;
- Offers;
- Proposal;
- Sales;
- Commission;
- Dashboard.

V1.1:

- Booking;
- operacao detalhada de reservas;
- fornecedor/localizador/emissao;
- rateio de comissao por Booking.

Futuro:

- Pescador;
- matching automatico/IA;
- integracoes GDS;
- app nativo;
- historico multiagencia;
- pagamentos integrados.

## Fluxo conceitual

```text
Customer
Agency
  |-- Users
  |-- Brokers
  |-- Customers
  |     |-- CustomerAccount
  |     |-- Wishes
  |     |-- Proposals
  |     |-- Sales
  |     `-- Trips
  |
  |-- Offers
  `-- Sales

Wish
  `-- matching
        `-- Offer
              `-- Proposal
                    `-- Sale
                          |-- Commission
                          `-- Trip

V1.1:

Sale
  `-- Bookings

Trip
  `-- Bookings
```

Transicoes:

- `Customer -> Wish`: cliente ou agencia registra uma intencao estruturada de
  viagem.
- `Wish -> Offer`: agencia encontra uma oferta compativel por matching manual ou
  futuro matching automatizado.
- `Offer -> Proposal`: oferta reutilizavel vira proposta comercial direcionada a
  um cliente.
- `Proposal -> Sale`: cliente aceita e nasce a venda comercial/financeira.
- `Sale -> Commission`: comissao nasce primariamente da venda.
- `Sale -> Trip`: a venda pode originar uma Trip como viagem concreta do cliente
  e base de historico.
- `Sale -> Booking`: a partir do V1.1, a venda pode possuir varios Bookings.
- `Trip -> Booking`: a partir do V1.1, uma Trip pode agrupar varios Bookings
  operacionais.

## Pescador — Compatibilidade futura

O Pescador nao faz parte do modelo V1.

Nao adicionar proveniencia externa diretamente em Offer agora. A futura
captura/importacao deve possuir fluxo proprio. Uma oferta capturada externamente
deve passar por revisao humana antes de virar Offer interna da agencia.

A arquitetura nao deve impedir futuro matching entre captura/Offer e Wish, mas
este ADR nao modela nenhuma entidade do Pescador.

## Consequencias

### Positivas

- Mantem Wish simples e alinhado ao produto.
- Evita transformar email em identidade fragil do cliente.
- Preserva tenant isolation por agencia no MVP.
- Separa responsabilidades comerciais e operacionais entre Sale e Booking.
- Define Trip como viagem concreta do cliente e base de historico.
- Mantem o caminho aberto para PWA agora e app nativo futuro usando a mesma API.
- Evita acoplar o futuro Pescador diretamente a Offer.

### Negativas

- Exige revisao do modelo Prisma antes da migration definitiva.
- Introduz mais conceitos do que o schema atual possui.
- Pode exigir telas e fluxos separados para proposta, venda e historico.
- Exige alinhamento posterior do schema atual, que ainda trata Trip como pacote
  comercial.
- Historico multiagencia continua fora do MVP.

### Trade-offs

- Customer tenant-scoped e mais simples e seguro para o MVP, mas pode exigir
  evolucao futura para historico multiagencia.
- Separar Sale e Booking reduz ambiguidade, mas aumenta a modelagem operacional.
- Wish como intencao de viagem evita sobrecarga, mas exige outra estrutura para
  oportunidade/proposta quando necessario.
- Proposal e CustomerAccount fortalecem o PWA do cliente, mas ampliam o escopo
  originalmente documentado em DEC-002.
- Booking fica em V1.1 para preservar a clareza operacional sem sobrecarregar o
  V1.

## Impacto esperado no Prisma

Analise de impacto, sem alterar Prisma nesta etapa:

- adicionar model `Wish`;
- adicionar enum de status de Wish;
- revisar relacionamento `Customer -> Wish`;
- adicionar model `CustomerAccount`;
- adicionar model `Proposal`;
- revisar Customer;
- revisar Offer;
- revisar `Sale` para representar camada comercial/financeira;
- revisar `Commission` como conceito V1;
- revisar `Trip` para representar viagem concreta do cliente;
- preparar conceitualmente `Booking`, sem exigir model no schema V1;
- revisar tenant ownership;
- revisar relacoes e indices por `agencyId`;
- revisar RLS para novas tabelas quando forem adicionadas;
- revisar constraints para impedir associacoes cross-tenant.

## Seguranca e multi-tenancy

Customer, CustomerAccount, Wish, Offer, Proposal, Sale, Trip e Booking devem
respeitar tenant isolation por `agencyId` quando forem entidades persistidas no
dominio tenant-scoped. O acesso do cliente final deve ser resolvido por sessao
autenticada e vinculo ao Customer correto, nunca por email solto ou `agencyId`
informado pelo frontend.

Wish deve pertencer a uma Agency e a um Customer. Sale, Trip e Booking devem
preservar o mesmo tenant da Agency. Qualquer relacao entre Customer, Wish, Offer,
Proposal, Sale, Trip e Booking precisa impedir cross-tenant access.

RLS devera ser revisado quando os models forem adicionados, mas este ADR nao
redesenha RLS.

## Compatibilidade com cliente/PWA/mobile

As decisoes permitem:

```text
PWA agora
  -> mesma API
  -> app nativo futuramente
```

O dominio permanece compartilhado entre frontends. O PWA e o app nativo devem
consumir os mesmos conceitos de Customer, Wish, Proposal, Sale, Booking e Trip,
sem criar modelos especificos para cada frontend.

PWA do cliente entra no V1 com area autenticada. CustomerAccount entra no V1. App
nativo fica para futuro, consumindo a mesma API, o mesmo dominio e a mesma
identidade Customer/CustomerAccount.

## Alternativas consideradas

### Wish como oportunidade comercial

Nao recomendado. Oportunidade comercial nasce quando a agencia decide trabalhar
um desejo, nao no registro original da intencao do cliente.

### Wish como Offer ou vinculo obrigatorio com Offer

Nao recomendado. Offer e oferta interna da agencia. Wish deve existir antes e
independentemente de uma oferta compativel.

### Customer global desde o inicio

Nao recomendado. Historico multiagencia nao faz parte do MVP e a abordagem
aumentaria complexidade de LGPD, consentimento, deduplicacao e tenant isolation.

### Pessoa global + relacionamento AgencyCustomer no MVP

Nao recomendado para o MVP. Pode ser melhor no futuro, mas antecipa a
complexidade do historico multiagencia.

### Customer como User da agencia

Nao recomendado. User representa equipe interna da agencia. Cliente final deve
ter identidade de login separada.

### Sale = Booking

Nao recomendado. Mistura venda financeira com reserva operacional e dificulta
multiplos servicos, fornecedores, emissoes, cancelamentos e integracoes futuras.

### Booking como principal e Sale apenas informacao financeira

Nao recomendado para o MVP. O fluxo comercial da agencia nasce na venda; Booking
operacionaliza o que foi vendido.

### Trip como pacote/produto comercial da agencia

Rejeitado para a definicao vigente deste ADR. Trip passa a representar a viagem
concreta do cliente e base de historico. Produto comercial reutilizavel deve ser
tratado por Offer/Proposal, nao por Trip.

### Trip como viagem concreta do cliente

Aceito. Esta definicao foi aprovada humanamente pelo Product Owner para alinhar
Trip ao historico do cliente e preparar a futura relacao Trip 1:N Booking.

## Decisoes ainda abertas

Nenhuma decisao critica permanece aberta no escopo deste ADR.

## Criterio de aprovacao

Este ADR foi aprovado humanamente pelo Product Owner e mudou de `Proposto` para
`Aceito`.

Depois da aprovacao, ele deve ser usado como base para revisar:

1. domain model;
2. schema.prisma;
3. tenant ownership;
4. RLS;
5. migration 001.
