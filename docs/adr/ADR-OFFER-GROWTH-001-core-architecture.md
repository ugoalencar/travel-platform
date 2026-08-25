# ADR-OFFER-GROWTH-001 - Offer & Growth Engine core architecture

## Status

Proposto

## Contexto

Travel Platform ja possui Pescador manual, Offer, Proposal, Sale, Commercial
Cockpit, Customer 360, Financial Foundation e Customer Portal como partes do
fluxo comercial. O proximo ciclo precisa definir a engrenagem central que liga
aquisicao de ofertas, producao criativa, campanhas, publicacao, automacao,
cupons, oportunidades, propostas, vendas e analytics sem entregar a logica
comercial a canais externos.

Instagram, Facebook, WhatsApp, site, email, Customer Portal e canais futuros
devem ser conectores. Eles nao devem possuir regras de proposta, venda,
atribuicao, cupom, oportunidade ou tenant isolation.

Este ADR e documentation-first. Ele nao altera runtime, migrations,
`schema.prisma`, APIs ou UI.

## Decisao

Criar o dominio conceitual **Offer & Growth Engine** como uma camada modular
tenant-scoped que orquestra:

```text
Pescador
  -> ExternalOfferCapture
  -> Human Review
  -> Offer
  -> OfferContent + Asset
  -> Creative Studio
  -> Campaign
  -> Publication
  -> Channel Connector
  -> Engagement
  -> Automation
  -> Coupon
  -> CommercialOpportunity
  -> Proposal
  -> Sale
  -> Analytics
```

O engine fica dividido em contratos:

- Offer Acquisition: captura externa bruta nunca e publicada diretamente.
- Asset Library: imagens, videos, logos, icones e documentos reutilizaveis.
- Creative Studio: templates estruturados, slots, bindings e renderers.
- Campaign/Publication: campanha e publicacao sao entidades separadas de Offer.
- Channel Connector: interface generica para canais externos e internos.
- Engagement/Attribution: cadeia de origem ate oportunidade, proposta e venda.
- Automation/Coupon: gatilhos, deduplicacao, acoes e cupons mensuraveis.
- Entitlements/RBAC: Super Admin libera features; agencia controla permissoes.
- Analytics: separa metricas brutas de plataforma de conversao interna.

## Principios

1. Offer e a oferta comercial oficial da agencia; captura externa e insumo.
2. Publication preserva snapshot do conteudo publicado.
3. Templates nao conhecem Pescador, Customer, Booking, Supplier ou operacao.
4. Conectores nao contem logica comercial.
5. Automacao e orientada por eventos e regras; IA futura e capability opcional.
6. Entitlements sao plataforma; RBAC e permissao interna da agencia.
7. Toda entidade tenant-owned exige `agencyId`, FKs tenant-safe, RLS esperado e
   auditoria adequada.
8. A arquitetura deve permitir extrair Creative Engine, Template Schema,
   Renderer, Asset abstraction, Channel Connector contract e Automation
   primitives futuramente.

## Consequencias positivas

- Evita acoplamento entre marketing, CRM, vendas e canais externos.
- Preserva historico do que foi publicado e visto pelo cliente.
- Permite adicionar canais sem reimplementar funil comercial.
- Prepara monetizacao por feature/limite sem espalhar `plan === X`.
- Mantem Creative Studio reutilizavel fora do dominio turismo.

## Consequencias negativas

- Aumenta o numero de conceitos antes da implementacao.
- Exige disciplina para nao transformar Campaign ou Connector em CRM paralelo.
- Exige decisao futura sobre quais metricas cada canal realmente entrega.
- Exige migracoes posteriores bem ordenadas quando a implementacao iniciar.

## Alternativas consideradas

### Boolean `Offer.published`

Rejeitado. Um boolean nao preserva canal, agenda, snapshot criativo, status,
historico de preco nem atribuicao por publicacao.

### Conectores com logica propria por canal

Rejeitado. Duplicaria funil comercial, enfraqueceria tenant isolation e tornaria
impossivel comparar canais.

### Canva clone

Rejeitado para V1. O objetivo e editor estruturado por componentes, nao um
canvas generico completo.

### Automacao baseada obrigatoriamente em IA

Rejeitado. Gatilhos por keyword, mensagem, formulario, clique, QR e cupom devem
funcionar sem IA. IA futura entra como capability adicional.

## Nao objetivos V1

- crawler de producao;
- Meta API;
- WhatsApp API;
- AI bot;
- payment gateway;
- GDS;
- GPS;
- native mobile;
- push;
- Canva clone;
- generic Zapier clone.

## Criterio de aprovacao

Este ADR esta pronto para revisao humana. Depois de aceito, deve orientar as
ondas de implementacao descritas em `docs/offer-growth/implementation-roadmap.md`.
