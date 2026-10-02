# Travel Lite — Versionamento

Status: ativo a partir de 2026-10-02.

## Versão Inicial

`0.1.0` é a versão inicial do Travel Lite.

Esta versão passa a ser a linha de base para demonstração, homologação e
atualizações futuras. Tudo que vier depois deve ser tratado como atualização
incremental, registrada em release notes e validada contra esta base.

## Escopo Da Versão 0.1.0

- Ambiente Lite para agência piloto.
- Tenant Gadotti preservado.
- Tenant Demo separado para navegação sem sujar o ambiente Gadotti.
- Login, dashboard, clientes, vendedores, vendas, custos, financeiro, relatórios,
  importação, ajuda, onboarding, branding, PWA/mobile, capacidades de plano,
  readiness de migração, manual e apresentação.
- Interface visível em português.
- API e frontend em uma imagem única do Travel Lite.
- Banco PostgreSQL dedicado ao Lite.

## Ambientes Da Versão 0.1.0

| Ambiente | Uso | Regra |
| --- | --- | --- |
| `gadotti` | Homologação do cliente e uso piloto | Preservar dados reais da agência |
| `demo` | Demonstração navegável com dados preenchidos | Pode ser refeito, resetado ou enriquecido |

## Regras Para Próximas Versões

- Mudanças novas entram como `0.1.x` quando forem correções ou melhorias
  compatíveis.
- Funcionalidades novas de produto entram como `0.2.0`, `0.3.0`, etc.
- Mudanças que afetem instalação, backup, licença, sincronização ou migração
  devem ter release notes próprias.
- O tenant Gadotti não deve ser usado para testes destrutivos; usar `demo` ou
  base descartável.
- Deploy online, registry, DNS, banco remoto e secrets exigem decisão registrada
  antes da execução.

## Gates De Release

Antes de declarar uma versão como pronta:

- typecheck da API e do frontend;
- testes relevantes;
- build da imagem Travel Lite;
- smoke de login;
- smoke de dashboard;
- verificação de `/api/version`;
- verificação de mensagens visíveis em português;
- registro de limitações conhecidas.
