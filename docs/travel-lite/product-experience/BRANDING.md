# Travel Lite — Branding e Login por Tenant

## Objetivo

Permitir que o ambiente Lite pareça da agência cliente, reforçando confiança e reduzindo sensação de sistema genérico. A identidade visual deve afetar principalmente login, topo e detalhes de interface.

## Configurações esperadas

Gerenciadas por MASTER em Configurações:

- Nome fantasia.
- Logo.
- Cor primária.
- Cor secundária.
- Cor de fundo do login.
- Texto curto de boas-vindas.

## Aplicação visual

- Login: logo, nome fantasia, cores e fundo da agência.
- App autenticado: topo, botões principais e acentos visuais.
- Ajuda e onboarding: usar nome da agência quando fizer sentido.

## Regras de segurança e robustez

- Nunca aceitar `tenantId` vindo do frontend para carregar branding.
- Branding deve ser resolvido pelo slug no login e pela sessão no app autenticado.
- Upload de logo deve validar tipo, tamanho e formato.
- Se branding estiver incompleto, usar tema padrão seguro.

## Branding Gadotti

Para a Gadotti, a configuração inicial deve permitir:

- logo da agência;
- paleta próxima à identidade fornecida pelo cliente;
- login com nome da agência;
- experiência amigável sem alterar permissões.

## Fora do escopo imediato

- Editor visual avançado.
- Temas por usuário.
- CSS customizado livre.

## Critérios de aceite

- Login muda visualmente conforme a agência.
- Configuração incompleta não quebra o app.
- MASTER consegue ajustar identidade sem intervenção técnica.
