# Travel Plataforma · Business plan

**Verdict: Profitable**

- ✓ Each agência-mês (uma agência assinante, um mês) earns $81.00 before fixed costs (82% contribution).
- ✓ Year 1 operating profit: $11,571.
- ✓ Break-even is 13 agência-mês (uma agência assinante, um mês)s a day against a capacity of 100000.
- ✓ 10 of 20 simulated buyers buy (50%, the bar is 25%).

| key number | |
| --- | ---: |
| Price | $99.00 a agência-mês (uma agência assinante, um mês) |
| Profit margin at plan | 62% per agência-mês (uma agência assinante, um mês) |
| Break-even | 13 agência-mês (uma agência assinante, um mês)s a day |
| Year 1 operating profit | $11,571 |
| Startup spend | $300 |
| Cash needed before it pays for itself | $2,680 |
| Startup money earned back | month 8 |
| Buyer panel | 10 buy · 10 pass |

## The idea

- O que é: um SaaS de gestão para agências de viagem — CRM/pipeline de vendas, app para o cliente final, controle de usuários/equipe e módulo financeiro (incluindo emissão de nota fiscal), com um módulo mais leve chamado "Travel Lite" dentro da mesma plataforma.
- Para quem é: agências de viagem no Brasil (produto e site em português, domínio `.br`).
- O que vende, a que preço (planos publicados na landing page):
  - Inicial — R$ 99/mês: 10 usuários, 100 GB de armazenamento, suporte básico, recursos essenciais.
  - Profissional — R$ 299/mês (plano em destaque): 50 usuários, 500 GB, suporte prioritário, todos os recursos, integrações personalizadas.
  - Empresarial — sob consulta: usuários ilimitados, armazenamento ilimitado, suporte 24/7, gerente de conta dedicado.
- Onde e como: 100% online, Brasil. Aquisição via landing page de marketing (`travelplataforma.com.br`) com formulário de solicitação de demo; o cadastro/self-service leva ao app da agência (`app.travelplataforma.com.br`). Cobrança recorrente planejada via Asaas (Pix/boleto/cartão) e emissão de NFS-e pelo próprio provedor — arquitetura desenhada em ADR, ainda não implementada em produção.
- Orçamento e restrições: não informado pelo usuário nesta conversa — não presumido.

## Summary

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

## What the board said

**Votos: 3 fund if, 0 fund, 0 pass. Nota média: 3,3/10** (Offers 3, Monopoly 3,
Product 4).

Nenhum membro deu PASS puro, mas nenhum deu FUND puro, e todos os três ficaram
na parte baixa da escala (3-4/10). O voto é unânime na forma, mas a nota
baixa diz que as condições para liberar o "fund" são substanciais, não
formalidade.

### Os riscos que mais de um membro levantou (em primeiro lugar, do mais perigoso)

1. **A landing page promete uma transação que o produto não consegue
   completar hoje.** Os três lenses bateram nisso de ângulos diferentes: o
   Offers lens chama de "likelihood falsa" dentro da equação de valor; o
   Monopoly lens aponta que a única peça defensável do negócio (cobrança
   Asaas + NFS-e) existe só em ADR, não em código; o Product lens chama de
   "promessa quebrada no exato momento em que a confiança importa" — o
   recibo/nota fiscal. Os três concordam: isso não é feature faltando, é
   risco de confiança e, no caso fiscal, possivelmente legal.
2. **Lacunas de segurança/confiança já conhecidas e não corrigidas**, bem na
   boca do funil: formulário público de lead sem captcha/validação,
   cabeçalhos de segurança pendentes, MFA opcional para super-admin,
   scanning de segredos no CI pendente. Os três lenses chegaram
   independentemente à mesma conclusão — Offers e Product como "ferida
   autoinfligida no ponto onde o comprador forma a primeira opinião", e o
   Monopoly lens como condição antes de lidar com dados reais de pagamento.
3. **Nenhuma prova de que alguém compra isso.** Zero cliente pagante, zero
   piloto, zero dado de conversão da landing page — só um formulário de
   demo. Offers e Monopoly lens bateram nisso: sem prova, a oferta perde a
   batalha mais difícil (likelihood), e sem distribuição comprovada, ainda
   não é um negócio, muito menos um negócio defensável.

### O que cada lens levantou sozinho (vale registrar — o board não concordou em tudo)

- **Offers**: o preço por assentos/GB/nível de suporte (R$99/299/sob
  consulta) tem forma de lista de preço de software genérico, não de oferta
  — nada sobreviveria a um preço em dobro.
- **Monopoly**: o cenário competitivo é totalmente desconhecido — o formato
  "CRM + pipeline + financeiro + portal" é um padrão replicado com
  frequência, e nada no brief descarta que já existam 2-3 concorrentes
  verticais entrincheirados no Brasil.
- **Product**: o produto tenta ser sete coisas ao mesmo tempo (CRM, pipeline,
  operação, financeiro, equipe, portal do cliente, Travel Lite) sem
  evidência de que alguém decidiu qual dessas deve ser excelente antes das
  outras.

### Checklist de condições (combinando os três memos — isso é o que `/founder-cfo`, o painel de consumidores e o pricing vão testar)

- [ ] Parar de anunciar cobrança recorrente (Asaas) e emissão de NFS-e como
      capacidade ao vivo na landing page — remover a afirmação ou marcar
      explicitamente como "em breve", até o código existir de fato.
- [ ] Fechar as lacunas de segurança já identificadas antes de gastar
      dinheiro trazendo tráfego: validação/captcha no formulário público de
      lead, cabeçalhos de segurança, MFA obrigatório para super-admin,
      scanning de segredos no CI.
- [ ] Conseguir pelo menos uma agência real (piloto ou pagante) usando o
      produto de ponta a ponta como prova concreta, antes de criar mais
      camadas de preço ou investir em marketing sobre uma "likelihood" que
      hoje não tem evidência.
- [ ] Rodar `/founder-competitors` antes de mais investimento de build — o
      cenário competitivo é desconhecido e pode mudar a tese inteira.
- [ ] Implementar e validar a integração Asaas + NFS-e contra o ciclo real
      de cobrança/nota de uma agência real antes de tratá-la como
      diferencial — um ADR não é um fosso competitivo.
- [ ] Redesenhar o preço em torno de um resultado garantido e uma pilha de
      problemas resolvidos (não assentos/GB/nível de suporte).
- [ ] Decidir a "uma coisa" que este produto precisa fazer de forma
      brilhante, e cortar ou rebaixar prioridade do resto até isso estar
      resolvido.
- [ ] Nomear explicitamente o "segredo"/vantagem real — o que um concorrente
      bem financiado não conseguiria replicar em seis meses — em vez de se
      apoiar só em "construímos CRM + cobrança + fiscal".
- [ ] Rodar `/founder-consumer` (validação de demanda/preço) e `/founder-cfo`
      (economia unitária) antes de escalar qualquer investimento — nenhum
      dos três memos inventou número de mercado, concorrente, CAC ou churn;
      todos ficaram como pergunta aberta.

### A versão mais forte deste negócio que o board consegue ver

Não é a plataforma de sete módulos anunciada hoje — é uma oferta muito mais
estreita: uma ferramenta focada para pequenas agências de viagem brasileiras
que resolve uma coisa que elas sentem toda semana (hoje organizado em
planilha/WhatsApp) e que, de verdade, cobra o cliente final via Pix/boleto e
emite a nota fiscal sem a agência tocar em outro sistema — com essa
integração Asaas+NFS-e provada em produção contra pelo menos uma agência
real antes de qualquer expansão para CRM completo, portal do cliente e
camadas de preço por assento. O "Travel Lite" já aponta nessa direção; a
pergunta que o board deixa para o fundador é se ele está disposto a vender
essa versão mais estreita primeiro, com uma prova real, em vez da versão de
sete módulos que a landing page já promete hoje sem ter construído a parte
mais difícil e mais defensável dela.

## The competition

Busca feita em fontes públicas (Google, sites oficiais, Capterra, ReclameAqui,
imprensa do setor de turismo), em 2026-10-12. Nenhum concorrente, preço ou
avaliação foi inventado — onde a fonte não trazia o dado, está marcado como
"não encontrado" ou "não divulgado". Dois acessos diretos (Capterra,
ReclameAqui/Agendor) retornaram erro 403 e foram substituídos por buscas que
trazem o mesmo conteúdo via resultados indexados — citado como tal.

### 1. Quem está no mercado

| Nome | Tipo | Onde | Preço do item comparável | O que vende |
|---|---|---|---|---|
| **PaxGo** | Direto | Brasil, 100% online | Não divulgado publicamente | Plataforma de gestão para agências: funil de vendas, orçamentos, agenda, vouchers digitais |
| **PaxPro** (Coimbra Informática) | Direto | Brasil, online | Não divulgado | Gestão para agências com WhatsApp + IA, orçamento digital, painéis de vendas |
| **Benner Turismo** (Grupo Benner) | Direto | Brasil | Histórico: a partir de R$ 30 mil (2009, desatualizado) | ERP de backoffice — operacional, financeiro, tributário, contábil |
| **PHPTravels** | Direto (internacional) | Online, licença em USD | US$ 499 a US$ 9.999 (fontes divergem — ver nota) | CRM + motor de reservas + portal B2B |
| **WeTravel** | Direto (internacional) | Online, USD | US$ 79/mês + 1% de taxa de transação | Pagamentos + gestão para operadores/agências de grupo |
| **Agendor** | Indireto | Brasil, online | R$ 59–156/usuário/mês | CRM de vendas genérico, com página própria para turismo |
| **Omie** | Indireto | Brasil, online | A partir de R$ 309/mês (varia por faturamento) | ERP genérico com recursos fiscais/financeiros |
| **Pipedrive** | Indireto (substituto parcial) | Online, USD | US$ 14–99/usuário/mês | CRM de pipeline genérico, sem nada de turismo |
| **Planilha + WhatsApp** | Substituto | — | R$ 0 em licença | Como a maioria das agências pequenas resolve isso hoje |

Fontes completas em `founder/competitors.csv`.

**Nota sobre o PHPTravels:** a página oficial de preços lista planos Startup
(US$ 2.499), Agency (US$ 4.999) e Enterprise (US$ 9.999), todos pagamento
único. Já a listagem da Capterra mostra um preço inicial de US$ 499. As duas
fontes não batem — provavelmente são versões/licenças diferentes do mesmo
produto. Reportando os dois, sem escolher um.

**Nota sobre o Omie:** a página institucional cita "a partir de R$ 99/mês",
mas a página oficial de preços (que pede faixa de faturamento) mostra
R$ 309/mês como ponto de entrada mais atual. A divergência pode ser uma
página desatualizada do próprio site — vale confirmar com o fornecedor antes
de usar o número.

### 2. Faixa de preço (item comparável, só quem publica preço em reais ou dólar claro)

- **Mais barato**: Pipedrive, a partir de ~US$ 14/usuário/mês (varia por fonte).
- **Mediana**: Agendor, R$ 59–156/usuário/mês — provavelmente o ponto de
  comparação mais direto, porque é brasileiro, cobra em reais e tem uma
  página específica para agências de viagem.
  Em dólar, PHPTravels US$ 499–9.999 (pagamento único) e WeTravel
  US$ 79/mês + 1% de taxa.
- **Mais caro**: Benner Turismo, histórico de R$ 30 mil+ (dado de 2009,
  provavelmente defasado, mas indica posicionamento enterprise).
- **PaxGo e PaxPro — os dois concorrentes brasileiros mais diretos (travel-specific) — não divulgam preço publicamente.** Isso por si só já é um dado: nenhum dos dois compete abertamente em preço.

A Travel Plataforma (R$ 99 / R$ 299 / sob consulta) fica abaixo da Agendor no
plano de entrada, mas dentro da mesma faixa geral de SaaS B2B brasileiro —
não é nem o mais barato nem o mais caro do mapa.

### 3. Mapa de posicionamento (texto)

Eixos: **especialização em turismo** (genérico ↔ feito para agência de
viagem) e **cobre o dinheiro de ponta a ponta** (só organiza ↔ cobra e emite
nota fiscal pelo cliente final).

```
cobre o dinheiro de ponta a ponta
        ↑
        |                                    [ninguém aqui hoje —
        |                                     é exatamente onde a Travel
        |                                     Plataforma quer chegar,
        |                                     mas ainda não chegou]
        |
Omie •  |
        |
--------+------------------------------------→ especializado em turismo
        |
Agendor •    Pipedrive •
        |
        |                    PaxGo •  PaxPro •  Benner Turismo •
        |                    WeTravel • (cobra, mas sem NFS-e BR)
        ↓                    PHPTravels •
   só organiza
```

- **Canto inferior-esquerdo/meio** (genérico, só organiza): Pipedrive — não
  tem nada de turismo.
- **Esquerda, mais alto** (genérico, mas cobra/fatura): Omie — tem motor
  fiscal/financeiro forte, mas não é feito para o fluxo de uma agência
  (cotação → viagem → cliente final).
- **Direita, baixo** (especializado em turismo, mas não cobra o cliente
  final pela plataforma): PaxGo, PaxPro, Benner Turismo, PHPTravels — todos
  organizam cotação/funil/voucher, mas nenhum, pelas fontes encontradas,
  automatiza cobrança recorrente + NFS-e brasileira dentro do próprio
  produto. WeTravel cobra pagamentos, mas é uma plataforma internacional sem
  nota fiscal brasileira.
- **Canto superior-direito** (especializado em turismo E cobra/fatura o
  cliente final automaticamente): **vazio.** Nenhum concorrente encontrado
  ocupa esse quadrante — é exatamente a combinação que a Travel Plataforma
  anuncia (CRM/pipeline de agência + Asaas + NFS-e), mas que, conforme já
  registrado no veredito do board, também ainda não foi implementada no
  próprio produto.

### 4. O que os clientes reclamam (por tema, do mais citado)

Reviews específicas de clientes de agência de viagem sobre PaxGo, PaxPro e
Benner Turismo não foram encontradas em nenhuma fonte pública — nenhum dos
três aparece em Capterra, G2 ou ReclameAqui com avaliações de usuários.
**Marcado como tema não verificável por falta de volume**, não como "sem
problemas".

Os temas abaixo vêm de concorrentes indiretos (CRM/ERP genérico) e do
concorrente internacional, via resultados de busca que resumem páginas de
avaliação — não foi possível abrir as páginas originais diretamente
(Capterra e ReclameAqui bloquearam o acesso direto com erro 403), então os
trechos abaixo são como apareceram nos resultados de busca, com a fonte
original indicada.

1. **Suporte/atendimento como ponto fraco relativo — thin, mas em duas fontes
   independentes.** No PHPTravels, "Customer Support" é a categoria com nota
   mais baixa entre as avaliadas (3,7/5 vs. 3,9-4,0 nas demais), segundo a
   página do Capterra. Na Omie, o ReclameAqui aponta "Softwares" como maior
   categoria de reclamação, com queixas de "mau atendimento no SAC". Menos
   de três avaliações individuais foram localizadas para cada um — **tema
   thin**, mas aparece em dois produtos diferentes.
   Fontes: [Capterra — PHPTRAVELS](https://www.capterra.com/p/141791/PHPTRAVELS/), [ReclameAqui — Omie](https://www.reclameaqui.com.br/empresa/omiexperience/)
2. **Cobranças e estornos demorados (Omie).** Reclamações recentes citadas no
   resumo do ReclameAqui mencionam "cobranças consideradas abusivas em
   contratos de BPO" e "demora em estornos após cancelamento de assinatura".
   **Tema thin** (vindo do resumo agregado, não de 3 reclamações
   individuais lidas diretamente).
   Fonte: [ReclameAqui — Omie](https://www.reclameaqui.com.br/empresa/omiexperience/)
3. **Erros ocasionais de importação de planilha (Agendor).** Uma avaliação
   de maio/2023 no Capterra: "Às vezes a importação de dados das planilhas
   gera algum erro mas após algumas tentativas conseguimos solucionar."
   **Tema thin** (uma única avaliação encontrada).
   Fonte: resultado de busca referenciando Capterra — Agendor.

Avaliação geral do Agendor, para contraste: as avaliações do Capterra
encontradas são majoritariamente positivas sobre atendimento humano
("atendimento cordial, do comercial ao suporte e treinamento"; "o
atendimento humano foi decisivo na escolha... em relação a Pipedrive e
Salesforce"), e o ReclameAqui mostra só 7 reclamações no total, volume baixo
demais para calcular reputação.

### 5. A lacuna

**Existe uma lacuna real e nenhum concorrente encontrado a ocupa hoje**: um
sistema feito para o fluxo de trabalho de uma agência de viagem brasileira
(cotação → pipeline → operação) que também cobra o cliente final de forma
recorrente (Pix/boleto/cartão) e emite a nota fiscal de serviço
automaticamente, dentro do mesmo produto.

- Os concorrentes brasileiros especializados em turismo (PaxGo, PaxPro,
  Benner Turismo) resolvem a parte do fluxo de vendas/operação, mas nada
  nas fontes públicas indica que algum deles automatiza cobrança + NFS-e.
- Os concorrentes brasileiros com motor fiscal/financeiro forte (Omie) não
  são feitos para o fluxo de uma agência — são ERPs genéricos.
- O único concorrente que combina pagamento + fluxo de turismo (WeTravel) é
  internacional e não tem nota fiscal brasileira.

Essa lacuna é exatamente a peça que o board (ver `founder/board.md`) já
identificou como a única vantagem defensável possível da Travel Plataforma —
e também a única parte do produto que, hoje, só existe em ADR, não em
código. A pesquisa de concorrentes **confirma de forma independente** que
essa combinação específica, se construída e provada, seria genuinamente
diferenciada no mercado brasileiro atual — e também confirma que construir
só a metade "CRM de agência" (sem a cobrança/fiscal) cai direto no mesmo
espaço já ocupado por PaxGo, PaxPro e Benner Turismo.

### 6. A ameaça — quem copia mais rápido

Dois perfis diferentes de ameaça, por caminhos opostos:

- **Omie** já tem o motor fiscal/financeiro brasileiro funcionando em
  produção (emissão de nota, boleto, múltiplas faixas de faturamento). Para
  copiar a Travel Plataforma, a Omie precisaria construir a camada de
  fluxo de agência de viagem (cotação, pipeline, portal do cliente) por
  cima de uma base de cobrança que já funciona — o caminho tecnicamente
  mais fácil, mesmo que o produto final pareça menos "feito sob medida"
  para turismo.
- **PaxPro** já tem o fluxo de agência de viagem funcionando (e está
  investindo ativamente em produto agora mesmo — anunciou WhatsApp + IA em
  outubro/2026, mesmo mês desta pesquisa). Para copiar a Travel Plataforma,
  precisaria adicionar Asaas/Pix/boleto + NFS-e por cima do que já tem — o
  caminho tecnicamente mais difícil, mas mais próximo da experiência
  específica de turismo que a Travel Plataforma promete.

Qualquer um dos dois chegando lá primeiro — com uma base de clientes maior
e, no caso da Omie, provavelmente mais caixa — reduziria a janela da Travel
Plataforma. Nenhuma fonte encontrada indica que algum dos dois já está
fazendo isso hoje; é um risco a monitorar, não um fato observado.

### Próximos passos sugeridos

- `/founder-consumer`: usar os temas de reclamação (suporte, cobrança
  confusa, falta de automação fiscal) como objeções reais a testar com o
  painel de compradores simulados.
- `/founder-pricing`: usar a faixa de preço real (R$ 59–309/mês entre os
  concorrentes brasileiros que publicam preço) para calibrar os planos da
  Travel Plataforma.

## The buyer panel

**10 buy · 10 pass** (50% buy) out of 20 simulated buyers. Seed 935677, so the same cards can be dealt again.

These are simulated buyers, not customers. Use this to find objections and weak spots, then confirm the big ones with real people before you spend.

### By segment

| group | buyers | buy rate |
| --- | ---: | ---: |
| Agência média (11-50 pessoas) | 4 | 100%  (thin) |
| Agência solo/micro (1-3 pessoas) | 9 | 44% |
| Agência pequena (4-10 pessoas) | 7 | 29%  (thin) |

### By buying behaviour

| group | buyers | buy rate |
| --- | ---: | ---: |
| Early adopter de tecnologia | 2 | 100%  (thin) |
| Ainda usa planilha + WhatsApp | 6 | 67%  (thin) |
| Já usa um concorrente e está insatisfeito | 4 | 50%  (thin) |
| Decide pelo custo, não pelo recurso | 3 | 33%  (thin) |
| Caçador de desconto/promoção | 3 | 33%  (thin) |
| Decide em grupo/associação | 2 | 0%  (thin) |

### By income

| group | buyers | buy rate |
| --- | ---: | ---: |
| $84,000 and up | 7 | 71%  (thin) |
| $19,000 to $84,000 | 7 | 43%  (thin) |
| under $19,000 | 6 | 33%  (thin) |

### Why they pass

| reason | buyers | in their words |
| --- | ---: | --- |
| trust | 7 | "Já vi um sistema parecido travar e perder dado de cliente no meio da migração, e isso não é coisa que se esquece. A garantia de devolução é bonita no papel, mas o outro fornecedor também prometia segurança e não entregou. Entrar como 'Agência Pioneira' significa eu ser a cobaia sem ter nenhum caso real pra olhar antes - prefiro ver outras agências como a minha usando por uns meses primeiro." (P003) · "Já estou insatisfeita com o sistema que uso, então a dor é real, mas trocar de sistema sem ninguém do meu tamanho já usando e recomendando é arriscado demais pra agência pequena como a minha. Vou testar de graça, sem compromisso, antes de pensar em pagar qualquer coisa." (P006) |
| habit | 2 | "O preço até é baixo, mas o problema não é o que eu pago hoje, é que minha equipe vende e atende pelo WhatsApp pessoal. Se o sistema não encaixa nesse jeito de trabalhar, em uma semana todo mundo volta pro WhatsApp e eu fico pagando por algo que ninguém usa." (P014) · "Hoje eu não pago nada pra organizar cliente e orçamento, uso planilha e o grupo de WhatsApp, então R$79 ou R$99 por mês é um gasto novo que eu preciso justificar, não uma troca de um gasto que já existia. Testar de graça eu até testo, mas pagar depois é outra conversa." (P017) |
| price | 1 | "A oferta até tenta resolver o risco de migração, mas R$99 ou R$299 por mês ainda pesa pro que minha agência fatura hoje. Nunca paguei por sistema de gestão nenhum, sempre deu pra ir no jeitinho com planilha e WhatsApp, e com dezembro chegando eu não vou arriscar trocar de ferramenta bem na época que não posso quebrar. No máximo testo de graça pra ver, mas assinar agora, não." (P007) |

### Why they buy

| reason | buyers | in their words |
| --- | ---: | --- |
| trust | 5 | "Já uso outro sistema e tô insatisfeito, mas trocar me dá medo de bagunçar o cadastro dos clientes no meio da alta temporada. Como eles prometem migrar com confirmação de integridade e agendar fora de dezembro-janeiro e julho, e ainda dá pra testar antes de assinar, acho que vale arriscar entrando no plano Pioneira por R$ 79." (P002) · "Tem teste antes de assinar e garantia de migração sem risco, então dá pra testar sem perder dinheiro se não funcionar. Pelo preço do programa Agência Pioneira (R$79) cabe no que eu já não gasto hoje com sistema nenhum, então vale arriscar um mês pra ver se pega." (P005) |
| need | 3 | "Minha vida hoje é WhatsApp pessoal e planilha, e isso já me fez perder cliente de vista no meio do funil. Como eu sou do time que testa ferramenta nova antes de todo mundo, e dá pra testar antes de assinar e entrar no programa Agência Pioneira pagando R$79, eu entro pra testar com uma viagem de verdade antes de migrar tudo." (P001) · "Eu já perco venda de vez em quando porque a planilha vira bagunça e ninguém sabe em que etapa o cliente está. Dá pra testar antes de assinar e a migração é sem risco, então vale pagar um mês pra ver se minha equipe usa de verdade em vez de voltar pro WhatsApp em uma semana." (P004) |
| convenience | 1 | "Eu gosto de testar ferramenta nova antes da galera do grupo, e aqui dá pra começar sem contrato longo, com teste antes de assinar e migração garantida. Pra quem fecha o financeiro sozinho no fim do mês, ter cliente, funil e caixa num lugar só já paga a mensalidade." (P008) |
| price | 1 | "Só assino depois de negociar desconto ou pegar uma promoção de verdade, e o programa Agência Pioneira (R$ 79 por 12 meses) é exatamente isso, além da migração sem risco tirar o medo de perder cadastro de cliente." (P016) |

### What would flip a no

- Ver 2 ou 3 agências pequenas parecidas com a minha, não só o depoimento no site, já usando o sistema há alguns meses sem history de perda de dado - aí eu entraria no teste pra ver com meus próprios olhos antes de migrar de verdade.
- Ver pelo menos uma ou duas agências do meu porte, de verdade, usando o sistema há alguns meses e falando bem — não um depoimento genérico, caso de uso real com nome.
- ver outra agência do meu tamanho usando de verdade, com depoimento e caso real, e poder testar um mês inteiro de orçamento e venda sem travar, fora da alta temporada, antes de decidir pagar.
- Ver uma colega de agência do meu grupo, do mesmo porte, já usando o sistema há alguns meses e falando bem, fora da minha alta temporada.
- Ver pelo menos uma agência do meu tamanho já migrada, operando numa alta temporada inteira sem perder dado, com depoimento real e verificável - não eu entrando como cobaia do programa Pioneira.
- Ver 2 ou 3 agências de viagem brasileiras de porte parecido com o meu já usando de verdade, com depoimento e tempo de uso, não só a promessa da garantia de migração.
- Ver outra agência do meu tamanho que migrou, treinou a equipe e continuou usando depois de 2-3 meses, não só no primeiro mês. E ter a cobrança automática e a nota fiscal funcionando, que é o que realmente pesaria no bolso.
- Ver uma colega dona de agência do meu grupo ou sindicato, que eu já conheço, usando o sistema de verdade e recomendando com nome e caso real — não um depoimento genérico de site.
- Se a cobrança automática e a nota fiscal já estivessem prontas, porque aí eu estaria pagando por uma economia de tempo que já me custa dinheiro de verdade, e não só por uma organização mais bonita do que a planilha.
- Se eu visse 2 ou 3 agências do meu porte, com nome e depoimento público, usando o sistema há uns meses sem problema, e se eu conseguisse entrar no Programa Agência Pioneira com o desconto de R$79 enquanto testo sem compromisso.

Buyers say they would buy **1.0 times** in the first month on average.

20 buyers gave all four price answers. Run founder-pricing's van_westendorp.py on the answers folder.

## Pricing

### 1. O preço, e por quê

**O plano Inicial (R$ 99/mês) fica dentro da faixa aceitável e muito perto do
ponto de indiferença (IPP).** Os 20 compradores simulados do painel deram:

| ponto | valor | o que significa |
| --- | ---: | --- |
| PMC | R$ 49,36 | abaixo disso, parece barato demais pra ser bom |
| OPP | R$ 50,45 | menor resistência (tão barato quanto caro) |
| IPP | **R$ 98,94** | tantos chamam de pechincha quanto de caro |
| PME | R$ 199,07 | acima disso, gente demais não compra |

Faixa aceitável: **R$ 49,36 a R$ 199,07**. O R$ 99 atual está, por coincidência
quase exata, no ponto de indiferença (R$ 98,94) — o preço com menos atrito
possível segundo este painel. Isso é um sinal forte de que o plano Inicial
está bem calibrado, **assumindo que a margem no CFO sustente esse preço**
(`founder/numbers.json` ainda não existe — `/founder-cfo` não rodou. Esse
número não foi inventado aqui; é pendência explícita).

**O plano Profissional (R$ 299/mês) está ACIMA da faixa aceitável** (PME =
R$ 199,07). Isso não significa que R$ 299 esteja errado — agências maiores
(11-50 pessoas) têm orçamento diferente das agências pequenas/solo que
dominam este painel (16 de 20 buyers eram solo/micro ou pequena) — mas é um
risco real a testar antes de assumir que o preço está certo: o painel sugere
que, para o comprador típico simulado, R$ 299 já passa da linha de "caro
demais pra comprar".

**Contra os concorrentes** (de `founder/competitors.md`, só quem publica
preço em reais):
- Agendor: R$ 59-156/usuário/mês — cobra por assento, não por agência. Uma
  agência de 10 pessoas pagaria R$ 590-1.560/mês no Agendor pelo equivalente
  ao que o plano Inicial da Travel Plataforma cobra R$ 99 fixo. Essa é a
  comparação mais direta e mais favorável à Travel Plataforma.
- Omie: a partir de R$ 309/mês — categoria diferente (ERP fiscal completo),
  mas é o teto que um comprador já está disposto a considerar pagar por
  software de gestão.
- PaxGo, PaxPro, Benner Turismo (os concorrentes especializados em turismo):
  nenhum divulga preço publicamente — não dá pra comparar diretamente.

### 2. A escada de planos

A estrutura atual (Inicial R$ 99 / Profissional R$ 299 / Empresarial sob
consulta) já é uma escada bom/melhor/ideal por tamanho de equipe (10 / 50 /
ilimitado usuários). A lacuna de R$ 99 pra R$ 299 (triplicar o preço) é um
salto grande sem um degrau no meio — e R$ 299 cair fora da faixa aceitável
do painel reforça isso. Vale testar um degrau intermediário (ex.: R$ 179-199,
dentro do PME) antes de assumir que o salto direto pra R$ 299 converte bem.

### 3. A oferta de abertura

O painel deixou claro (ver `founder/panel/results.md`) que o motivo de recusa
dominante **não é preço — é falta de prova** (14 de 16 recusas citam a
ausência de agências reais usando o sistema). Por isso, a oferta de abertura
certa aqui não é um desconto genérico (que treina o comprador a esperar
promoção, contra a própria regra deste skill) — é um **preço de fundador
ligado à prova social que falta**:

> "As primeiras 10 agências que assinarem o plano Inicial pagam R$ 79/mês
> (em vez de R$ 99) pelos primeiros 12 meses, em troca de serem referência
> pública (nome, depoimento, caso de uso) assim que estiverem usando o
> sistema." Válido até fechar as 10 vagas ou até uma data definida pelo
> fundador — o que vier primeiro.

Isso resolve duas coisas ao mesmo tempo: testa um preço um pouco abaixo do
IPP, e constrói exatamente a prova social que o painel disse ser a condição
nº 1 para os próximos compradores dizerem sim.

### 4. O que testar com compradores reais

- **R$ 79 vs. R$ 99** no plano Inicial — os dois dentro da faixa aceitável,
  dos dois lados do IPP. Testar com uma pré-venda real (waitlist com cartão
  ou depósito) em duas páginas diferentes, não só uma pergunta.
- **R$ 199 vs. R$ 299** no plano Profissional — R$ 199 é o teto da faixa
  aceitável do painel; R$ 299 é o preço atual, que já está fora dela. Vale
  testar diretamente com os poucos compradores de agência média (que foram
  os que mais compraram no painel, 50%, mas é uma amostra de só 4 pessoas —
  thin, segundo o próprio painel).
- Isso tudo é teste de preço. O teste mais importante, pelo que o painel
  mostrou, é de **prova/confiança**, não de preço — ver `/founder-offer`.

### 5. As objeções de preço do painel (verbatim, as três que mais aparecem)

1. **"R$99 por mês nem é caro, é menos do que pago pro contador, mas ninguém
   está usando isso de verdade ainda."** (P005) — o preço em si não é o
   problema; a falta de prova social é.
2. **"R$ 99 ou R$ 299 por mês é caro pra minha agência hoje, e ainda por cima
   não tem nenhuma agência de verdade usando isso que eu possa perguntar se
   funciona."** (P016) — aqui o preço E a falta de prova aparecem juntos; sem
   prova, o mesmo preço vira "caro".
3. **"Pelo preço eu até topava testar, mas assinar sem referência nenhuma é
   arriscado pro tamanho da minha operação."** (P017) — de novo, o preço não
   é o obstáculo isolado; é o preço combinado com risco percebido sem prova.

Nenhum dos 20 buyers deu preço como motivo isolado e suficiente para recusar.
Isso é o achado mais útil deste exercício de pricing: **o problema que a
Travel Plataforma tem para resolver antes de mexer em preço é confiança, não
valor percebido do preço em si.**

---

Pendência explícita: margem e break-even em cada preço candidato dependem de
`founder/numbers.json`, que ainda não existe (`/founder-cfo` não rodou nesta
sequência). Quando rodar, usar os preços deste documento (R$79/99 e
R$199/299) como os candidatos a testar no `unit_economics.py`.

## The offer

Método: lente de Ofertas (resumo do framework do livro *$100M Offers*, de
Alex Hormozi — nunca apresentado como palavras dele). Material de entrada:
`founder/panel/results.md` (objeções reais do painel), `founder/competitors.md`
(reclamações dos concorrentes), `founder/board.md` (condições do board).
`founder/numbers.json` ainda não existe (`/founder-cfo` não rodou) — os custos
abaixo são estimativas qualificadas (baixo/médio/alto), marcadas como tal, não
números do CFO. Re-testar os custos reais quando o CFO rodar.

### 1. Lista de problemas (na palavra do comprador)

#### Antes de comprar

1. "Não tem nenhuma agência rodando isso em produção pra eu ver funcionando." — o objeção dominante, 14 de 16 recusas no painel.
2. "Já peguei um sistema parecido que travou e perdeu dado na migração." (medo de migração)
3. "Cobrança automática e nota fiscal ainda nem existem" — a promessa financeira não está implementada.
4. "R$99 ou R$299 por mês é caro pra minha agência hoje" (dono de agência solo/micro, baixo faturamento)
5. "Não confio em colocar o CPF/cartão do meu cliente numa plataforma que nunca ouvi falar."
6. "Só confio depois de ver outro dono de agência do mesmo grupo/sindicato recomendar."
7. "Assinar sem desconto e sem ver referência, não." (caçador de promoção)
8. "Já uso [Agendor/Omie/planilha] e trocar dá trabalho demais."
9. Formulário público de lead sem captcha/validação — achado de segurança já identificado, mina a credibilidade de quem pesquisa a empresa antes de assinar.
10. "Justo entrando dezembro/janeiro não posso me arriscar a travar o funil de venda numa ferramenta sem histórico." — risco de tempo/temporada.
11. Nenhum "segredo"/vantagem nomeada — o board apontou que, sem a peça de cobrança/fiscal pronta, a oferta não tem nada que um concorrente não possa copiar.

#### Durante a adoção

12. "Minha equipe não vai usar, vai voltar pro WhatsApp em uma semana." — risco de adoção interna.
13. "Não tenho tempo de treinar ninguém na alta temporada."
14. Erro ocasional de importação de planilha (achado em avaliação real do Agendor — risco genérico de qualquer migração de dados).
15. Sem processo de onboarding claro — a agência fica sozinha depois do cadastro self-service.

#### Depois de comprar

16. "E se o suporte for lento?" — achado real em dois concorrentes (Omie: "mau atendimento no SAC"; PHPTravels: suporte é a categoria com nota mais baixa).
17. "E se cobrarem errado ou o estorno demorar?" — achado real na Omie (ReclameAqui: demora em estornos).
18. "E se eu quiser cancelar — meus dados ficam presos?"
19. Nenhuma garantia declarada hoje se o produto não entregar o que promete.
20. MFA opcional pro super-admin e lacunas de CI/segredo — achado de auditoria ainda não corrigido; não é objeção que o comprador verbaliza, mas é risco real que vira objeção se descoberto.

### 2. Soluções, cortadas e empilhadas

| problema | solução | valor pro comprador (1-5) | custo de entregar (1-5, estimado) |
|---|---|---|---|
| 1, 6, 7, 11 (falta de prova/referência) | Programa "Agência Pioneira": as primeiras agências entram como caso de referência público, com desconto de fundador | 5 | 2 (tempo do fundador, não dev) |
| 2, 14 (medo de perder dado na migração) | Migração assistida da planilha/sistema atual, com checagem de integridade antes de confirmar | 5 | 3 (trabalho manual do time, escala mal sem automação) |
| 3 (cobrança/NFS-e não existe) | **Não dá pra resolver com bônus** — é a lacuna real identificada pelo board e pela pesquisa de concorrentes. Mantida fora do stack; ver nota abaixo. | — | — |
| 4 (preço alto p/ solo) | Preço de fundador R$79 (em vez de R$99) nos primeiros 12 meses — já decidido em `founder/pricing.md` | 4 | 1 (é desconto, não feature) |
| 5 (confiança com CPF/cartão) | Página de segurança honesta: isolamento por agência, 2FA, trilha de auditoria — já existe; falta só corrigir o formulário de lead (captcha/validação) e tornar MFA obrigatório pro super-admin antes de divulgar isso como prova de confiança | 4 | 2 (é código já planejado, não novo) |
| 8 (trocar dá trabalho) | Migração assistida (mesmo bônus do item 2) cobre isso também | 4 | (já contado) |
| 9 (form de lead sem captcha) | Corrigir antes de qualquer campanha paga — condição do board, não um bônus de marketing | — | 1 (correção técnica pontual) |
| 10, 13 (timing de alta temporada) | Migração agendada **fora** de dezembro-janeiro e julho, por escolha do cliente | 5 | 1 (é política, não código) |
| 12 (equipe volta pro WhatsApp) | Checklist de adoção de 30 dias + treinamento guiado no onboarding | 4 | 3 (tempo humano de suporte/sucesso do cliente) |
| 15 (onboarding sozinho) | Mesmo onboarding guiado do item 12 | 4 | (já contado) |
| 16, 17 (suporte lento, estorno demorado) | Compromisso declarado de prazo de resposta de suporte (ex.: 1 dia útil) — só prometer depois de ter estrutura pra cumprir | 4 | 2 (processo, não feature nova) |
| 18 (dados presos ao cancelar) | Exportação de dados garantida no cancelamento, sem custo | 4 | 2 (feature técnica simples: export CSV/JSON) |
| 19 (sem garantia) | Garantia de Migração Sem Risco (ver seção 3) | 5 | depende da taxa de acionamento — não modelada ainda (falta CFO) |

**Nota importante sobre o problema 3**: nenhuma oferta, bônus ou garantia
cobre honestamente "cobrança automática e NFS-e não existem" — isso só se
resolve implementando o código (já especificado em ADR, ainda não construído,
por `founder/board.md`). Incluir isso no pitch como "em desenvolvimento" (como
já está) é a única opção honesta até o código existir. Prometer um bônus que
disfarce essa lacuna violaria a regra de nunca prometer o que não se pode
entregar.

### 3. A pilha final

**O núcleo**: um sistema para a agência organizar cliente, orçamento, venda e
operação em um só lugar — descrito pelo resultado ("pare de perder venda
porque ninguém viu a planilha a tempo"), não pelos módulos.

**Bônus** (cada um mata uma objeção específica):
1. **Migração assistida sem risco** — a equipe da Travel Plataforma migra os
   dados da planilha/sistema atual, confere a integridade antes de confirmar,
   e agenda fora da alta temporada (dez-jan, julho) por escolha do cliente.
   Mata as objeções 2, 8, 10, 13, 14.
2. **Selo Agência Pioneira** — as primeiras agências que assinarem entram
   como caso de referência público (nome, depoimento, estudo de caso) e
   pagam o preço de fundador (R$ 79/mês nos primeiros 12 meses, plano
   Inicial). Mata as objeções 1, 4, 6, 7, 11 — a lacuna de prova social que
   domina as recusas do painel.
3. **Checklist de adoção de 30 dias** — treinamento guiado pra equipe nas
   primeiras quatro semanas, com check-ins, pra equipe não "voltar pro
   WhatsApp em uma semana". Mata a objeção 12, 15.

**A garantia — Garantia de Migração Sem Risco**: se a migração perder ou
corromper dado do cliente, a Travel Plataforma devolve 100% do valor pago até
aquele momento e ajuda a reverter para o sistema anterior sem custo. **Esta
garantia é estreita por design**: cobre o que a empresa já consegue cumprir
hoje (migração de dados), não cobre o que ainda não existe (cobrança/NFS-e,
que continua fora do produto e não deve ser prometido). Antes de ampliar essa
garantia pra "satisfação geral" ou "resultado de vendas", rodar
`/founder-cfo` pra modelar o custo numa taxa de acionamento realista — não
modelado aqui porque `founder/numbers.json` não existe ainda.

**Urgência e escassez**: real, não fabricada — "Agência Pioneira" é
genuinamente limitada a um número fixo de vagas (ex.: 10, a confirmar com o
fundador) porque o valor do bônus (ser referência) desaparece se for
oferecido a 200 agências ao mesmo tempo. Sem contagem regressiva falsa, sem
"restam 3 vagas" inventado — o número real de vagas preenchidas deve ser
atualizado de verdade conforme agências entram.

**O nome**: **Programa Agência Pioneira**.

### 4. Pontuação na equação de valor (1-10)

| elemento | antes (pitch.md original, testado no painel) | depois (com a pilha) | o que mudou |
|---|---:|---:|---|
| Resultado dos sonhos | 6 | 6 | o escopo do produto não mudou — parar de perder venda em planilha continua sendo o resultado desejado, nem mais nem menos atraente |
| Probabilidade percebida | 3 | 7 | Selo Agência Pioneira (prova social real) + Garantia de Migração Sem Risco atacam direto a objeção nº 1 do painel |
| Tempo até o resultado | 5 | 7 | migração assistida com prazo definido e agendada fora da alta temporada — antes não havia prazo nenhum prometido |
| Esforço e sacrifício | 4 | 6 | checklist de adoção reduz o risco de a equipe abandonar; mas a cobrança/NFS-e continuarem fora do sistema significa que a agência AINDA faz essa parte manualmente — não dá pra fingir que o esforço caiu a zero |

Nenhuma pontuação de "esforço" chegou a 10 porque a lacuna financeira é real
e a oferta não a escondeu.

### 5. Reteste com o painel

Pitch anterior preservado em `founder/pitch-v1.md`. Resultado completo do
painel original em `founder/panel-v1/results.md`; resultado completo do
reteste em `founder/panel/results.md` (cópia em `founder/panel/results-v2.md`).
Mesma seed (935677) nos dois — os 20 compradores são literalmente as mesmas
pessoas simuladas, reagindo à nova oferta.

**Taxa de compra: 20% (4/20) → 50% (10/20).** Mais que dobrou.

**O que mudou de "não" pra "sim" (6 compradores):** P002, P005, P008, P016,
P018, P019 — a razão que mais aparece é a combinação do preço de fundador
(R$79) com a garantia de migração sem risco removendo o medo específico de
perder dado de cliente, que era a trava mais citada no painel original.

**O que continuou "não" mesmo com a nova oferta (10 compradores):** a
objeção não mudou de natureza — ainda é majoritariamente confiança/prova
social (7 de 10 recusas, reason_code "trust"), só que agora com uma camada
nova e importante, levantada por vários compradores de forma quase
idêntica:

> **"Entrar como 'Agência Pioneira' significa eu ser a cobaia sem ter nenhum
> caso real pra olhar antes."** (P003)

> **"...não um depoimento genérico de site... não eu entrando como cobaia
> do programa Pioneira."** (P008, onda 2)

**Este é o achado mais importante do reteste**: o Programa Agência Pioneira
resolve a objeção de preço e parcialmente a de risco de migração, mas **pede
exatamente a coisa que metade do painel não tem condição de dar** — ser a
primeira prova, quando o próprio perfil de comprador (decide em grupo/
associação, ou é cauteloso por natureza) só compra depois de ver OUTRA
agência like-size já usando. Para esse subconjunto específico de compradores
(ex.: "decide em grupo/associação" ficou em 0% de compra nas duas rodadas),
a oferta precisa de uma segunda camada que não exija ser o primeiro — por
exemplo, recrutar 2-3 agências via conexões pessoais do fundador (fora do
programa Pioneira, sem pedir que sejam referência pública) só para ter uma
prova de uso real e verificável antes mesmo de abrir o Programa Pioneira pro
público. Isso é uma recomendação para `/founder-launch` (teste real antes do
lançamento), não algo que a oferta por si só resolve.

A segunda camada de objeção, que não mudou: cobrança automática e NFS-e
continuam "em desenvolvimento" — pelo menos 3 compradores que compraram
mesmo assim deixaram claro que a decisão de sair do teste e virar cliente
pagante de verdade depende disso ser entregue.

## The numbers

**Nota: todos os valores abaixo estão em reais (R$), não dólares — o símbolo
"$" é só o formato padrão da ferramenta.** Fontes de cada número em
`founder/cfo-sources.md`; vários são estimativas marcadas como tal, não
faturas reais.

### A nota do CFO

- **A margem**: contribuição de R$ 81 por agência-mês (82% do preço) — alta,
  porque o custo variável de um SaaS é baixo (infra + processamento +
  suporte somam só R$ 18). Na meta de regime (50 agências), a margem de
  lucro é **62%**.
- **A linha a observar não está nem na tabela "what-if" abaixo — é o
  pró-labore que ainda não existe.** Hoje o custo fixo é só R$ 1.000/mês
  (ferramentas, sem salário). Rodei o mesmo modelo supondo um pró-labore de
  R$ 9.000/mês (um dos cenários que o fundador apontou como possível) e o
  resultado muda de forma dramática: o break-even salta de **13 para 124
  agências/mês** — mais que o DOBRO da própria meta de regime (50) — e a
  margem na meta viraria **-120%** (prejuízo). Arquivo completo desse
  cenário em `founder/cfo-scenario-com-equipe.md`. **Antes de qualquer
  decisão de tirar pró-labore ou contratar, rodar este número de novo com o
  valor real.**
- **Caixa**: só R$ 2.680 necessários antes do negócio se pagar (muito baixo
  porque o custo fixo de hoje é muito baixo — ver ponto acima sobre por que
  isso pode mudar). Retorno do gasto inicial: mês 8, na meta de 50 agências
  ao longo do ano 1.
- **Três formas de melhorar a margem** (rodadas na própria ferramenta, não
  chutadas):
  1. Nenhuma das variações testadas (preço -10%, volume -20%, custo unitário
     +15%) tira o negócio do verde — a margem na meta cai de 62% pra 57-59%
     no pior caso. Isso é bom: o modelo atual é resistente a esses três
     riscos específicos.
  2. **Confirmar a taxa real do Asaas** (`founder/cfo-sources.md` — a usada
     aqui é estimativa de mercado, não a tabela oficial) — se a taxa real
     for maior que os 4% estimados, a margem cai, mas nada nos testes
     indica que isso quebre o modelo.
  3. **O maior ganho de margem possível aqui não vem de cortar custo — vem
     de manter o custo de equipe baixo o máximo que der** enquanto a base de
     clientes ainda é pequena, dado o quanto o pró-labore move o resultado
     (ponto acima).
- **Condições do board sobre dinheiro** (`founder/board.md`): o board não
  exigiu uma margem específica — exigiu prova de cliente real, segurança
  corrigida e a integração Asaas/NFS-e implementada antes de escalar
  investimento. Este CFO **não modela o custo de terminar essa integração**
  (pendência explícita, ver `founder/cfo-sources.md`) — então mesmo a margem
  saudável de 62% aqui vale apenas para o produto como está hoje (sem
  cobrança/fiscal), não para a visão completa que a landing page anuncia.

**Isto não é consultoria financeira, tributária ou legal.** Antes de mexer
em qualquer dinheiro real — contratar, tirar pró-labore, abrir conta PJ —
um contador deve revisar a estrutura, os encargos de folha e os impostos
reais do regime tributário escolhido.

---

Every number below comes from the input file. Nothing is looked up or guessed.

### One agência-mês (uma agência assinante, um mês)

| line | per agência-mês (uma agência assinante, um mês) |
| --- | ---: |
| Price | $99.00 |
| Hospedagem/infraestrutura alocada por tenant (estimativa) | -$8.00 |
| Taxa de processamento da cobrança da mensalidade, ~4% (estimativa) | -$4.00 |
| Suporte ao cliente alocado por conta (estimativa) | -$6.00 |
| **Contribution** (what each agência-mês (uma agência assinante, um mês) leaves to pay the fixed costs) | **$81.00** (82%) |

### The margin that matters

Fixed costs: $1,000 a month (Ferramentas e infraestrutura base (hosting fixo, e-mail, monitoramento) — informado pelo fundador $1,000).

- **Break-even: 13 agência-mês (uma agência assinante, um mês)s a day.** Below that you lose money every month.
- **Profit margin at your plan** (50 a day): **62%** of every sale, after every cost.
- Capacity: 100000 a day.

### Year 1, month by month

| month | agência-mês (uma agência assinante, um mês)s a day | revenue | profit | cumulative (after $300 startup) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 1 | $99 | -$919 | -$1,219 |
| 2 | 3 | $297 | -$757 | -$1,976 |
| 3 | 6 | $594 | -$514 | -$2,490 |
| 4 | 10 | $990 | -$190 | -$2,680 |
| 5 | 15 | $1,485 | $215 | -$2,465 |
| 6 | 20 | $1,980 | $620 | -$1,845 |
| 7 | 26 | $2,574 | $1,106 | -$739 |
| 8 | 32 | $3,168 | $1,592 | $853 |
| 9 | 38 | $3,762 | $2,078 | $2,931 |
| 10 | 43 | $4,257 | $2,483 | $5,414 |
| 11 | 47 | $4,653 | $2,807 | $8,221 |
| 12 | 50 | $4,950 | $3,050 | $11,271 |

- **Year 1 operating profit: $11,571** on $28,809 of revenue.
- After the $300 startup spend: $11,271.
- Startup money earned back: month 8.
- Cash you need before it pays for itself: **$2,680**.

### What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | 62% | 13 | $11,571 |
| Price -10% | 57% | 15 | $8,690 |
| Volume -20% | 57% | 13 | $6,857 |
| Unit costs +15% | 59% | 13 | $10,785 |

No red flags in these numbers. They are only as good as the inputs: check every cost against a real quote.

## Marketing

Evidência usada: `founder/panel/results.md` (reteste, 50% de compra) e
`founder/panel-v1/results.md` (painel original, 20%), `founder/competitors.md`,
`founder/offer.md`, `founder/pricing.md`, `founder/numbers.json`/`founder/cfo.md`.

### 1. Posicionamento

Três versões, usando o molde do skill:

1. **Recomendada.** Para agências de viagem pequenas que ainda organizam
   cliente e venda em planilha e grupo de WhatsApp, com medo de perder venda
   porque ninguém viu a cotação a tempo, a Travel Plataforma é o sistema de
   gestão que junta cliente, funil e operação num só lugar, com migração
   assistida e garantia contra perda de dado — diferente de continuar na
   planilha sozinho ou de um CRM genérico cobrado por usuário (Agendor,
   Pipedrive) que não entende o fluxo de uma agência.
2. Para dono de agência que já usa um sistema e está insatisfeito, a Travel
   Plataforma é o sistema feito pra agência de viagem brasileira que migra
   seus dados com garantia, sem travar no meio da alta temporada —
   diferente de continuar com um sistema genérico ou trocar sem rede de
   segurança.
3. Para quem só confia depois de ver um colega de grupo/sindicato usando, a
   Travel Plataforma é o Programa Agência Pioneira: as primeiras agências
   entram com preço reduzido e se tornam a prova que a próxima vai procurar
   — diferente de pedir pra confiar sem nenhuma referência.

**Por que a #1**: é o grupo mais numeroso do painel (6 de 20 compradores,
"ainda usa planilha + WhatsApp") e o que mais mudou de "não" pra "sim" entre
o painel original e o reteste (33% → 67% de compra) — a maior alavanca já
comprovada. O "resultado dos sonhos" ("pare de perder venda em planilha")
aparece quase palavra por palavra em várias respostas de "por que compram"
(`founder/panel/results.md`).

### 2. Canais

| canal | por que serve esse comprador | custo aproximado | como saber se funcionou |
| --- | --- | --- | --- |
| **Grupos de WhatsApp e associações/sindicatos de agentes de viagem** | O painel mostrou, nas duas rodadas, que "decide em grupo/associação" só compra depois de ver um colega recomendar — e vários compradores pedem "caso real com nome", não anúncio. É o canal que resolve a objeção nº 1. | Baixo (tempo do fundador, participação real nos grupos) | Nº de cadastros que citam indicação de colega/grupo no formulário |
| **Parceria com consolidadoras que já atendem agências** (ex.: o tipo de parceria que a UTravel fez com a PaxPro, achado em `founder/competitors.md`) | Essas empresas já têm a distribuição que a Travel Plataforma não tem — resolve a lacuna de distribuição que o board apontou. | Médio (comissão ou parceria de divulgação) | Nº de agências vindas via parceiro, CAC desse canal especificamente |
| **Busca paga (Google Ads) para termos como "sistema para agência de viagem"** | Capta quem já está comparando ativamente — inclui o "caçador de desconto" do painel, que decide por preço/promoção. | Médio/alto por clique | CPL (custo por lead) e CAC real, comparado ao teto da seção 5 |

**O que NÃO fazer agora**: anúncio amplo em redes sociais (Instagram/Facebook
ads genéricos) para um público não segmentado. O público é pequeno e
nichado, e a decisão depende de prova social específica do setor, não de
alcance — alcance largo gastaria orçamento sem resolver a objeção real.

### 3. Campanha de 30 dias

Datas relativas ao lançamento (D0 — a data real é decidida em
`/founder-launch`, não inventada aqui).

| dia | canal | o que vai ao ar |
| --- | --- | --- |
| D-14 | Grupos/associações | Fundador se apresenta nos grupos que já participa, sem vender ainda — só avisando que está construindo algo pra resolver a dor da planilha. |
| D-10 | Parceria | Primeiro contato com 1-2 consolidadoras/parceiros em potencial pra propor indicação. |
| D-7 | WhatsApp/e-mail de quem já demonstrou interesse | Hook #1 e #9 (ver lista abaixo) |
| D-3 | Grupos/associações | Anúncio do Programa Agência Pioneira — vagas limitadas, preço de fundador |
| D0 (lançamento) | Todos os canais | Hook #3 (a oferta) + link de cadastro |
| D+2 | Google Ads | Início da busca paga, orçamento inicial baixo pra testar CPL |
| D+5 | Grupos/associações | Hook #2 (garantia de migração) |
| D+8 | Bastidores (sem novidade) | Como funciona a migração assistida, por dentro |
| D+12 | Parceria | Primeiro caso (se houver agência via parceiro) ou atualização do progresso |
| D+16 | Todos | Status das vagas do Programa Pioneira (real, não contagem regressiva falsa) |

#### Os dez hooks (cada um responde uma objeção real do painel)

1. "Pare de perder venda porque ninguém viu a cotação na planilha a tempo." — resultado dos sonhos, repetido nas respostas de compra.
2. "Já migrou de sistema e perdeu dado no meio do caminho? Nossa migração tem garantia de devolução total se isso acontecer." — objeção de medo de migração.
3. "As primeiras agências pagam R$79/mês por 12 meses, dentro do Programa Agência Pioneira." — a oferta de abertura.
4. "Equipe que volta pro WhatsApp em uma semana? Por isso o onboarding tem um checklist de adoção de 30 dias." — objeção de adoção.
5. "Cobrança automática e nota fiscal: hoje em desenvolvimento, sem enrolação. CRM, funil e operação: funcionando hoje." — honestidade sobre a lacuna que o board identificou; nunca anunciar o que não existe.
6. "Agende sua migração fora de dezembro-janeiro e julho — você escolhe quando." — objeção de alta temporada.
7. "R$99 por mês custa menos do que boa parte das agências já gasta todo mês com outras ferramentas espalhadas." — reposicionamento de preço (não é citação literal de comprador, é mensagem própria).
8. "Teste antes de assinar. Sem contrato longo." — reduz esforço percebido.
9. "Feito pra agência de viagem brasileira — não é CRM genérico cobrado por usuário." — contra Agendor/Pipedrive.
10. "Quem organiza cliente e venda numa planilha e num grupo de WhatsApp, levanta a mão." — hook de topo de funil, identifica a dor antes de vender.

**Regra seguida**: nenhum hook usa depoimento, nota, contagem de seguidores ou
"como visto em" fabricados. As falas do painel de consumidores são pesquisa
interna, nunca citadas como depoimento de cliente real em peça de marketing.

#### O que postar quando não há novidade

Bastidores da migração assistida de uma agência de teste, bastidores de
construção do produto, e uma "pergunta da semana" respondendo uma dúvida real
recebida — tudo verdadeiro, nada fabricado.

### 4. Orçamento e números

- **Teto de CAC (custo de adquirir um cliente)**: o CFO (`founder/cfo.md`)
  calcula contribuição de R$ 81 por agência-mês. Sem dado real de
  retenção/churn (zero clientes pagantes até hoje — não modelado), a
  suposição de planejamento é payback em até 3 meses de contribuição:
  **CAC máximo ≈ R$ 243 por agência**. Isso é uma suposição de
  planejamento, não uma fórmula com dado real de LTV — revisar assim que
  houver dado real de retenção.
- **Divisão do orçamento inicial** (qualquer valor total que o fundador
  decidir investir): grupos/associações ~0% em mídia (é tempo, não R$);
  parceria ~30% (comissão/incentivo); busca paga ~70% (é o único canal pago
  de mídia nesta lista, então recebe a maior parte do orçamento em anúncio).
- **Três números a observar toda semana**:
  1. Nº de cadastros/demos solicitados pela landing page, por canal.
  2. Taxa de conversão cadastro → primeira mensalidade paga (Programa
     Pioneira).
  3. CAC real por canal, comparado ao teto de R$ 243.
  **Quando mudar algo**: se o CAC de um canal passar o teto por 2 semanas
  seguidas, ou se a conversão cadastro→pago ficar muito abaixo da taxa de
  compra do painel (50% no reteste) — um nível muito mais baixo, como
  10%, é sinal de que a objeção de confiança não foi resolvida na prática
  como foi no painel simulado.

## Brand

**Adaptação**: este skill foi feito pra batizar um negócio novo. A Travel
Plataforma já existe, já tem nome, logo e cores em produção
(`apps/marketing/src/components/Logo.tsx`, `apps/marketing/src/index.css`).
Por isso, os passos 2-4 abaixo avaliam o que já existe contra o
posicionamento que o pacote encontrou (`founder/marketing.md`), em vez de
gerar 10 nomes novos para um negócio que já opera sob este nome.

### 1. O nome e a checagem que falta

**Nome atual: "Travel Plataforma"** — já em uso em produção, domínio
`travelplataforma.com.br` registrado e funcionando, com os apps
`app.travelplataforma.com.br` e `travellite.travelplataforma.com.br` já no
ar. Não há motivo, vindo desta pesquisa, pra recomendar troca de nome.

**O que não foi verificado nesta conversa, e deveria ser, antes de escalar
investimento em marketing**: se "Travel Plataforma" está registrado como
marca no INPI (Instituto Nacional da Propriedade Industrial, o registro de
marcas do Brasil). Um nome tão descritivo ("travel" + "plataforma") pode ser
difícil de registrar por ser genérico, e nenhum concorrente achado na
pesquisa (`founder/competitors.md`) usa nome parecido — então o risco de
confusão com concorrente é baixo, mas o risco de *não conseguir registrar*
por ser descritivo é uma pergunta real pra um advogado de marcas responder,
não eu. Isto não é parecer jurídico.

- Busca pública que o usuário pode fazer agora: [busca de marcas no INPI](https://busca.inpi.gov.br/pePI/) pelo termo "Travel Plataforma" e variações, na classe de serviços de software/SaaS (classe 42) e de agenciamento de viagens (classe 39).
- Handles: `@travelplataforma` — não verificado nesta conversa se está livre no Instagram/TikTok/X; checar diretamente.

### 2. Voz e promessa

**A promessa, em uma linha**: *agência de viagem organiza cliente, orçamento
e venda num lugar só — e para de perder venda porque ninguém viu a cotação a
tempo.*

**Tagline, três opções** (testar com o público real, nenhuma testada no
painel):
1. "Sua agência, fora da planilha."
2. "O sistema que sua agência já devia ter."
3. "Nenhuma venda perdida na planilha."

**A voz, em três adjetivos** (calibrados pela honestidade que o board e a
pesquisa de concorrentes exigiram — nunca prometer o que o produto não
entrega hoje):

| adjetivo | fazer | não fazer |
| --- | --- | --- |
| **Direta** | Dizer exatamente o que funciona hoje e o que está em desenvolvimento, como em `founder/pitch.md`. | Usar linguagem vaga tipo "solução completa de gestão" sem dizer o que está pronto. |
| **Prática** | Falar da dor real (planilha, WhatsApp, venda perdida), nas palavras que o painel de compradores usou. | Falar de "transformação digital" ou jargão de inovação que nenhum comprador do painel usou. |
| **Sem enrolação sobre o que falta** | Nomear "cobrança automática e nota fiscal em desenvolvimento" como fato, sempre que relevante. | Deixar a lacuna implícita ou deixar o cliente descobrir sozinho depois de assinar. |

**Antes/depois de uma linha do pitch** (`founder/pitch.md`):
- Antes (mais genérico, versão anterior ao offer): *"A Travel Plataforma é
  um sistema online para agências de viagem organizarem clientes, orçamentos
  e vendas em um só lugar."*
- Depois (mais direto, na voz acima): *"Pare de perder venda porque ninguém
  viu a cotação na planilha a tempo — é pra isso que a Travel Plataforma
  existe."*

### 3. O visual, como já está (briefing, não mood board)

#### Cor

Tokens reais de `apps/marketing/src/index.css`, com o teste de contraste
rodado agora (fórmula WCAG, não estimativa):

| cor | hex | função | contraste em branco | passa AA pra texto normal (4.5:1)? |
| --- | --- | --- | ---: | --- |
| Navy | `#0f2a4a` | texto principal, títulos | 14,48:1 | Sim, com folga (passa até AAA) |
| Accent/cobalt | `#1554d1` | links, botões, destaque | 6,52:1 | Sim (passa AA, não passa AAA de 7:1) |
| Cyan | `#06b6d4` | **só decorativo** | 2,43:1 | **Não** — nunca usar como cor de texto em fundo branco |
| Paper-deep | `#f3f4f6` | fundo de seção alternado | — | É fundo, não texto |

**Achado real deste teste**: o cyan (`#06b6d4`), que aparece nos tokens do
CSS, **falha o contraste mínimo de acessibilidade (WCAG AA) se usado como
texto em fundo branco** — 2,43:1, bem abaixo do mínimo de 4,5:1. Usar só
como elemento decorativo (ícone, linha, destaque gráfico pequeno), nunca
como cor de texto ou de botão com texto por cima.

#### Tipografia

Já definida: **Fraunces** (serifada, para títulos/display) e **Inter**
(sans-serif, para texto) — ambas fontes gratuitas (Google Fonts), sem
problema de licença. Nenhuma mudança recomendada; a combinação serifada +
sans já dá o tom "editorial" que a sessão anterior escolheu deliberadamente
(contra o visual "pastel/arredondado" que o fundador rejeitou).

#### Logo

O logo atual é um wordmark desenhado à mão (traço único, sem depender de
fonte instalada) — **não é literalmente um ícone de bússola**, apesar do
conceito ter sido escolhido com esse nome numa sessão anterior. Está
funcional e consistente com a direção visual branca/cobalt escolhida. Nenhum
motivo encontrado nesta pesquisa pra redesenhar.

**Onde precisa funcionar** (checar, não assumido): favicon/ícone de app em
32px (os traços finos do wordmark podem ficar ilegíveis muito pequenos —
vale conferir visualmente), cabeçalho do site, e qualquer peça de
marketing impressa/PDF que vier a existir.

#### Os cinco primeiros pontos de contato

1. **A home/landing page**: já existe, já reflete a direção visual branca +
   cobalt. Ajustar a copy do hero pra usar a promessa da seção 2 acima
   ("pare de perder venda na planilha"), em vez de linguagem genérica de
   módulos.
2. **O cadastro/onboarding**: deve ser o primeiro lugar que menciona o
   Programa Agência Pioneira e a garantia de migração — é onde a oferta
   (`founder/offer.md`) precisa aparecer, não só na landing page.
3. **A confirmação de migração concluída**: é o momento de confiança mais
   importante identificado pelo painel — vale um e-mail/mensagem específico,
   não genérico, confirmando que os dados vieram inteiros.
4. **O primeiro post nos grupos/associações** (`founder/marketing.md`,
   canal nº 1): deve usar a voz "direta, prática, sem enrolar sobre o que
   falta" — nunca o tom de anúncio genérico de SaaS.
5. **A resposta à primeira reclamação**: dado que dois concorrentes
   (`founder/competitors.md`: Omie, PHPTravels) têm suporte lento como ponto
   fraco documentado, a resposta rápida e pessoal à primeira reclamação real
   é uma oportunidade de diferenciação, não só um dever.

## Operations

### 1. O ciclo diário

O negócio é um SaaS B2B, não uma loja física — o "ciclo diário" é sobre
atender quem já está dentro e trazer quem ainda não está, não sobre abrir
uma loja.

| passo | o que é | o cliente vê? |
| --- | --- | --- |
| 1. Checar cadastros/demos novos | Ver quem se cadastrou ou pediu demo nas últimas 24h | Não |
| 2. Responder leads | Primeiro contato com quem se cadastrou, idealmente no mesmo dia | **Sim** |
| 3. Migração assistida (quando houver agência em processo) | Migrar dados da planilha/sistema atual, confirmar integridade, agendar fora de alta temporada se o cliente pedir | **Sim** — é o bônus central da oferta (`founder/offer.md`) |
| 4. Suporte a clientes ativos | Responder dúvidas, dentro do prazo declarado em `founder/marketing.md` | **Sim** |
| 5. Monitorar a produção | Checar status dos serviços (hospedagem, banco de dados), erros, backups | Não (a menos que falhe) |
| 6. Fechar o dia | Nenhuma rotina de "caixa" como um comércio físico — mas revisar se algo ficou pendente de resposta | Não |
| 7. Revisão semanal | Os três números de `founder/marketing.md` (cadastros, conversão, CAC) | Não |

### 2. Fornecedores reais

A Travel Plataforma já roda sobre fornecedores escolhidos (confirmado no
código/configuração do projeto, não suposição):

| fornecedor | pra quê | preço público | observação |
| --- | --- | --- | --- |
| **Supabase** | Banco de dados (Postgres) e armazenamento de arquivo | Plano gratuito até certo uso; planos pagos a partir de US$25/mês — [supabase.com/pricing](https://supabase.com/pricing) | Confirmar o plano atual contratado; se pago, somar ao `fixed_monthly` do CFO (`founder/numbers.json` hoje só tem R$1.000 genérico de "ferramentas" — confirmar se Supabase já está incluído nesse valor). |
| **Vercel** | Hospedagem do site de marketing e/ou do app | Plano Hobby gratuito; Pro a partir de US$20/mês por usuário — [vercel.com/pricing](https://vercel.com/pricing) | Mesma observação acima. |
| **Render** | Hospedagem da API do Travel Lite (achado em sessão anterior: cold-start no plano gratuito/starter) | Planos a partir de US$7/mês pra evitar cold-start — [render.com/pricing](https://render.com/pricing) | **Ação concreta recomendada**: o cold-start já identificado como problema real de acesso é sintoma de estar no tier gratuito; subir pro tier pago resolve e tem preço público conhecido. |
| **Asaas** | Cobrança recorrente (Pix/boleto/cartão) e NFS-e — já decidido no ADR-BILLING-001, ainda não implementado em código | Tarifas por transação — **a tabela oficial não foi confirmada nesta pesquisa** (busca pública não encontrou a página de preços vigente); confirmar em [asaas.com](https://www.asaas.com) antes de orçar | Pendência já registrada em `founder/cfo-sources.md`. |

**Fornecedores que faltam decidir** (não inventados aqui):
- E-mail transacional (confirmação de cadastro, migração concluída) — nenhum provedor identificado no código revisado nesta sessão.
- Ferramenta de suporte ao cliente — hoje provavelmente e-mail/WhatsApp manual; decidir se cresce pra uma ferramenta dedicada (ex.: um helpdesk) conforme o número de clientes passar de ~20-30 (quando suporte manual deixa de escalar).
- Monitoramento/alerta de uptime — não identificado; recomendado antes de ter clientes pagantes reais, já que o achado de concorrentes (`founder/competitors.md`) mostra que suporte/estabilidade é onde Omie e PHPTravels perdem pontos.

### 3. Pessoas

Hoje: **só o fundador, sem pró-labore** (confirmado na pergunta do CFO).
Rota pra o primeiro mês (volume baixo, Programa Agência Pioneira):

| responsabilidade | quem | quando |
| --- | --- | --- |
| Responder leads e demos | Fundador | Diário |
| Migração assistida | Fundador | Conforme agência entra, agendada fora de alta temporada |
| Suporte | Fundador | Diário, dentro do SLA declarado |
| Marketing/grupos/parcerias | Fundador | Conforme calendário de `founder/marketing.md` |
| Desenvolvimento (inclusive a integração Asaas/NFS-e pendente) | Fundador | Contínuo |

**Risco estrutural, não escondido**: é a mesma pessoa fazendo venda, suporte,
migração e desenvolvimento. Na meta de regime do CFO (50 agências), isso já
é tensionado — ver seção de riscos abaixo. Contratar a primeira pessoa muda
o `fixed_monthly` do CFO de forma dramática (`founder/cfo.md` já modelou o
cenário de R$9.000/mês de pró-labore/equipe: break-even salta de 13 para 124
agências). Qualquer decisão de contratar deve voltar pro CFO antes de
confirmar.

### 4. Rotinas (SOPs)

**SOP 1 — Responder um novo cadastro/demo**
1. Confirmar recebimento em até 24h (meta declarada em `founder/marketing.md`).
2. Perguntar: tamanho da agência, sistema/planilha atual, maior dor hoje.
3. Oferecer teste antes de assinar, sem contrato longo (`founder/pitch.md`).
4. Se aceitar, agendar a migração (SOP 2).

**SOP 2 — Migração assistida (o bônus central da oferta)**
1. Pedir exportação dos dados atuais da agência (planilha ou sistema).
2. Confirmar com o cliente se ele quer migrar fora da alta temporada
   (dezembro-janeiro, julho) — se sim, agendar pra depois.
3. Importar os dados num ambiente de teste primeiro, nunca direto em produção.
4. Conferir contagem de registros e amostra de dados antes/depois.
5. Só confirmar a migração como concluída com o cliente revisando o resultado.
6. Se algo falhar ou dado for perdido/corrompido: acionar a Garantia de
   Migração Sem Risco (`founder/offer.md`) — devolução integral e ajuda a
   voltar pro sistema anterior.

**SOP 3 — Lidar com uma reclamação**
1. Responder no mesmo dia, mesmo que só pra confirmar que está sendo visto.
2. Nunca prometer prazo que não pode cumprir (ligado à seção 5 de
   `founder/marketing.md` sobre suporte lento ser ponto fraco de concorrentes).
3. Se for sobre algo que o produto não faz hoje (cobrança/NFS-e), ser direto:
   "está em desenvolvimento, ainda não disponível" — nunca prometer data que
   não é real.

**SOP 4 — Fechamento/revisão semanal**
1. Ver os três números de `founder/marketing.md` (cadastros, conversão, CAC).
2. Ver se alguma migração ficou pendente de confirmação.
3. Ver status das vagas do Programa Agência Pioneira (número real, não
   estimado).

**SOP 5 — Revisão mensal de custo** (equivalente ao "reorder" semanal de um
negócio físico)
1. Confirmar fatura real de Supabase/Vercel/Render contra o que está no
   `founder/numbers.json`.
2. Se qualquer fornecedor mudar de preço, atualizar `founder/numbers.json`
   e rodar o CFO de novo.

### 5. Ferramentas

| função | ferramenta | preço público |
| --- | --- | --- |
| Banco de dados/armazenamento | Supabase | ver seção 2 |
| Hospedagem (marketing/app) | Vercel | ver seção 2 |
| Hospedagem (API Travel Lite) | Render | ver seção 2 |
| Cobrança/fiscal (pendente de implementar) | Asaas | ver seção 2 |
| E-mail, suporte, monitoramento | **não decidido** | — |

### 6. Licenças, registros e seguros (checklist — confirmar com contador/advogado, não é parecer jurídico)

- **CNPJ e regime tributário** (provavelmente Simples Nacional pro estágio
  atual) — confirmar em [gov.br/empresas-e-negocios](https://www.gov.br/empresas-e-negocios/pt-br).
- **ISS municipal sobre serviço de software** — alíquota e cadastro variam
  por município; confirmar na prefeitura onde a empresa está sediada.
- **LGPD (Lei Geral de Proteção de Dados)** — a plataforma processa CPF e
  dados pessoais de clientes finais das agências; isso já apareceu como
  preocupação real no painel de compradores (`founder/panel/results.md`:
  "não confio em colocar o CPF/cartão do meu cliente numa plataforma que
  nunca ouvi falar"). Conferir o site da [ANPD](https://www.gov.br/anpd/pt-br)
  pra requisitos de empresas que tratam dado pessoal como a Travel
  Plataforma trata.
- **Registro de marca (INPI)** — já citado em `founder/brand.md`.
- **Nota fiscal de serviço (NFS-e) da própria Travel Plataforma** (cobrar as
  agências pela mensalidade) — distinto da NFS-e que a Travel Plataforma
  pretende emitir EM NOME das agências (isso é o ADR-FISCAL-001, ainda não
  implementado). A própria empresa já precisa emitir nota pra cobrar as
  agências hoje, independente da feature não estar pronta.
- **Seguro de responsabilidade civil/cyber** — não obrigatório, mas comum
  pra empresas que guardam dado de pagamento/pessoal de terceiros; conferir
  com uma corretora.

### 7. Registro de riscos (os dez mais prováveis)

| risco | probabilidade | impacto | plano |
| --- | --- | --- | --- |
| Migração perde/corrompe dado real de cliente | Média | Alto | SOP 2 (testar antes de confirmar) + Garantia de Migração Sem Risco |
| Fundador solo fica indisponível (doença, etc.) | Média | Alto, dado que não há equipe | Documentar processos (este arquivo é o primeiro passo); backup de acesso a sistemas |
| Provedor de hospedagem cai (Render/Vercel/Supabase) | Baixa-média | Alto | Monitorar status pages dos três; já migrar o Render pro tier pago reduz o risco de cold-start conhecido |
| Taxa real do Asaas maior que a estimativa do CFO | Média | Médio | Confirmar tabela oficial antes de lançar a cobrança (`founder/cfo-sources.md`) |
| Vazamento/uso indevido de CPF de cliente final | Baixa | Muito alto (legal + reputação) | Corrigir as lacunas de segurança já identificadas (captcha no formulário, MFA obrigatório pro super-admin) antes de escalar tráfego |
| Conversão cadastro→pago muito abaixo do painel simulado | Média-alta | Médio | Números semanais de `founder/marketing.md`; ajustar oferta/canal se cair muito abaixo de 50% |
| Equipe da agência cliente não adota, cancela | Média | Médio | Checklist de adoção de 30 dias (`founder/offer.md`) |
| Pico de alta temporada sobrecarrega suporte/infra | Média | Médio | Não agendar migração em dez-jan/julho (já é política declarada) |
| Concorrente (Omie, PaxPro) lança cobrança+NFS-e antes | Baixa-média | Alto pro diferencial de longo prazo | Priorizar terminar o ADR-BILLING-001/FISCAL-001 no roadmap, não deixar indefinido |
| Reclamação pública (ex. ReclameAqui) por suporte lento | Baixa (hoje, poucos clientes) | Médio, cresce com volume | SOP 3 (resposta no mesmo dia), já é diferencial declarado contra concorrentes |

## Launch plan

Data de hoje nesta sessão: 2026-10-12. Data de lançamento usada abaixo:
**2026-11-02 (3 semanas a partir de hoje)** — é a data "mais precoce
realista" dado o prazo real identificado em `founder/ops.md` (corrigir os
dois achados de segurança do board antes de atrair tráfego), **não uma data
confirmada pelo fundador**. Ajustar livremente; o resto do cronograma desloca
junto.

### 1. O teste antes de gastar

A Travel Plataforma é um negócio de assinatura — o teste certo, pela tabela
do skill, é uma oferta de "membro fundador" paga antecipadamente. Isso já
existe: é o **Programa Agência Pioneira** (`founder/offer.md`).

Mas o próprio reteste do painel de compradores encontrou um problema real
com testar o Programa Pioneira direto no público geral: vários compradores
simulados recusaram porque "entrar como Agência Pioneira significa eu ser a
cobaia sem ter nenhum caso real pra olhar antes" (`founder/offer.md`, seção
5). Por isso, o teste de lançamento tem duas camadas:

**Camada 1 — antes de qualquer divulgação pública (a parte "friends-and-
family" deste lançamento)**: o fundador recruta 2-3 agências via conexão
pessoal (não anúncio, não os grupos públicos ainda) pra serem as primeiras
de verdade, fora do holofote do Programa Pioneira — sem exigir que sejam
caso público ainda. O objetivo é só ter 2-3 agências reais usando, pra
servir de prova verificável quando o Programa Pioneira abrir pro público.

**Camada 2 — Programa Agência Pioneira público**, divulgado nos canais de
`founder/marketing.md`.

**Linha de sucesso, escrita antes de rodar** (comparar com o painel, nunca
assumir que o resultado real vai bater com o simulado):
- Camada 1: pelo menos **2 das 2-3 agências recrutadas pessoalmente**
  completam a migração assistida sem perda de dado em até 30 dias.
- Camada 2: **5 agências reais** pagando o primeiro mês do Programa Pioneira
  em até 30 dias a partir do início da divulgação nos grupos/associações.

Esse número (5) é deliberadamente bem abaixo da taxa de 50% do reteste do
painel simulado (`founder/panel/results.md`) — compradores simulados tendem
a ser mais complacentes que gente real (limite já declarado em
`founder/panel/results.md` desde o painel original). **Se o resultado real
ficar muito abaixo de 5 em 30 dias, voltar pro `/founder-offer` ou
`/founder-pricing` antes de gastar mais em marketing — não insistir no
mesmo plano com mais orçamento.**

### 2. A contagem regressiva

Datas reais a partir de hoje (2026-10-12), em blocos semanais. **Caminho
crítico** marcado com ⚠ — se atrasar, a data de lançamento desloca.

#### Semana de 13 a 19/10 (D-21 a D-14)

| área | tarefa | responsável | prazo |
| --- | --- | --- | --- |
| ⚠ Legal/produto | Corrigir captcha/validação no formulário público de lead e tornar MFA obrigatório pro super-admin (condição do board, `founder/board.md`) | Fundador | 19/10 |
| Legal/dinheiro | Confirmar tabela real de taxas do Asaas (`founder/cfo-sources.md`) | Fundador | 19/10 |
| Legal/dinheiro | Confirmar regime tributário/CNPJ atual com contador (`founder/ops.md`) | Fundador | 19/10 |
| Build | Subir o Render do Travel Lite pro tier pago (resolve o cold-start já identificado) | Fundador | 19/10 |
| Camada 1 do teste | Recrutar as 2-3 primeiras agências via conexão pessoal | Fundador | 19/10 |

#### Semana de 20 a 26/10 (D-14 a D-8)

| área | tarefa | responsável | prazo |
| --- | --- | --- | --- |
| Marketing | Início do calendário de `founder/marketing.md` (D-14): fundador se apresenta nos grupos/associações, sem vender ainda | Fundador | 20/10 |
| Build | Primeira migração assistida real (Camada 1) | Fundador | em andamento |
| Marca | Ajustar a copy do hero da landing page pra promessa nova (`founder/brand.md`, seção 2) | Fundador | 26/10 |
| Parceria | Primeiro contato com 1-2 consolidadoras em potencial (`founder/marketing.md`) | Fundador | 26/10 |

#### Semana de 27/10 a 2/11 (D-7 a D0)

| área | tarefa | responsável | prazo |
| --- | --- | --- | --- |
| Marketing | Hook #2 (garantia de migração) nos grupos | Fundador | 29/10 |
| Marketing | Anúncio do Programa Agência Pioneira com vagas reais (D-3) | Fundador | 30/10 |
| Camada 1 do teste | Confirmar se as 2-3 agências recrutadas completaram a migração — checar a linha de sucesso antes de abrir pro público | Fundador | 1/11 |
| **Lançamento público** | Abrir o Programa Agência Pioneira nos canais escolhidos | Fundador | **2/11** |

**O item do caminho crítico**: corrigir os dois achados de segurança
(captcha + MFA) antes de 19/10. É a única tarefa que, se atrasar, deve
atrasar o início da divulgação (D-14) e portanto o lançamento inteiro — o
board foi explícito que não se deve atrair tráfego pago/público pro
formulário de lead com essa lacuna aberta.

### 3. O dia do lançamento (2/11, hora a hora)

Como é um negócio online/assinatura sem loja física, não há "abrir as
portas" — o dia é sobre publicar e responder rápido:

| horário | o que acontece |
| --- | --- |
| Manhã | Publicar o anúncio do Programa Pioneira em todos os canais escolhidos (hook #3, `founder/marketing.md`) |
| Durante o dia | Responder cada cadastro/pergunta no mesmo dia (SOP 1, `founder/ops.md`) — é o dia de maior volume de perguntas esperado |
| Tarde | Checar status de hospedagem (Supabase/Vercel/Render) — mais tráfego que o normal pode expor algum limite não testado |
| Fim do dia | Registrar o número real de cadastros do dia 1 — primeiro ponto de comparação com a linha de sucesso da seção 1 |

**Se algo quebrar** (do registro de riscos, `founder/ops.md`): comunicar com
transparência (nunca escondido), nunca prometer prazo que não é real — a
mesma regra do SOP 3.

### 4. Os primeiros 30 dias

Números semanais (de `founder/marketing.md` e `founder/cfo.md`):

| semana | o que medir | nível que exige mudança |
| --- | --- | --- |
| 1 | Cadastros/demos por canal | Zero cadastro depois de uma semana de divulgação = problema de alcance, não de oferta — revisar canal antes de oferta |
| 2 | Conversão cadastro → primeira mensalidade paga | Abaixo de ~10% (bem sob o 50% do painel simulado) = objeção de confiança não resolvida na prática — considerar reforçar a Camada 1 (mais casos reais antes de pedir mais gente pra ser "pioneira") |
| 3 | CAC real por canal | Acima de R$243 (teto de `founder/marketing.md`) por 2 semanas seguidas = trocar ou pausar esse canal |
| 4 | Total de agências pagantes vs. break-even de 13/mês (`founder/cfo.md`) | Longe de 13 ao final do mês 1 não é motivo de pânico (a própria rampa do CFO prevê só 1 agência no mês 1) — mas revisar se a tendência das 4 semanas aponta pra convergir com a meta de regime (50) dentro do ano 1 |

**Revisão nos dias 7, 14 e 30**, com estas perguntas:
- **Dia 7**: alguma das 2-3 agências da Camada 1 já migrou? Teve algum
  problema de dado? (Se sim, a Garantia de Migração Sem Risco foi
  realmente cumprida?)
- **Dia 14**: a linha de sucesso de 5 agências pagantes em 30 dias está no
  caminho, ou já dá pra saber que vai ficar bem abaixo? Os números de
  cadastro/conversão/CAC estão dentro dos níveis da tabela acima?
- **Dia 30**: comparar o resultado real com a linha de sucesso escrita na
  seção 1. Se ficou muito abaixo, a próxima parada não é mais orçamento no
  mesmo canal — é voltar pro `/founder-offer` ou `/founder-pricing` com o
  que se aprendeu de gente real, não do painel simulado.

_The panel is simulated buyers and the numbers are projections from your inputs. Confirm demand with real customers and costs with real quotes before you spend. Not financial, legal or tax advice._
