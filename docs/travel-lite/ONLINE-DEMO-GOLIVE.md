# Travel Lite 0.1.0 — Go-Live Online De Demonstração

Status: infraestrutura parcialmente decidida (2026-10-02) — provedor e domínio
confirmados; banco online, secrets e política de dados piloto ainda pendentes.
Ver `.claude/2026-10-02_GOLIVE-TRAVEL-LITE-RENDER-REPORT.md` para o relatório
técnico completo de prontidão.

## Objetivo

Publicar a versão `0.1.0 Inicial` para o cliente navegar online com dois
ambientes:

- `https://travellite.travelplataforma.com.br/gadotti`: homologação preservada da agência.
- `https://travellite.travelplataforma.com.br/demo`: ambiente preenchido para demonstração, relatórios e gráficos sem
  contaminar os dados da Gadotti.
- Raiz (`https://travellite.travelplataforma.com.br`): login neutro, sem listar
  clientes publicamente.

Subdomínios como `gadotti.travelplataforma.com.br` e
`demo.travelplataforma.com.br` ficam como evolução posterior, quando DNS/TLS
forem fechados — o roteamento por caminho (`/gadotti`, `/demo`) já está
implementado no frontend (`apps/travel-lite/src/branding.ts`,
`slugFromCurrentPathname`) e cobre este primeiro go-live.

## Regra De Publicação

Os dois ambientes devem rodar na mesma instalação Travel Lite e no mesmo banco
online dedicado, separados por tenant. O frontend não deve receber nem confiar
em `tenantId`; a seleção continua por agência/login.

Quando o acesso vier pelo caminho público do cliente, o login deve preencher e
travar a agência automaticamente. Exemplo: `/gadotti` usa o slug `gadotti`;
`/demo` usa o slug `demo`.

O suporte por subdomínio também existe no frontend e pode ser ativado depois,
sem mudar a separação de tenants no backend.

## DNS Sugerido

| Host | Tipo | Destino |
| --- | --- | --- |
| `travelplataforma.com.br/gadotti` | Caminho público inicial | Mesma instalação Travel Lite |
| `travelplataforma.com.br/demo` | Caminho público inicial | Mesma instalação Travel Lite |
| `gadotti.travelplataforma.com.br` | CNAME ou A futuro | Mesma instalação Travel Lite |
| `demo.travelplataforma.com.br` | CNAME ou A futuro | Mesma instalação Travel Lite |

Se o provedor escolhido suportar wildcard e TLS wildcard, também é possível
usar `*.travelplataforma.com.br` apontando para a mesma aplicação.

## Decisões Necessárias Antes De Executar

| Decisão | Status |
| --- | --- |
| Provedor/host online | **Decidido: Render** (Web Service dedicado, separado do serviço existente de `api.travelplataforma.com.br`) |
| Banco PostgreSQL online dedicado | Pendente |
| URL/domínio público | **Decidido: `travellite.travelplataforma.com.br`**, DNS já criado no Registro.br e resolvendo para o Render |
| DNS `gadotti.travelplataforma.com.br` | Adiado (caminho `/gadotti` cobre o go-live inicial) |
| DNS `demo.travelplataforma.com.br` | Adiado (caminho `/demo` cobre o go-live inicial) |
| TLS/HTTPS | Pendente |
| Local de secrets | Pendente |
| Backup antes e depois do deploy | Pendente |
| Política de dados piloto | Pendente |
| Credenciais online iniciais | Pendente |

## Ordem Recomendada

1. Escolher provedor e URL pública.
2. Criar PostgreSQL dedicado para Travel Lite.
3. Configurar secrets fora do repositório.
4. Gerar backup local da base atual.
5. Restaurar ou semear `gadotti` e `demo` no banco online aprovado.
6. Subir imagem da versão `0.1.0`.
7. Validar `/api/health` e `/api/version`.
8. Validar `/gadotti` e login `gadotti`.
9. Validar `/demo` e login `demo`.
10. Validar dashboard, clientes, vendas, relatórios e gráficos.
11. Registrar evidência do deploy.

## Stop Conditions

- Sem backup validado.
- Sem HTTPS.
- Sem banco dedicado.
- Sem controle de secrets.
- Erro de login em `gadotti` ou `demo`.
- `/api/version` diferente de `0.1.0`.
- Qualquer dúvida de isolamento entre tenants.
