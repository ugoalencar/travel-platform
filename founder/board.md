# Board verdict — Travel Plataforma

**Votos: 3 fund if, 0 fund, 0 pass. Nota média: 3,3/10** (Offers 3, Monopoly 3,
Product 4).

Nenhum membro deu PASS puro, mas nenhum deu FUND puro, e todos os três ficaram
na parte baixa da escala (3-4/10). O voto é unânime na forma, mas a nota
baixa diz que as condições para liberar o "fund" são substanciais, não
formalidade.

## Os riscos que mais de um membro levantou (em primeiro lugar, do mais perigoso)

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

## O que cada lens levantou sozinho (vale registrar — o board não concordou em tudo)

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

## Checklist de condições (combinando os três memos — isso é o que `/founder-cfo`, o painel de consumidores e o pricing vão testar)

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

## A versão mais forte deste negócio que o board consegue ver

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
