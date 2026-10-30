# Resumo — Travel Plataforma

A Travel Plataforma é um SaaS de gestão para agências de viagem no Brasil —
CRM, pipeline de vendas, operação e portal do cliente, cobrado por
assinatura mensal (R$ 99 a R$ 299). É para o dono ou gerente de uma agência
pequena/solo que hoje organiza cliente e venda numa planilha e num grupo de
WhatsApp.

**Veredito: Profitable**, pelos quatro critérios computados
(`founder/cfo.md`, `founder/panel/results.json`):
- Margem: R$ 81 de contribuição por agência-mês (82%), lucro de 62% na meta
  de regime.
- Break-even: 13 agências pagantes por mês.
- Ano 1: lucro operacional de R$ 11.571.
- Painel de compradores: 50% de compra (10 de 20), bem acima da barra de 25%.

**Onde o board e o painel concordaram**: a falta de prova social (nenhuma
agência real usando o sistema) é o maior risco, citado nas três análises do
board, na pesquisa de concorrentes e em 7 das 10 recusas do painel depois da
oferta revisada. **Onde divergiram**: o board tratou isso como risco de
modelo de negócio (nenhum "segredo" defensável sem a cobrança/fiscal
pronta); o painel mostrou que é resolvível, pelo menos parcialmente, com
oferta certa — a taxa de compra mais que dobrou (20%→50%) só com garantia de
migração e preço de fundador, sem mudar o produto.

**O maior risco, e o que fazer sobre ele**: o CFO roda com R$1.000/mês de
custo fixo porque o fundador ainda não tira pró-labore. Se isso mudar pra
R$9.000/mês (um cenário citado pelo próprio fundador), o break-even salta de
13 para 124 agências — o dobro da meta de regime. **Não contratar nem
formalizar pró-labore sem rodar o CFO de novo com o número real.** O segundo
risco, não financeiro: a cobrança automática e a NFS-e, anunciadas na
landing page, não existem em código — só em ADR. A oferta e o marketing
foram construídos pra nunca prometer isso como pronto; a correção real é
terminar essa implementação.

**O que o fundador precisa pra começar**: caixa de R$ 2.680 até o negócio se
pagar (mês 8, na meta de 50 agências) — baixo porque não há custo de equipe
ainda. O primeiro teste real (`founder/launch.md`): recrutar 2-3 agências
por conexão pessoal antes de abrir o Programa Agência Pioneira pro público,
com meta de 5 agências pagantes reais em 30 dias.

**A uma coisa pra fazer esta semana**: corrigir os dois achados de segurança
que o board já identificou (captcha no formulário de lead, MFA obrigatório
pro super-admin) — é o item do caminho crítico em `founder/launch.md` antes
de qualquer divulgação pública.

---

Painel de compradores e projeções financeiras são simulações — confirmar
com clientes e números reais antes de comprometer dinheiro. Isto não é
parecer financeiro, tributário ou jurídico.
