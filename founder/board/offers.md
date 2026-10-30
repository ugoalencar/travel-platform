# Lente Offers
Nota: 4 | Voto: FUND IF

Aplico só a lente Offers (equação de valor, mercado, pilha, garantia). Não falo por ninguém da fonte.

## O que é forte
- **Prova deixou de ser zero em potencial.** Gadotti (Joinville/SC) já usava o Lite e agora está no Full com 1 OWNER + 4 AGENT. É o primeiro caso real, mas ainda cortesia: prova de uso, não de disposição a pagar.
- **Produto largo e entregue, não slide.** CRM, pipeline, financeiro, comissões, portal, papéis, RLS, MFA e auditoria existem em produção. Isso sustenta "probabilidade percebida" muito melhor que na rodada de 12/10.
- **Preço por agência, não por assento.** Os dados de `pricing.md` (de concorrentes pesquisados antes) indicam que R$ 99 fixo para 10 usuários é um contraste real com preço por usuário. É diferencial de oferta, não só de preço.
- **Custo variável baixo.** Contribuição de ~R$ 81/mês por agência no modelo do CFO (estimativa): dá folga para garantia e bônus de migração.
- **Estoque de ideias já testadas:** o painel simulado apontou que a objeção dominante é falta de prova, não preço (hipótese simulada, não mercado real).

## O que mataria (top 3, mais perigoso primeiro)
1. **Vitalício sem definição vira passivo ilimitado.** Receita zero para sempre contra suporte, infra, segurança e LGPD perpétuos de um fundador solo. Se "vitalício" for lido como "da vida do cliente", o custo cresce e a receita não. Pior: gera precedente de preço (todo cliente futuro pergunta pelo vitalício).
2. **Cobrança e NFS-e ainda não existem.** Hoje a promessa financeira da landing (se ainda disser isso) é maior que o produto; qualquer assinatura ou venda de "sistema completo" herda essa lacuna. Sem Asaas não há como nem cobrar a assinatura do 5º cliente automaticamente. (Estado conforme docs, não reverificado.)
3. **Ideia B (vender o sistema) troca receita recorrente por caixa pontual e suporte obrigatório.** Sendo SaaS multi-tenant hospedado pelo fundador, "vender" não transfere nada: o cliente continua dependendo da sua infra. Vira assinatura disfarçada, só que sem recorrência e com expectativa de posse. Risco de projeto sob medida (implantação) consumindo o único recurso escasso: o tempo do fundador.

## Perguntas ao fundador
- Quantos dos 4 fundadores são agências reais que você já conhece (e a Gadotti é uma delas)? Quem decide e paga em cada uma?
- O que você aceita entregar em troca do vitalício: depoimento público, feedback semanal, caso de uso, indicação? Está por escrito?
- Se a hospedagem custar mais que o previsto ou você vender/encerrar a empresa, o que acontece com o vitalício?
- Na Ideia B, o cliente receberia código, instalação própria ou apenas acesso? Quem hospeda? Quem corrige segurança?
- Qual o preço de lista que o vitalício substitui? (Não invento: pergunta aberta.)
- Quanto uma agência real paga hoje por ferramenta equivalente, e quanto estaria disposta a pagar antecipado? Responde `/founder-consumer` (pré-venda real) e `/founder-competitors` (preços públicos).
- Tamanho de mercado, CAC e churn: perguntas abertas. `/founder-competitors` cobre o mercado; `/founder-cfo` cobre CAC/churn com premissas explícitas.

## Se FUND IF: condições
**Veredito das ideias**
- **Ideia A (4 fundadores, 6 meses, depois vitalício):** forte como programa de prova; arriscada como promessa aberta. Aprovada **com vitalício limitado** (abaixo).
- **Ideia B (vender sistema + suporte):** não como substituta da assinatura. Só aceitável como **serviço pontual** (implantação/migração/treinamento pago) somado a assinatura, nunca como venda de licença perpétua do SaaS.
- **Melhor combinação:** 4 fundadores com condições escritas + assinatura como produto principal + implantação paga como bônus/serviço opcional.

**Como estruturar o "vitalício" sem virar passivo**
1. **Defina "vitalício" por escrito como "enquanto o produto existir, na versão e no plano contratados"**, não "da vida do cliente" nem "da empresa". Inclua cláusula de encerramento: aviso de 12 meses e exportação completa dos dados.
2. **Limites fixos de plano:** teto de usuários (ex.: o do plano Inicial, 10), armazenamento e volume; acima disso, paga o excedente. Não é "tudo para sempre".
3. **Intransferível:** vinculado ao CNPJ da agência; venda da agência ou mudança de controle encerra ou renegocia o benefício.
4. **Suporte incluso = nível básico, canal e prazo definidos;** suporte prioritário, migração e customizações são pagos à parte.
5. **Contrapartida obrigatória:** depoimento/caso público, feedback periódico, referência a prospects. Se não cumprir, o benefício converte para desconto de fundador.
6. **Benefício vitalício = congelamento de preço, não gratuidade.** Alternativa mais segura que "grátis para sempre": preço fixo reduzido (ex.: o R$ 79 já decidido) travado por vida do contrato. Mantém receita recorrente e cobre custo. Se o fundador quiser gratuidade, limitá-la a 1 plano Inicial por fundador.
7. **Gatilho de aprovação:** os 6 meses terminam com critérios objetivos (uso real, agência ativa, feedback entregue); não é conversão automática.
8. **Vagas:** exatamente 4, nominais, sem lista de espera prometida.

**Pré-requisitos antes de abrir o programa publicamente**
- Contrato/termo de fundador revisado por advogado (não é consultoria jurídica aqui).
- Remover ou marcar como "em desenvolvimento" qualquer promessa de cobrança recorrente/NFS-e na landing.
- Rodar `/founder-cfo` com custo de suporte perpétuo dos 4 e cenário com pró-labore real (o CFO anterior mostrou break-even saltando de 13 para 124 agências com pró-labore de R$ 9.000).
- Rodar `/founder-consumer` e `/founder-pricing` para testar se uma agência paga adiantado, e quanto.
