# Offer & Growth implementation roadmap

Este roadmap define ondas futuras. Ele nao autoriza implementacao nesta etapa.

## Global constraints

- Documentation-first nesta etapa.
- No runtime implementation.
- No migrations.
- No schema changes.
- No merges.
- Nenhum status deve ser marcado como IMPLEMENTED por estes documentos.

## Wave 1 - Domain foundation

Objetivo: fechar entidades, ownership, permissions e contratos de persistencia.

Inclui:

- ExternalOfferCapture -> Offer boundary;
- Asset/AssetSource/AssetMetadata;
- OfferContent contract;
- Campaign/Publication conceitos;
- Coupon conceitos;
- Engagement/Attribution conceitos;
- Entitlement/RBAC policy mapping;
- security/RLS requirements.

Dependencias:

- ADR-OFFER-GROWTH-001 aceito;
- decisao sobre assets globais vs agency-owned;
- decisao sobre nomenclatura final de status.

## Wave 2 - Creative Studio foundation

Objetivo: template schema, blocks, slots, binding resolver, Brand Kit e renderer
basico sem canais externos.

Inclui:

- Template;
- TemplatePage;
- Block;
- Slot;
- Binding;
- AgencyBrandKit;
- creative snapshot;
- renderer interno para formatos V1.

Dependencias:

- Wave 1;
- contrato OfferContent aprovado;
- decisao de formatos iniciais.

## Wave 3 - Campaign/Publication

Objetivo: criar campanhas, associar ofertas, gerar snapshots e agendar
publicacoes internas.

Inclui:

- Campaign lifecycle;
- Publication lifecycle;
- snapshot/version preservation;
- approval opcional;
- Customer Portal/Website como canais internos quando aplicavel.

Dependencias:

- Wave 2;
- entitlement `CAMPAIGNS`;
- RBAC `campaign.*`.

## Wave 4 - Automation/Coupon

Objetivo: suportar keyword automation e cupons com deduplicacao.

Inclui:

- triggers `COMMENT_KEYWORD` e `DIRECT_MESSAGE_KEYWORD`;
- actions `PUBLIC_REPLY`, `PRIVATE_MESSAGE`, `CREATE_COUPON`, `SEND_COUPON`,
  `CREATE_OPPORTUNITY`, `ASSIGN_AGENT`, `CREATE_FOLLOWUP`;
- Coupon, CouponGrant, CouponRedemption;
- execution audit;
- cooldown e max executions.

Dependencias:

- Wave 3;
- entitlement `SOCIAL_AUTOMATION`;
- policy para coupon limits.

## Wave 5 - Channel connector adapters

Objetivo: conectar canais atraves do contrato generico, sem mover logica
comercial para os canais.

Inclui:

- registry de ChannelConnector;
- capability checks;
- configuracao segura por agencia;
- ingestion de Engagement;
- adapters internos antes de APIs externas quando necessario.

Dependencias:

- Wave 4;
- decisoes de secrets/config;
- decisao humana para cada provedor externo.

## Wave 6 - Analytics

Objetivo: medir funil e conversao por Campaign, Offer, Publication, Creative,
Channel e Automation.

Inclui:

- RAW PLATFORM METRICS;
- INTERNAL CONVERSION METRICS;
- attribution chain;
- aggregates tenant-safe;
- dashboards futuros.

Dependencias:

- Waves 3 a 5;
- definicao de metricas entregues por cada conector;
- decisao sobre margem e revenue source of truth.

## Human decisions required

1. Se assets podem ser globais/plataforma ou somente agency-owned no primeiro
   ciclo.
2. Quais formatos do Creative Studio entram primeiro: `SINGLE`, `CAROUSEL`,
   `STORY`, `FEED` ou `LANDING_BLOCK`.
3. Quais canais internos entram antes de conectores externos: Website,
   Customer Portal ou email interno.
4. Se approval sera opt-in por agencia ou controlado por feature entitlement.
5. Como margem sera calculada para analytics quando custos ainda forem
   incompletos.
6. Quais provedores externos terao prioridade depois do contrato: Meta,
   WhatsApp, email, Google ou outro.

## Readiness matrix

| Area | Status |
|------|--------|
| Offer & Growth Engine Architecture | READY |
| Domain Model | READY |
| Creative Studio Contract | READY |
| Campaign | READY |
| Publication | READY |
| Channel Connector | READY |
| Automation Engine | READY |
| Coupon Engine | READY |
| Entitlements | READY |
| Attribution | READY |
| Security Contract | READY |
| Implementation Waves | READY |
