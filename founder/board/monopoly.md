# Lente Monopoly
Nota: 4/10 | Voto: FUND IF

## O que é forte

- O sistema está em produção e já tem um usuário real que o conhece (Gadotti, migrando do Lite). A lente exige produto existente antes de julgar durabilidade; isso agora está cumprido, mas não prova monopólio.
- Há um nicho pequeno e estreito para dominar primeiro: agências de viagem brasileiras pequenas/médias, hoje na planilha + WhatsApp. O mapa de 12/10 (`founder/competitors.md`) indicou um quadrante vazio: fluxo de agência + cobrança recorrente + NFS-e no mesmo produto. É uma observação de 12/10, de busca pública, não reverificada hoje.
- Multi-tenant com RLS, MFA e auditoria são base técnica séria. Para a lente isso é higiene e confiança, não vantagem competitiva.

## O que mataria (top 3, mais perigoso primeiro)

1. **Distribuição inexistente e produto sem fosso hoje.** Zero cliente pagante, CAC desconhecido, nenhum canal comprovado. E a única peça candidata a fosso (cobrança Asaas + NFS-e) está só em ADR. Hoje o produto é CRM + financeiro + portal: o padrão mais copiável do setor, em mercado onde já há PaxGo e PaxPro (preço não divulgado, segundo o mapa de 12/10).
2. **Ideia A, mal desenhada, destrói a única alavanca futura.** Quatro vitalícios de graça não são monopólio: são 4 clientes de custo de suporte perpétuo e receita zero, com um fundador solo. O "para sempre" cria passivo sem fim (suporte, infraestrutura, compliance, mudanças fiscais) contra receita nula, e dá aos 4 um poder de pauta (roadmap, exigências) desproporcional. Se os 4 forem agências comuns e não referências, nem o ganho de distribuição existe.
3. **Ideia B (vender o sistema) transforma software em consultoria.** Venda única corta a receita recorrente, que é o que dá valor à empresa e permite repetir. Cada implantação customizada vira trabalho do fundador solo, sem escala, sem aprendizado acumulado entre clientes, e a base de clientes não compõe. Quem compra e hospeda sozinho ainda depende do fundador para atualizações fiscais e segurança, mas sem pagar por isso de forma previsível.

## Perguntas ao fundador

- Qual é o segredo, em uma frase? O que você sabe sobre operar agência brasileira, ou sobre o fiscal, que um concorrente com mais caixa não copia em seis meses? (hoje não nomeado.)
- Como chegam as primeiras 100 agências e a que custo? Existe canal (associação, rede, indicação do Gadotti)? CAC e churn são perguntas abertas: `/founder-consumer` e `/founder-cfo`.
- Quem são os 4 fundadores, concretamente? Têm nome, perfil e peso de referência no setor? Aceitam virar case público, depoimento e indicação?
- "Vitalício" significa o quê: plano atual congelado, ou todos os planos futuros? Para a vida do produto, ou da empresa? O que acontece se você encerrar, vender ou mudar o produto?
- Na venda do sistema (B): o cliente recebe código, ou licença de uso hospedada por você? Quem atualiza as regras fiscais depois?
- Quantas horas por semana você consegue vender, implantar e dar suporte sozinho sem parar de construir? Tamanho de mercado e concorrentes atuais: `/founder-competitors` (reverificar, o mapa tem 18 dias).

## Se FUND IF: condições

- **Melhor combinação segundo a lente:** Ideia A reformulada como parte de uma assinatura, mais um serviço pago de implantação/treinamento (a parte útil da Ideia B), não a venda do sistema. Não fazer B como substituto da assinatura.
- Fundadores: limitar a 4, com contrato escrito e critérios de saída. "Vitalício" apenas como preço congelado do plano atual enquanto o produto existir, nunca acesso gratuito eterno, e com cláusula explícita de encerramento, cessão e limite de suporte. Após o período de teste, cobrar algo (mesmo simbólico, como o preço de fundador de R$ 79), para testar disposição de pagar.
- Em troca do benefício: caso público, depoimento, indicação de ao menos 2 agências cada, feedback estruturado. Sem contrapartida, não vale oferecer.
- Suporte pago e implantação: vender como serviço adicional sobre a assinatura (migração, treinamento, onboarding), com preço de tabela. Isso reduz a dependência de tempo do fundador por preço, sem tirar a receita recorrente.
- Construir e validar em uma agência real a cobrança Asaas + NFS-e antes de chamar isso de diferencial. Sem isso o produto não tem fosso.
- Rodar `/founder-competitors` de novo antes de investir mais, e `/founder-consumer` / `/founder-cfo` para CAC, churn e break-even (o ponto de ~13 agências é de 12/10 e não foi reverificado).
- Pontos de revisão: decidir em 6 meses, com dados de uso e pagamento, se a assinatura segue; não decidir hoje sobre os planos de venda.
