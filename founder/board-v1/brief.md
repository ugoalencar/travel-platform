# Brief para o board — Travel Plataforma

## A ideia (founder/idea.md)

- O que é: SaaS de gestão para agências de viagem — CRM/pipeline de vendas,
  app para o cliente final, controle de usuários/equipe e módulo financeiro
  (incluindo emissão de nota fiscal), com um módulo mais leve chamado
  "Travel Lite" dentro da mesma plataforma.
- Para quem é: agências de viagem no Brasil (produto, site e domínio em
  português/`.br`).
- O que vende, a que preço:
  - Inicial — R$ 99/mês: 10 usuários, 100 GB, suporte básico.
  - Profissional — R$ 299/mês (destaque): 50 usuários, 500 GB, suporte
    prioritário, integrações personalizadas.
  - Empresarial — sob consulta: ilimitado, suporte 24/7, gerente de conta.
- Onde e como: 100% online. Landing page de marketing com formulário de
  demo; cadastro leva ao app da agência. Cobrança recorrente via Asaas
  (Pix/boleto/cartão) e NFS-e pelo próprio provedor — **arquitetura
  desenhada em ADR, ainda não implementada em produção** (hoje não há
  cobrança real nem emissão fiscal funcionando).
- Orçamento/restrições: não informado.

## Funcionalidades anunciadas na landing page (o que o produto promete)

- CRM / Cliente 360 — histórico, documentos e viagens do cliente em um
  lugar só.
- Pipeline comercial — do primeiro contato à venda, etapas configuráveis
  por agência.
- Viagens e operação — terrestre, aéreo e excursões, visão operacional.
- Financeiro — contas a receber, a pagar, fluxo de caixa e margem em tempo
  real.
- Equipe — papéis, permissões e convites para equipe comercial/operacional.
- Portal do cliente — cliente final acompanha viagens/documentos/ofertas
  pelo celular.
- Segurança: isolamento de dados por agência (multi-tenant), controle de
  acesso por papel, 2FA, trilha de auditoria, sessões seguras.

## Estado real do produto (fatos verificáveis, não opinião)

- O código do app principal (`app.travelplataforma.com.br`) e de um app
  mais leve (`travellite.travelplataforma.com.br`) existe e está em
  produção (hospedado, domínios respondendo).
- O módulo de cobrança recorrente (Asaas) e emissão de nota fiscal (NFS-e)
  **ainda não tem código implementado** — só existem ADRs/specs de
  arquitetura (`docs/adr/ADR-BILLING-001-...`, `ADR-FISCAL-001-...`).
  Isso significa que hoje a plataforma não consegue, de fato, cobrar um
  cliente real de forma recorrente nem emitir nota fiscal automaticamente.
- Uma auditoria de segurança já identificada (não corrigida ainda) achou
  lacunas: validação/captcha ausente no formulário público de leads,
  cabeçalhos de segurança a configurar, MFA não obrigatório para
  super-admin, logging/gitleaks de CI pendente.
- O fundador relatou pelo menos um incidente de acesso: login recusado no
  app principal (credenciais inválidas), não investigado a fundo nesta
  conversa — resolvido apontando para o fluxo de recuperação de senha
  existente.
- Não há, até agora, nenhum cliente pagante confirmado, nenhum dado de
  conversão da landing page, e nenhuma pesquisa de mercado ou validação
  com agências reais registrada nesta conversa.

## O que o board NÃO deve inventar

- Tamanho do mercado de agências de viagem no Brasil.
- Quem são os concorrentes diretos (ex.: outros SaaS de gestão de agências
  já existentes) — não levantado ainda.
- Custo de aquisição de cliente, churn esperado, ou qualquer projeção
  financeira — nada disso foi calculado ainda.
