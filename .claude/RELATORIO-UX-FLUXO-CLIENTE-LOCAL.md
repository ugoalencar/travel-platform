# Relatório de UX — Fluxo do cliente (Travel Platform Full, ambiente local)

- **Data da avaliação:** 2026-10-27
- **URL avaliada:** http://127.0.0.1:5184/ (agência de teste "Horizonte Viagens", perfil Proprietário, "Modo demonstração")
- **Método:** navegação como usuário da agência, **somente leitura**. Nada foi salvo, criado, editado, aprovado, cancelado ou pago. Os formulários de vínculo de viagem e de regra de comissão foram apenas abertos. Nenhum Lite, demo público, banco remoto ou produção foi acessado.
- **Convenção:** **[Observado]** = visto diretamente na tela ou na rede do navegador. **[Hipótese]** = interpretação não confirmada.

## 1. Resumo executivo

O Full local tem uma estrutura ampla e coerente (menu agrupado, painel financeiro, regras de comissão com histórico, folha com filtro por funcionário). O cenário "DEMO-FIN-2026-10" tem dados suficientes em vendas, recebíveis, pagáveis, receita da agência e comissões. Faltam dados em viagens, reservas, passageiros, receitas avulsas e descontos.

Os problemas mais sérios para o dia a dia de uma agência:

1. **Os filtros de Vendas, Contas a receber e Contas a pagar não filtram.** A tela envia o filtro, mas a lista volta completa. Isso inclui o filtro de segmentação pedido para o cenário.
2. **O segmento "Cenário financeiro de demonstração" não funciona.** A coluna "Clientes encontrados" mostra "Erro" e a tela exibe, em inglês, `Unknown or unsupported filter field: customer.notes`.
3. **A tela "Receita da agência" não está no menu.** Só abre por URL (`/financial/agency-revenue`). O item de menu "Receitas" leva a uma tela vazia que não tem relação com ela. A tela real mostra códigos técnicos em inglês (`PERCENTAGE`, `LINE_TOTAL`, `ON_FULL_SETTLEMENT`, `AGENCY_COLLECTS`) e identifica vendas por UUID completo.
4. **Identificadores técnicos no lugar de nomes** aparecem no painel (fornecedores como UUID), na folha (venda como prefixo de código) e na receita.
5. **Viagens, reservas e passageiros estão vazios.** Isso é falta de dados do cenário. Mas o vínculo de viagem na venda e as telas de viagens/passageiros não se comunicam bem (ver achado M3).

## 2. Áreas e fluxos efetivamente visitados

| Área | Rota | O que foi feito |
|---|---|---|
| Login | `/login` | Entrada com a conta de teste informada |
| Painel | `/` | Leitura completa |
| Vendas: lista | `/sales` | Leitura, teste dos filtros de status, fornecedor e segmentação |
| Vendas: detalhe | `/sales/:id` | Leitura de 1 venda; abertura (sem salvar) do formulário "Vincular viagem" |
| Clientes | `/customers` | Leitura da lista (18 clientes) |
| Segmentação | `/segments` | Leitura; clique em "Ver resultados" |
| Fornecedores | `/suppliers` | Leitura (4 fornecedores) |
| Contas a receber | `/financial/receivables` | Leitura (78 contas), teste de 4 filtros |
| Contas a pagar | `/financial/payables` | Leitura da lista e dos filtros disponíveis |
| Receitas (menu) | `/financial/revenues` | Leitura (vazia) |
| Receita da agência | `/financial/agency-revenue` | Leitura de regras e entradas (acessada por URL) |
| Regras de comissão | `/commission-rules` | Leitura; abertura da opção progressiva (sem salvar) |
| Folha e comissões | `/payroll` | Leitura; teste do filtro por funcionário |
| Pipeline | `/pipeline` | Leitura |
| Viagens, Reservas, Passageiros | `/trips`, `/bookings`, `/operations/passengers` | Leitura (todas vazias) |

**Não visitadas:** Categorias Financeiras (tela dedicada), Funcionários, Cadastro Remoto, Tarefas, Propostas, Excursões, Aéreo/Terrestre, Documentos, Ocorrências, Pós-viagem, DRE, Fluxo de Caixa, Conciliação e Configurações.

## 3. Achados priorizados

### ALTO

**A1 — Filtros de listas financeiras e de vendas não restringem o resultado**
- **Área:** Vendas, Contas a receber, Contas a pagar.
- **Passos:** abrir `/sales`, escolher Status "Paga" e clicar em "Aplicar filtros". Repetir em `/financial/receivables` com Status "Vencido", Fornecedor "MSC Cruzeiros", Funcionário e Segmentação.
- **Observado:** a lista continua com 67 vendas (ou 78 contas) em todos os casos. A rede mostra que o pedido sai com o filtro (por exemplo `/api/sales?status=PAID` e `/api/financial/receivables?status=OVERDUE`), mas a resposta traz vendas "Confirmada" e contas pagas e abertas misturadas. Não há mensagem de erro.
- **Impacto:** o funcionário acredita ter filtrado e lê números errados. Não consegue achar o que está vencido, o que falta receber de um fornecedor ou as vendas de um colega. É a principal ferramenta de acompanhamento financeiro.
- **Melhoria:** garantir que o servidor aplique os filtros e que a tela mostre quantos resultados voltaram e qual filtro está ativo.
- **[Hipótese]** o servidor local pode estar rodando sem a versão que implementa esses filtros (o projeto indica que eles estavam em implementação). Não verifiquei o processo. Os testes foram por script no navegador, e o pedido de rede confirma que o filtro é enviado. Vale repetir com cliques manuais após reiniciar a API.

**A2 — Segmento "Cenário financeiro de demonstração" falha, com erro técnico em inglês**
- **Área:** Segmentação de clientes.
- **Passos:** abrir `/segments` e olhar a coluna "Clientes encontrados"; clicar em "Ver resultados".
- **Observado:** a coluna mostra "Erro". Aparece a mensagem `Unknown or unsupported filter field: customer.notes`. O painel "Resultados do segmento" abre sem lista. A rede registra respostas 400 em `/api/customer-segments/:id/results`.
- **Impacto:** o segmento não pode ser usado nem como lista nem como filtro de vendas e financeiro. A mensagem não ajuda o usuário a corrigir nada.
- **Melhoria:** corrigir o campo `customer.notes` ou removê-lo do segmento de demonstração. Traduzir e simplificar o erro ("Este segmento usa um critério que não existe mais. Edite o segmento.").

**A3 — "Receita da agência" não é encontrável pelo menu**
- **Área:** Financeiro, navegação.
- **Passos:** abrir o menu Financeiro. Existe "Receitas" (`/financial/revenues`), que mostra "Nenhuma receita registrada". A tela com regras e entradas de receita só abre em `/financial/agency-revenue`, e nenhum link do menu leva a ela.
- **Impacto:** a gerente não encontra as regras de comissão dos fornecedores e a receita prevista/recebida. Conclui que "não há receita" porque a tela visível está vazia, embora o painel mostre R$ 56.835,00 projetados.
- **Melhoria:** colocar "Receita da agência" no menu. Renomear ou esclarecer "Receitas" (receitas avulsas) para não competir com ela.

**A4 — Receita da agência exibe códigos técnicos em inglês e vendas por UUID**
- **Área:** Receita da agência.
- **Observado:** as regras aparecem como `v1 · PERCENTAGE · LINE_TOTAL · 10% · ON_FULL_SETTLEMENT · AGENCY_COLLECTS`. As entradas aparecem como "Prevista · R$ 400,00 · Venda 0bd6e7ed-1c1c-… · MSC Cruzeiros · Categoria não informada". Não aparece o nome do cliente, e "Categoria não informada" aparece em todas as linhas.
- **Impacto:** o funcionário não entende quando a agência passa a ter direito à receita nem identifica de qual venda ela vem.
- **Melhoria:** traduzir para frases ("10% sobre o valor da linha, devido quando a venda for totalmente quitada, a agência recebe do cliente") e mostrar cliente e nome da venda com link. Fazer o mesmo no painel (A5).
- **[Hipótese]** "Categoria não informada" vem de a categoria estar nula nas vendas do cenário (a API de vendas devolve `categoryName: null`), ou seja, pode ser falta de dado. A tela, no entanto, deveria explicar o que fazer.

**A5 — Painel mostra UUIDs no lugar de fornecedores e traz inconsistências de leitura**
- **Área:** Painel.
- **Observado:**
  - "Saldos com fornecedores" lista `0a37ec7b-6f47-…: volume R$ 220.000,00 · receita esperada…` em vez do nome do fornecedor.
  - O alerta diz "14 **recebívelis** vencidos" (erro de digitação), mas o bloco "Recebíveis de clientes → Atrasado" mostra R$ 0,00.
  - "Vendas pagas: 0", enquanto "Entradas realizadas" soma R$ 149.050,00, e "Saldo previsto" é −R$ 339.565,00 com "Saídas realizadas" em R$ 0,00.
  - O gráfico de 12 meses mostra só a coluna de outubro.
- **Impacto:** a agente não confia nos números e não consegue ligar o painel às telas de origem.
- **Melhoria:** usar nome do fornecedor com link. Corrigir o texto. Explicar cada indicador (por exemplo: "Saldo previsto = a receber − a pagar"). Mostrar na tela o critério de "vencido".
- **[Hipótese]** as divergências "14 vencidos" × "Atrasado R$ 0,00" e "Vendas pagas 0" × entradas realizadas podem ser regras de cálculo diferentes (cada card com seu critério). A tela não explica a diferença.

### MÉDIO

**M1 — Folha e comissões: vendas por prefixo de código, coluna Fornecedor vazia, taxa "-"**
- **Área:** `/payroll`, tabela "Comissões Geradas".
- **Observado:** a coluna Venda aparece como "R$ 13.000,00 — 0bd6e7ed". A coluna Fornecedor mostra "—" em todas as linhas. A coluna Taxa mostra "-" para Ana Martins e Bruno Costa (regras progressivas), sem explicar como R$ 910,50 saiu de R$ 50.000,00. O botão "Aprovar" aparece em todas as linhas ao lado do status "Pendente · Aguardando liberação", sem dizer o que falta para a comissão ser liberada.
- **Impacto:** quem confere a folha não consegue rastrear a comissão até a venda nem explicar o valor ao funcionário.
- **Melhoria:** mostrar cliente + nome da venda com link. Em comissão progressiva, abrir um detalhe com a faixa aplicada e o acumulado do mês. Mostrar o critério de liberação pendente ("libera quando o cliente quitar 100%").

**M2 — Comissão atribuída a funcionário diferente do vendedor da venda**
- **Área:** Vendas × Folha.
- **Observado:** a venda `e11c3b21…` mostra Vendedor "Ugo de Alencar Santos" na API, mas a comissão dessa venda na folha está em nome de Bruno Costa (R$ 120,00). O mesmo padrão aparece para Ana Martins.
- **Impacto:** se for atribuição manual, a venda deveria mostrar quem recebe comissão. Se não for, o funcionário vê comissão de uma venda que não é dele.
- **[Hipótese]** o cenário usa "Atribuir a funcionário" de propósito para testar regras por funcionário. Não verifiquei na venda se há um campo "comissionado". Confirmar com quem montou o cenário.

**M3 — Vínculo de viagem: fluxo não conversa com Viagens e Passageiros**
- **Área:** Venda → "Vincular viagem" e telas de Viagens e Passageiros.
- **Observado:** a venda mostra "Viagem: —". O formulário vem pré-preenchido com nome "Viagem - venda", Destino vazio e as datas da venda. Há uma nota: "O comprador da venda será o cliente principal da viagem. Passageiros adicionais podem ser cadastrados na reserva operacional." Já `/trips` diz "0 viagens registradas… Crie a primeira viagem a partir de um desejo". `/bookings` e `/operations/passengers` estão vazios.
- **Impacto:** a nota é boa, mas está em letra pequena no fim do formulário. Quem vai a Viagens procura o caminho "a partir de um desejo" e não descobre que dá para criar a viagem direto da venda. Também não fica claro que, depois do vínculo, ainda falta criar reserva e partida para os passageiros operacionais aparecerem.
- **Melhoria:** manter a explicação visível antes do botão. Depois de vincular, mostrar o próximo passo ("Adicionar passageiros", "Criar reserva"). Em `/trips` vazio, oferecer também "Vincular a partir de uma venda".
- **Falta de dados × usabilidade:** viagens, reservas e passageiros vazios são **falta de dados do cenário**. Não afirmo que a tela de passageiros falha, só que não foi possível avaliá-la com dados.

**M4 — Regra de comissão: opção progressiva misturada em "Base" e dois vocabulários**
- **Área:** `/commission-rules`, "Nova regra".
- **Observado:** o grupo "Base" mistura "Valor bruto da venda", "Margem", "Valor vendido deste fornecedor" e "Comissão progressiva por meta mensal", que é uma modalidade, não uma base. Ao escolher progressiva aparecem "Marginal: cada faixa calcula só o excedente / Sobre o total…", enquanto o formulário normal usa "Aplicação: Sobre o total / Só sobre o excedente". Os dois textos descrevem a mesma ideia com palavras diferentes. As faixas ("Faixa 1: de R$ 0 / Faixa 2: de R$ … em diante") são claras. Não vi no formulário um campo de **critério de liberação** da comissão.
- **Impacto:** o dono precisa entender dois vocabulários para configurar a regra, e não encontra onde dizer "libera só após quitação".
- **Melhoria:** separar "Como calcular" (percentual, valor fixo, progressiva) de "Sobre o que" (bruto, margem, fornecedor). Usar um único vocabulário. Incluir uma pergunta "Quando liberar?".
- **[Hipótese]** o critério de liberação pode estar em outra tela ou na revisão da regra ("Nova revisão"). Não abri a revisão.

**M5 — Lista de regras mostra pouco do que importa**
- **Observado:** o item da lista diz "v1 desde 2026-10-27 · progressiva (2 faixas) · bruto · em vigor". Não mostra as faixas, as taxas, o fornecedor/categoria quando "todos" nem o critério de liberação. A data aparece como `2026-10-27` (formato técnico), enquanto o resto do sistema usa `27/10/2026`.
- **Melhoria:** mostrar resumo legível ("até R$ X: 1%; acima: 2%") e data no formato brasileiro.

**M6 — Lista de vendas e de contas com pouco contexto**
- **Observado:** a lista de vendas tem Cliente, Data, Total, Status e "Abrir", sem fornecedor, vendedor ou viagem. Há muitas linhas com o mesmo nome e valor ("R$ 350,00", "R$ 180,00"), difíceis de distinguir. A lista de recebíveis descreve tudo como "Sale receivable" (em inglês) e não indica a venda. A de pagáveis usa o prefixo "SaleItem:" no texto. As 67 vendas e 78 contas aparecem de uma vez, sem paginação nem total.
- **Impacto:** o funcionário abre várias linhas para achar a venda certa.
- **Melhoria:** colunas de fornecedor/vendedor/viagem, descrição em português com nome da venda e link, paginação e contador.

**M7 — Painel e listas sem acentuação e com termos em inglês**
- **Observado:** "Informacoes da venda", "OBSERVACOES", "Historia financeira", "ACOES", "Reservas em execucao". Termos em inglês: "Wish / Proposal / Booking / Sale" na trilha de etapas, formas de baixa "BOLETO / CARD / PIX" e o código "UI-03" acima dos títulos.
- **Melhoria:** padronizar o português e remover códigos internos (`UI-03`) da interface.

### BAIXO

- **B1 — Detalhe da venda diz "Nenhuma parcela registrada para esta venda" abaixo de uma tabela que mostra a parcela "Única 1".** São blocos diferentes ("Parcelas do cliente"), mas a mensagem contradiz o que está acima. O nome do bloco e o texto deveriam esclarecer o que é.
- **B2 — Rótulos do filtro de segmentação mudam:** "Todos os clientes" em vendas e recebíveis, "Todos os lançamentos" em pagáveis. O filtro de funcionário em pagáveis lista Ana, Bruno e Ugo, mas em recebíveis só aparece Ugo.
- **B3 — Fornecedores:** coluna "Categorias" mostra "-" e "Comissão da agência" mostra só "Acordo cadastrado", sem percentual ou resumo. O documento é "-". Falta de dados, mas a coluna de comissão deveria resumir o acordo.
- **B4 — Clientes:** telefone "—" em todos, sem filtro por segmento ou vendedor na lista. A busca por texto existe.
- **B5 — Botão "Atualizar saldo"** na venda não explica o que faz.
- **B6 — Botão "Aprovar" repetido em todas as linhas de comissão e folha.** Ação importante sem confirmação visível (não cliquei).
- **B7 — Login:** o campo "Agência" é texto livre sem dica, e o link "Criar conta" no login da equipe pode confundir. Erro de login é genérico ("Email ou senha inválidos"), o que pode ser escolha de segurança.
- **B8 — Menu extenso:** cerca de 45 itens em 8 grupos; "Visão Geral" aparece duas vezes (Painel e Financeiro). Há opção "Expandir tudo/Recolher tudo", mas os grupos Financeiro e Cadastros misturam fornecedores, centros de custo e categorias.

## 4. Falta de dados × falta de configuração × problema de usabilidade

| Situação | Classificação |
|---|---|
| Viagens, reservas, passageiros vazios | **Falta de dados** do cenário |
| Receitas (`/financial/revenues`) vazia | Falta de dados; **mas** a navegação leva a ela em vez da tela de receita da agência (usabilidade, A3) |
| Descontos de funcionários vazio, folha sem comissões | Falta de dados / dependem de comissões liberadas (nenhuma comissão liberada ainda) |
| Categoria "não informada", fornecedor "—" | Provável falta de dado/configuração; a tela não orienta (usabilidade) |
| Filtros que não filtram, segmento com erro | **Problema de funcionamento** (A1, A2), não de dado |
| UUID, enums em inglês, sem acentos | **Usabilidade** |

## 5. Aspectos que funcionam bem

- Login rápido, com identidade visual limpa e texto em português.
- Painel com saudação, indicadores e atalhos ("Nova proposta", "Cadastrar cliente", "Nova viagem", "Adicionar pagamento").
- Aviso útil no painel: "Volume vendido… não representa a receita da agência", que separa volume de receita.
- Pipeline claro: colunas por etapa, valor por coluna, destino, "próxima ação" com data e hora e total em negociação.
- Registrar baixa na venda: campos simples e o aviso "A baixa será distribuída pelo vencimento das parcelas. Data considerada em Brasília."
- Comissões da equipe: texto de abertura em linguagem de negócio, histórico preservado ("Comissões já calculadas permanecem no histórico"), configuração por escolhas (funcionário, categoria, fornecedor) em vez de JSON, e explicação das faixas progressivas.
- Folha: filtro "Acompanhar funcionário" **funcionou** (Ana Martins → 13 comissões e 2 folhas) e aviso claro: "A folha inclui somente comissões integralmente liberadas…".
- Filtros presentes e bem organizados em vendas e financeiro (data, status, fornecedor, funcionário, segmentação), mesmo que ainda não filtrem.
- Estados vazios com mensagem e botão de ação ("Nenhuma viagem encontrada… Nova viagem").
- Nota do vínculo de viagem sobre comprador como cliente principal e passageiros na reserva (conteúdo certo, só pouco visível).
- Dados do cenário coerentes entre telas em volume (67 vendas, 78 recebíveis, 18 clientes, 4 fornecedores, 3 funcionários).

## 6. Limitações da avaliação

- Não avaliei Funcionários, Categorias Financeiras (tela dedicada), DRE, Fluxo de Caixa, Conciliação, Tarefas, Propostas, Excursões, Aéreo/Terrestre, Documentos, Ocorrências, Pós-viagem e Configurações.
- Não testei **criação e revisão** de regras, vínculo de viagem, registro de baixa, aprovação e geração de folha, porque o pedido era somente leitura. Logo não sei se esses fluxos concluem sem erro.
- Os testes de filtro foram feitos por script no navegador (a janela ficou em segundo plano e impediu cliques por coordenadas). A rede confirma que o filtro é enviado e a resposta chega sem filtrar, mas vale repetir manualmente.
- Não verifiquei se o servidor local está com a versão mais recente do código. Isso afeta a leitura de A1 e A2.
- Tela avaliada em janela de 1024 px; não avaliei celular nem tablet.
- Não li o código para explicar a causa; as causas são hipóteses marcadas.
- A segmentação de clientes não pôde ser usada como filtro por causa do erro A2.

## 7. Lista final de melhorias, em ordem de prioridade

1. **Fazer os filtros funcionarem** em vendas, contas a receber e contas a pagar, mostrando contador e filtro ativo (A1).
2. **Corrigir o segmento "Cenário financeiro de demonstração"** (campo `customer.notes`) e traduzir a mensagem de erro (A2).
3. **Colocar "Receita da agência" no menu** e esclarecer "Receitas" (A3).
4. **Traduzir regras e entradas de receita** e trocar UUID por cliente, venda e fornecedor, com links (A4).
5. **Corrigir o painel:** nomes de fornecedores, texto "recebíveis", explicação dos indicadores e coerência entre "vencidos" e "atrasado" (A5).
6. **Folha e comissões:** venda com nome e link, detalhe da faixa progressiva, motivo de "aguardando liberação" (M1).
7. **Confirmar a regra de atribuição de comissão × vendedor** e mostrá-la na venda (M2).
8. **Conectar vínculo de viagem a Viagens, Reservas e Passageiros** com próximo passo claro, e popular o cenário com viagem, reserva e partida (M3).
9. **Reorganizar o formulário de regra de comissão** (cálculo × base) e incluir critério de liberação visível (M4, M5).
10. **Dar mais contexto às listas** (fornecedor, vendedor, viagem, descrição em português, paginação) (M6).
11. **Padronizar português** (acentos, Wish/Proposal/Booking/Sale, BOLETO/CARD/PIX, `UI-03`, "SaleItem:", "Sale receivable") (M7).
12. **Ajustes menores** de B1 a B8.
13. **Dados do cenário:** preencher categorias de venda, telefone dos clientes, categorias e percentual dos fornecedores e pelo menos uma viagem com reserva e passageiros, para a próxima avaliação cobrir todas as áreas.

## 8. Observação sobre o acesso

A conta de teste usada foi a informada no chat para este ambiente local. Nenhuma senha, e-mail ou identificador de acesso está registrado neste arquivo.
