# Offer & Growth security contract

Este documento define requisitos. Ele nao altera RLS, policies, migrations,
schema ou runtime.

## Multitenancy

Toda entidade tenant-owned deve conter `agencyId` e deve ser protegida por:

- tenant context server-side;
- FKs tenant-safe;
- indices coerentes com `agencyId`;
- RLS como defesa em profundidade;
- auditoria para acoes sensiveis.

Entidades tenant-owned candidatas:

- ExternalOfferCapture;
- Asset;
- OfferContent quando persistido;
- Template quando agency-owned;
- Creative Document/Snapshot;
- Campaign;
- Publication;
- Channel configuration;
- Engagement;
- Automation;
- Automation execution;
- Coupon;
- CouponGrant;
- CouponRedemption;
- analytics aggregates tenant-owned.

## Entitlements

Entitlements sao controlados por plataforma. Agency users nao podem habilitar
features por API propria.

Regras:

- checar entitlement antes de capability;
- checar RBAC depois de entitlement;
- aplicar limits antes de executar publicacao/automacao;
- auditar alteracoes de entitlement;
- falhar fechado quando entitlement estiver ausente ou ambiguo.

## Channel connectors

Conectores devem:

- receber contexto de agencia do servidor;
- nunca confiar em `agencyId` vindo do frontend;
- validar ownership de publication/campaign/config;
- armazenar tokens e secrets fora de logs e respostas;
- normalizar payload externo antes de entrar no dominio;
- registrar external IDs sem expor dados sensiveis desnecessarios.

## Automation

Automations podem executar acoes com impacto publico e comercial. Devem exigir:

- authorization server-side;
- entitlement adequado;
- RBAC adequado;
- deduplicacao;
- cooldown/limits;
- auditoria de trigger, decisao e actions;
- capacidade de pausar/desativar.

## Coupon

Coupon e financeiro/comercialmente sensivel. Deve exigir:

- limites por campanha/oferta/cliente;
- validade;
- auditoria de grant e redemption;
- protecao contra reutilizacao alem de `maxUses` e `maxUsesPerCustomer`;
- trilha de reversao quando houver cancelamento/reembolso futuro.

## RLS expectation

RLS esperado por familia:

| Familia | Regra esperada |
|---------|----------------|
| Acquisition | captura visivel apenas para agencia dona |
| Assets | asset agency-owned visivel apenas para agencia dona; assets globais exigem decisao futura |
| Campaigns | campaign/publication por agencia |
| Connectors | configuracao e tokens por agencia |
| Engagement | evento por agencia, mesmo quando external user for desconhecido |
| Automation | regras e execucoes por agencia |
| Coupons | cupom, grant e redemption por agencia |
| Analytics | agregados por agencia e dimensoes tenant-safe |

## Audit expectation

Auditar:

- aprovar/rejeitar captura;
- criar/alterar Offer a partir de captura;
- criar/alterar template;
- gerar snapshot;
- agendar/publicar/cancelar Publication;
- configurar connector;
- ativar/pausar Automation;
- executar Automation com acao externa;
- criar/enviar/resgatar cupom;
- alterar entitlement;
- ler/exportar analytics sensivel quando aplicavel.

## Fail-closed

Qualquer ausencia de tenant context, entitlement, RBAC, connector capability,
ownership ou limite deve negar a acao.
