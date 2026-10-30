# Mapa de concorrentes — Travel Plataforma

Busca feita em fontes públicas (Google, sites oficiais, Capterra, ReclameAqui,
imprensa do setor de turismo), em 2026-10-12. Nenhum concorrente, preço ou
avaliação foi inventado — onde a fonte não trazia o dado, está marcado como
"não encontrado" ou "não divulgado". Dois acessos diretos (Capterra,
ReclameAqui/Agendor) retornaram erro 403 e foram substituídos por buscas que
trazem o mesmo conteúdo via resultados indexados — citado como tal.

## 1. Quem está no mercado

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

## 2. Faixa de preço (item comparável, só quem publica preço em reais ou dólar claro)

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

## 3. Mapa de posicionamento (texto)

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

## 4. O que os clientes reclamam (por tema, do mais citado)

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

## 5. A lacuna

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

## 6. A ameaça — quem copia mais rápido

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

## Próximos passos sugeridos

- `/founder-consumer`: usar os temas de reclamação (suporte, cobrança
  confusa, falta de automação fiscal) como objeções reais a testar com o
  painel de compradores simulados.
- `/founder-pricing`: usar a faixa de preço real (R$ 59–309/mês entre os
  concorrentes brasileiros que publicam preço) para calibrar os planos da
  Travel Plataforma.
