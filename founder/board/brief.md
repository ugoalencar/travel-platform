# Brief para o board — Travel Plataforma (rodada 2, 30/10/2026)

Leia `founder/idea.md` (versão atualizada hoje) por inteiro. A rodada anterior (12/10) está arquivada em `founder/board-v1/` e `founder/board-v1/board.md`; pode ser usada como contexto histórico, mas o estado do produto mudou.

## Fatos verificáveis (sem opinião)

- Full em produção desde hoje; primeira agência real (Gadotti, Joinville/SC) criada como tester sem cobrança; já era cliente do Lite.
- O produto tem CRM, pipeline, financeiro (receber/pagar), folha/comissões, relatórios, portal do cliente, papéis (OWNER/ADMIN/MANAGER/AGENT/VIEWER), isolamento multi-tenant com RLS, MFA, trilha de auditoria.
- Cobrança recorrente (Asaas) e NFS-e: só ADR, sem código em produção.
- Fundador solo, sem equipe, custo fixo baixo declarado. Simulações antigas: break-even ~13 agências a R$ 81 de contribuição/mês (modelo de 12/10, ver `founder/cfo.md`).
- Zero cliente pagante até hoje.
- Preço publicado: R$ 99 / R$ 299 / sob consulta; preço de fundador de R$ 79 já considerado.

## O que o board deve avaliar

1. O sistema como negócio hoje.
2. Ideia A: 4 fundadores testam 6 meses e viram vitalícios; depois assinaturas para os demais.
3. Ideia B: vender o sistema (licença/implantação) + suporte pago, em vez de assinatura.
4. A melhor combinação, ou recomendação de não fazer alguma delas, e condições.

## Não inventar

Tamanho de mercado, número de agências no Brasil, CAC, churn, preço de concorrentes: tratar como pergunta aberta e dizer qual skill responde (`/founder-competitors`, `/founder-consumer`, `/founder-cfo`).
