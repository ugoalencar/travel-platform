# Travel Lite — Manual do Usuário

**Status:** rascunho para revisão (versão 1, 2026-10-02). Descreve o que o produto faz **hoje**. O que ainda é só plano está marcado como pendência ou evolução futura.

**Para quem é:** quem opera uma agência no Travel Lite, do primeiro acesso ao dia a dia. Os exemplos usam dados fictícios.

**Como usar este manual:** vá direto ao capítulo da tela em que você está. Todo capítulo segue o mesmo roteiro: **para que serve**, **quem pode acessar**, **passo a passo**, **exemplo preenchido**, **erros comuns** e **resultado esperado**. A mesma explicação, de forma resumida, também está dentro do sistema, no menu **Ajuda**.

---

## Sumário

1. [Antes de começar: perfis e permissões](#1-antes-de-começar-perfis-e-permissões)
2. [Acesso e primeiro login](#2-acesso-e-primeiro-login)
3. [Primeiros passos: preparar a agência](#3-primeiros-passos-preparar-a-agência)
4. [Dashboard](#4-dashboard)
5. [Clientes](#5-clientes)
6. [Vendedores](#6-vendedores)
7. [Cadastros: categorias, contas e formas de pagamento](#7-cadastros-categorias-contas-e-formas-de-pagamento)
8. [Vendas, custos e margem](#8-vendas-custos-e-margem)
9. [Financeiro](#9-financeiro)
10. [Comissões](#10-comissões)
11. [Relatórios](#11-relatórios)
12. [Importação de planilhas](#12-importação-de-planilhas)
13. [Usuários e permissões](#13-usuários-e-permissões)
14. [Identidade visual da agência](#14-identidade-visual-da-agência)
15. [Uso no celular e app instalável](#15-uso-no-celular-e-app-instalável)
16. [Ajuda, busca e dúvidas frequentes](#16-ajuda-busca-e-dúvidas-frequentes)
17. [Recursos do plano: Lite, Pro e Full](#17-recursos-do-plano-lite-pro-e-full)
18. [Prontidão para migrar do Lite para o Full](#18-prontidão-para-migrar-do-lite-para-o-full)
19. [Boas práticas](#19-boas-práticas)
20. [Solução de problemas comuns](#20-solução-de-problemas-comuns)
21. [O que ainda depende da empresa ou do produto](#21-o-que-ainda-depende-da-empresa-ou-do-produto)
22. [Anexos: checklist rápido e glossário](#22-anexos-checklist-rápido-e-glossário)

---

## 1. Antes de começar: perfis e permissões

### Para que serve
Cada pessoa vê e faz apenas o que o seu **perfil** permite. Entender isso evita a dúvida mais comum: "por que não aparece esse menu ou botão?".

### Os cinco perfis

| Perfil | Em uma frase |
|---|---|
| **MASTER** | Gestor da agência: tem todas as permissões, configura usuários, permissões, dashboard e identidade visual. |
| **ADMIN** | Administração do dia a dia: clientes, vendas, financeiro, comissões, importação e cadastros. Não gerencia usuários nem permissões. |
| **MANAGER** | Gerente: parecido com o ADMIN, para acompanhar a equipe e a operação. |
| **SELLER** | Vendedor: cadastra clientes e vendas e vê **apenas os próprios** clientes, vendas e comissões. |
| **VIEWER** | Consulta: vê dados de todos, mas não cria nem altera. |

### O que cada perfil faz por padrão

| Ação | MASTER | ADMIN | MANAGER | SELLER | VIEWER |
|---|---|---|---|---|---|
| Criar cliente | ✓ | ✓ | ✓ | ✓ | |
| Ver todos os clientes | ✓ | ✓ | ✓ | só os próprios | ✓ |
| Criar venda | ✓ | ✓ | ✓ | ✓ | |
| Editar ou cancelar qualquer venda | ✓ | ✓ | ✓ | só as próprias | |
| Ver vendedores | ✓ | ✓ | ✓ | | ✓ |
| Cadastrar vendedores | ✓ | ✓ | ✓ | | |
| Ver financeiro | ✓ | ✓ | ✓ | | ✓ |
| Receber, pagar e estornar | ✓ | ✓ | ✓ | | |
| Aprovar e pagar comissões | ✓ | ✓ | ✓ | | |
| Ver todas as comissões | ✓ | ✓ | ✓ | só as próprias | ✓ |
| Importar planilhas | ✓ | ✓ | ✓ | | |
| Cadastros básicos (categorias, contas) | ✓ | ✓ | ✓ | | |
| Gerenciar usuários e permissões | ✓ | | | | |
| Configurar dashboard e identidade visual | ✓ | | | | |

### Pontos importantes
- Um **MASTER pode ajustar as permissões de cada pessoa** (por exemplo, liberar o recebimento financeiro a uma vendedora). O que for diferente do padrão do perfil fica marcado como **exceção**.
- Se você abrir pelo endereço uma área que não pode usar, o sistema mostra a mensagem **"Acesso restrito"** e mantém o endereço. Isso **não é erro**: é falta de permissão.
- **Tudo o que é informativo** (a Ajuda, o checklist "Prepare sua agência" e a tela Recursos do plano) **não muda a autorização de ninguém**. Quem decide o que cada pessoa pode fazer são as permissões.

---

## 2. Acesso e primeiro login

### Para que serve
Entrar no sistema da sua agência.

### Quem pode acessar
Qualquer pessoa com um usuário criado por um MASTER.

### Passo a passo
1. Abra o endereço do sistema. Se a sua agência recebeu um link próprio (com `?agencia=` no final), a tela de login já aparece **com a identidade da agência**: logo, nome, mensagem de boas-vindas e cores.
2. Preencha **Agência** (o identificador da sua agência, por exemplo `gadotti`), **E-mail** e **Senha**.
3. Clique em **Entrar**.

### Exemplo preenchido
- Agência: `gadotti`
- E-mail: `ana@agencia.com`
- Senha: a senha definida pelo MASTER

### Bom saber
- Ao digitar o identificador da agência, a tela de login **muda sozinha** para o visual daquela agência. Se a agência não tiver identidade configurada, aparece o visual padrão "Travel Lite".
- O navegador **lembra a última agência** usada naquele aparelho.
- A sessão vale por **24 horas**. Depois disso, entre de novo.
- Para sair, use **Sair** no topo.

### Erros comuns
- **"Invalid credentials"**: agência, e-mail ou senha incorretos. Por segurança, a mensagem **não diz qual dos três** está errado. Confira os três.
- **Esqueci a senha:** hoje **não existe redefinição por e-mail**. Um MASTER define uma nova senha em Configurações (mínimo de 8 caracteres).

### Resultado esperado
Você entra no **Dashboard**, com o menu mostrando só as áreas do seu perfil.

---

## 3. Primeiros passos: preparar a agência

### Para que serve
Colocar a agência no ar do zero, na ordem certa, até a primeira venda.

### Quem pode acessar
Todos veem o checklist, mas **cada perfil vê apenas as etapas que pode executar**: MASTER, ADMIN e MANAGER veem as administrativas; o SELLER vê só cliente, primeira venda e ajuda.

### Passo a passo (ordem recomendada)
1. **Vendedores:** cadastre quem vende e a regra de comissão de cada um (menu **Vendedores**).
2. **Conta financeira** (menu **Cadastros**): onde o dinheiro entra e sai.
3. **Categorias de venda** (menu **Cadastros**).
4. **Primeiro cliente** (menu **Clientes**).
5. **Primeira venda** (menu **Vendas**): registre e confirme.
6. **Abrir a Ajuda** para conhecer os status e os erros comuns.

### O checklist "Prepare sua agência"
- Aparece no **Dashboard**, em **Configurações** e no topo da **Ajuda**.
- Mostra o progresso (por exemplo, "2 de 3 etapas concluídas") e leva a cada tela.
- As etapas são marcadas **por dados reais** (existe um vendedor, uma conta, um cliente...), **não por clique**.
- **Nunca bloqueia o uso do sistema:** pode ser ignorado.
- **Some sozinho** quando todas as etapas visíveis para você terminam.

### Exemplo preenchido
- Conta financeira: "Banco do Brasil — CC 1234"
- Categoria de venda: "Passagens aéreas"
- Vendedora: "Ana Souza", comissão de 5%
- Cliente: "Maria Souza — (11) 98888-7777"
- Venda VND-0001 de R$ 2.400,00, confirmada

### Erros comuns
- O checklist sumiu: as etapas visíveis para o seu perfil já foram concluídas. É o esperado.
- Uma etapa não aparece: o seu perfil não tem permissão para aquela tarefa.

### Resultado esperado
A agência chega à primeira venda confirmada com as parcelas em Financeiro e a comissão em Comissões.

---

## 4. Dashboard

### Para que serve
Ver, em uma tela, o mês da agência: vendas, valor vendido, recebido, a receber, despesas, comissões, ranking e gráficos.

### Quem pode acessar
Qualquer pessoa logada. **Cada um vê os números que tem permissão de ver** (uma vendedora vê só as próprias vendas, nos mesmos indicadores).

### Os indicadores
- **Números:** Vendas do mês · Valor vendido no mês · Recebido no mês · A receber · Despesas pagas no mês · A pagar · Resultado do mês · Comissões a pagar.
- **Gráficos e tabela:** Vendas por categoria (6 meses) · Evolução de vendas e margem (6 meses) · Ranking de vendedores no mês · Fluxo de caixa (30 dias).
- Indicadores de despesas, a pagar, resultado e fluxo de caixa exigem **permissão de leitura financeira**.

### Passo a passo
1. Abra **Dashboard** no menu.
2. **MASTER:** clique em **"⚙ Configurar dashboard"** para ordenar e ligar ou desligar indicadores. A configuração vale **para toda a agência**.

### Exemplo
Vendas do mês: 2 · Valor vendido: R$ 1.500,00 · Ranking: Ana Souza, 2 vendas, R$ 300,00 de margem.

### Erros comuns
- **Um indicador não aparece:** ele pode estar desligado na configuração ou fora da sua permissão.
- **"Nenhum indicador disponível para o seu perfil":** o perfil não tem leitura de nenhum indicador. Peça a um MASTER para revisar suas permissões.
- **A vendedora vê números menores:** é o escopo dela (só as próprias vendas), não falha de dados.

### No celular
Os números aparecem primeiro. Os gráficos e o ranking ficam recolhidos atrás do botão **"Ver gráficos e rankings"**.

### Resultado esperado
Uma visão rápida e confiável do mês, no escopo do seu perfil.

---

## 5. Clientes

### Para que serve
Cadastrar a carteira de clientes, guardar contato e definir **quem é o responsável** pela conta.

### Quem pode acessar
- **Criar:** MASTER, ADMIN, MANAGER e SELLER.
- **Ver todos:** MASTER, ADMIN, MANAGER e VIEWER. O **SELLER vê só os próprios**.
- **Trocar o responsável:** quem pode editar todos os clientes (MASTER, ADMIN, MANAGER). A troca fica registrada na auditoria.

### Passo a passo
1. Menu **Clientes** → **Novo cliente**.
2. Preencha o **Nome** (único campo obrigatório) e, se tiver, telefone, e-mail, CPF e os demais dados.
3. **Criar.**
4. Para encontrar alguém, use **"Buscar por nome, e-mail ou CPF"** e o filtro de status.
5. Para tirar de uso, **Desativar** na linha do cliente (o sistema pede confirmação). **Ativar** reverte.

### Exemplo preenchido
Nome: Maria Souza · E-mail: maria@email.com · CPF: 123.456.789-00 · Telefone: (11) 98888-7777 · Responsável: Ana Souza (preenchido sozinho para quem tem vendedor vinculado ao login).

### Cadastro rápido no celular
Veja o capítulo [15](#15-uso-no-celular-e-app-instalável): botão **"+ Cliente"** e formulário reduzido.

### Erros comuns
- **"Nome é obrigatório":** o formulário aponta o campo a corrigir.
- **O cliente não aparece para a vendedora:** ele pertence a outra carteira. Ela vê só os próprios.
- **Cliente antigo sem responsável:** só aparece para quem vê todos, até um MASTER atribuir um responsável.

### Resultado esperado
O cliente fica na lista, vinculado a um responsável, pronto para ser usado em vendas.

---

## 6. Vendedores

### Para que serve
Cadastrar quem vende, a **regra de comissão** de cada um e o login vinculado.

### Quem pode acessar
- **Ver a lista:** MASTER, ADMIN, MANAGER e VIEWER.
- **Cadastrar e editar:** MASTER, ADMIN e MANAGER.
- **Vincular um login ao vendedor:** quem gerencia usuários (MASTER).

### Passo a passo
1. Menu **Vendedores** → **Novo vendedor**.
2. Informe o **nome** e a **regra de comissão** (percentual sobre o valor bruto da venda).
3. Para a pessoa **entrar no sistema**: em **Configurações → Novo usuário**, vincule o vendedor ao usuário.
4. O botão **Resumo**, na linha do vendedor, abre os indicadores dele (seção "Resumo de [nome]"), com atalho para o relatório.

### Exemplo preenchido
Ana Souza · comissão de 5% sobre o bruto · login `ana@agencia.com` vinculado.

### Erros comuns
- **Vendedor sem regra de comissão:** as comissões das vendas dele nascem como **"Sem regra"**. Defina o percentual aqui e o valor é recalculado.
- **Um login não pode representar dois vendedores.**
- Um login com perfil SELLER **sem vendedor vinculado** vê listas vazias e não consegue cadastrar cliente. Peça o vínculo a um MASTER.

### Resultado esperado
O vendedor aparece nas vendas e recebe comissão pela regra definida.

---

## 7. Cadastros: categorias, contas e formas de pagamento

### Para que serve
Manter os catálogos básicos usados em vendas e financeiro.

### Quem pode acessar
MASTER, ADMIN e MANAGER (permissão de cadastros). O menu **Cadastros** não aparece para os demais.

### As cinco seções
1. **Categorias de venda** (por exemplo, "Passagens aéreas").
2. **Favorecidos financeiros** (para quem se paga ou de quem se recebe).
3. **Contas financeiras** (por exemplo, "Banco do Brasil — CC 1234"), com o saldo inicial.
4. **Categorias financeiras** (por exemplo, "Despesas fixas").
5. **Formas de pagamento.**

### Passo a passo
1. Menu **Cadastros** e escolha a seção.
2. Preencha **Nome** e salve. A mensagem **"Cadastro salvo."** confirma.
3. Para tirar de uso, **Desativar** (com confirmação). **Ativar** reverte.

### Erros comuns
- **Sem conta financeira**, as baixas não podem ser registradas: cadastre ao menos uma.
- Sem categoria de venda, não há como classificar a venda.

### Resultado esperado
Catálogos prontos para uso em **Vendas** e **Financeiro**.

---

## 8. Vendas, custos e margem

### Para que serve
Lançar vendas em **rascunho**, **confirmar** (isso gera as parcelas a receber e a comissão), registrar **custos diretos** e **cancelar**.

### Quem pode acessar
- **Criar venda:** MASTER, ADMIN, MANAGER e SELLER.
- **Editar ou cancelar qualquer venda:** MASTER, ADMIN e MANAGER. O **SELLER** só as próprias.
- Quem vê todas as vendas: MASTER, ADMIN, MANAGER e VIEWER. O SELLER vê só as próprias.

### Passo a passo
1. Menu **Vendas** → **Nova venda**.
2. Escolha **cliente**, **vendedor** e **categoria**.
3. Informe **valor bruto**, **data da venda**, **vencimento** e **número de parcelas**.
4. Salve: a venda nasce como **rascunho** ("Venda criada como rascunho.").
5. Abra a venda em **Detalhe**, lance os **custos diretos** (se houver) com **Adicionar custo** e revise as parcelas.
6. Clique em **Confirmar**.
7. Depois de confirmada: as parcelas aparecem em **Financeiro › A receber** e a comissão em **Comissões**.
8. Para cancelar: **Detalhe → Cancelar venda**. O sistema pede confirmação e **a ação não pode ser desfeita**.

### Exemplo preenchido
VND-0001 · Cliente: Maria Souza · Vendedora: Ana Souza · Categoria: Passagens aéreas · Bruto R$ 2.400,00 · 3 parcelas · 1º vencimento em 15/11/2026 · custo direto "taxa de embarque" R$ 120,00 → **margem de R$ 2.280,00**.

### Os status da venda

| Status | O que significa |
|---|---|
| **Rascunho** | Ainda editável. É aqui que se lançam os custos diretos. |
| **Confirmada** | Gerou as parcelas a receber e a comissão do vendedor. |
| **Parcial** | Alguma parcela já foi recebida, mas ainda falta valor. |
| **Pago** | Todas as parcelas foram recebidas. |
| **Cancelada** | Definitivo: não pode ser reaberta. |

### Erros comuns
- **Confirmar sem regra de comissão no vendedor:** a comissão fica "Sem regra". Defina o percentual em **Vendedores**.
- **Campos obrigatórios faltando:** o formulário explica o que corrigir.
- **Cancelada por engano:** não há como desfazer. Crie uma **nova venda**.
- **Lista vazia para a vendedora:** confira se o login tem vendedor vinculado.

### Resultado esperado
Venda confirmada, com parcelas em Financeiro, comissão gerada e margem calculada (bruto menos custos diretos).

---

## 9. Financeiro

### Para que serve
Dar baixa nas parcelas a receber, lançar e pagar despesas, estornar e acompanhar o caixa.

### Quem pode acessar
- **Consultar listas e saldos:** MASTER, ADMIN, MANAGER e VIEWER (permissão de leitura financeira).
- **Receber, lançar despesas, pagar e estornar:** MASTER, ADMIN e MANAGER (gestão financeira). Um MASTER pode liberar isso a uma vendedora, como exceção.

### As três abas
- **A receber:** parcelas das vendas confirmadas.
- **A pagar:** despesas e comissões aprovadas.
- **Histórico:** pagamentos já registrados, onde também se **estorna**.

### Passo a passo
**Receber uma parcela**
1. **A receber** → **Receber** na linha da parcela.
2. Informe **conta**, **valor** e **data**. A mensagem **"Recebimento registrado."** confirma.

**Lançar e pagar uma despesa**
1. **A pagar** → **Nova despesa**: descrição, valor, vencimento, categoria financeira e conta. ("Despesa criada.")
2. Quando pagar, **Pagar** na linha. ("Pagamento registrado.")

**Corrigir uma baixa errada**
1. No **Histórico**, **Estornar** e escreva o **motivo** (obrigatório).
2. O lançamento original é mantido e um **movimento inverso** é registrado. ("Estorno registrado.")

### Exemplo preenchido
- Baixa: parcela de R$ 800,00 da venda VND-0001 → conta "Banco do Brasil" → R$ 800,00 em 05/11/2026.
- Despesa: "Aluguel do escritório" · R$ 1.500,00 · vencimento 05/11/2026 · categoria "Despesas fixas".

### Erros comuns
- **Aviso para cadastrar uma conta financeira:** sem conta, a baixa não é registrada. Cadastre em **Cadastros**.
- **Estorno sem motivo** é recusado.
- **Despesa vencida** aparece com o status **"Vencido"**.
- **Botões de baixa ausentes:** falta a permissão de gestão financeira.

### Resultado esperado
Parcelas baixadas, despesas pagas e o histórico fiel, inclusive com as correções.

---

## 10. Comissões

### Para que serve
Acompanhar, aprovar e pagar a comissão gerada em cada venda confirmada.

### Quem pode acessar
- **Ver:** MASTER, ADMIN, MANAGER e VIEWER veem todas. O **SELLER vê só as próprias**.
- **Aprovar e ajustar:** MASTER, ADMIN e MANAGER.
- **Pagar:** MASTER, ADMIN e MANAGER, com a permissão financeira (o pagamento acontece em **Financeiro › A pagar**).

### Passo a passo
1. Menu **Comissões** e use os filtros do topo da tela.
2. **Aprove** as comissões pendentes ("Comissão aprovada.").
3. Se precisar corrigir um valor, use **Ajustar** ("Comissão ajustada.").
4. Vá em **Financeiro › A pagar** e pague a conta da comissão.

### Exemplo preenchido
Ana Souza com 5% sobre o bruto: venda de R$ 2.400,00 → comissão de **R$ 120,00**. Fluxo: **Pendente** → Aprovar → vira conta a pagar → baixa em A pagar → **Pago**.

### Os status da comissão

| Status | O que significa |
|---|---|
| **Sem regra** | A venda foi confirmada sem percentual no vendedor. Defina em Vendedores e o valor é recalculado. |
| **Pendente** | Valor calculado, aguardando aprovação. |
| **Aprovada** | Virou conta a pagar; o pagamento depende da permissão financeira. |
| **Pago** | Conta quitada. |

### Erros comuns
- **"Sem regra":** veja o capítulo [6](#6-vendedores).
- **Aprovada, mas não paga:** ela aguarda a baixa em Financeiro › A pagar.
- **Venda cancelada** não gera pagamento de comissão.

### Resultado esperado
Comissões aprovadas e pagas, com o histórico em Financeiro.

---

## 11. Relatórios

### Para que serve
Consultar vendas, desempenho da equipe, comissões e fluxo de caixa por período, e baixar os dados.

### Quem pode acessar
As abas aparecem conforme a permissão:
- **Vendas:** relatórios de vendas (todos ou só os próprios).
- **Vendedores** (ou **Meus indicadores**, para quem não compara a equipe).
- **Comissões:** quem pode ver comissões.
- **Fluxo de caixa:** permissão de relatório financeiro.

### Passo a passo
1. Menu **Relatórios** e escolha a aba.
2. Defina o período em **De** e **Até**.
3. **Consultar.**
4. **Baixar CSV** para levar os dados para uma planilha.

### Erros comuns
- **Uma aba não aparece:** falta a permissão daquele relatório.
- **Resultado vazio:** confira o período.

### Resultado esperado
Tabela do período na tela e o arquivo CSV com os mesmos dados.

---

## 12. Importação de planilhas

### Para que serve
Trazer **clientes** ou **vendas** em lote de um arquivo **CSV ou XLSX**, com conferência antes de gravar. Os formatos aceitos são `.csv` e `.xlsx` (planilhas antigas `.xls` não).

### Quem pode acessar
MASTER, ADMIN e MANAGER (permissão de importação). O menu **Importações** não aparece para os demais.

### Passo a passo
1. Menu **Importações** e escolha **Clientes** ou **Vendas**.
2. Envie o arquivo e clique em **Ler arquivo**. Em arquivos com várias abas, escolha a aba (o padrão é a primeira).
3. Confira o **Preview**.
4. Em **Associação de colunas**, indique qual coluna do arquivo vai para qual campo ("Não importar" ignora a coluna). Em **vendas**, escolha também o vendedor e a categoria padrão.
5. Clique em **Validar dry-run**. É só uma conferência: **nada é gravado**.
6. Em **Resultado por linha**, resolva as pendências: **vincule o cliente existente** ou ignore a linha.
7. Clique em **Confirmar importação**. O sistema pergunta quantas linhas serão gravadas; confirme para gravar.

### Exemplo preenchido
Arquivo `clientes_2026.xlsx` · "Nome completo" → nome · "CPF" → cpf · "Celular" → telefone · "E-mail" → email.

### Erros comuns
- **Coluna sem associação:** o campo obrigatório fica sem valor e a linha fica pendente.
- **Pendência de cliente:** vincule ou ignore a linha antes de confirmar.
- **Achar que o dry-run gravou:** ele não grava. Só **Confirmar importação** grava.

### Observação sobre o plano
No plano Lite a importação é **limitada**; Pro e Full oferecem mais. **Os limites numéricos ainda não estão definidos** (veja o capítulo [21](#21-o-que-ainda-depende-da-empresa-ou-do-produto)). A tela mostra um aviso discreto sobre isso, que **não impede** o uso.

### Resultado esperado
Clientes ou vendas gravados a partir da planilha, com as pendências resolvidas e as linhas conferidas.

---

## 13. Usuários e permissões

### Para que serve
Criar logins, trocar perfis, conceder permissões extras e reativar ou desativar acessos.

### Quem pode acessar
**MASTER** (gestão de usuários e de permissões). O menu **Configurações** não aparece para os demais.

### Passo a passo
**Criar um usuário**
1. **Configurações → Novo usuário.**
2. Preencha **nome**, **e-mail (login)**, **senha** (mínimo de 8 caracteres) e **perfil**.
3. Se a pessoa vai vender, **vincule o vendedor** ao usuário. ("Usuário salvo.")

**Ajustar permissões de uma pessoa**
1. Na linha do usuário, **Permissões.**
2. Marque ou desmarque o que for diferente do padrão do perfil. Isso fica registrado como **exceção**. ("Permissões salvas.")

**Desativar e reativar**
- **Desativar** encerra o acesso na próxima requisição (o sistema pede confirmação). **Ativar** reverte.

### Exemplo preenchido
Usuário "Ana Souza" · `ana@agencia.com` · senha forte · perfil SELLER · vendedor "Ana Souza" vinculado. Exceção: conceder o recebimento financeiro a uma vendedora.

### Regras de segurança
- **Ninguém altera o próprio perfil, o próprio status ou as próprias permissões** (nem o MASTER).
- **O último MASTER** da agência não pode ser rebaixado.
- Ninguém concede uma permissão que não possui. Algumas permissões só um MASTER concede.
- Senha com menos de 8 caracteres é recusada.

### Resultado esperado
Cada pessoa com o acesso certo, e as mudanças registradas na auditoria.

---

## 14. Identidade visual da agência

### Para que serve
Fazer o sistema parecer da agência: nome, logo e cores no **login** e no **topo do sistema**.

### Quem pode acessar
**MASTER.** Os demais perfis veem a identidade, mas não editam.

### Onde fica
**Configurações → Identidade visual.**

### Campos

| Campo | Regra |
|---|---|
| **Nome fantasia** | Até 80 caracteres. Aparece no login e no topo do menu. |
| **Texto de boas-vindas** | Até 160 caracteres. Aparece no login. |
| **Cor primária** | Botões e destaques. Precisa ser **escura o bastante** para o texto branco ficar legível. |
| **Cor secundária** | Menu lateral. Também precisa de bom contraste com o texto branco. |
| **Cor de fundo do login** | Fundo da tela de entrada. |
| **Logo** | Imagem **PNG, JPEG ou WebP**, até **150 KB**. SVG não é aceito. |

### Passo a passo
1. Preencha o que quiser. **Campo vazio usa o visual padrão.**
2. Para o logo, escolha o arquivo; a **pré-visualização** aparece. **Remover logo** tira a imagem.
3. **Salvar identidade visual.** ("Identidade visual salva.")
4. Para voltar ao padrão: **Restaurar padrão** (com confirmação).

### Link de login da agência
Compartilhe o endereço do sistema com `?agencia=` e o identificador da agência (por exemplo, `...?agencia=gadotti`). Quem abrir já vê a tela de login da agência.

### Erros comuns
- **"Cor primária é clara demais":** escolha uma cor mais escura.
- **Logo recusado:** confira o formato (PNG, JPEG ou WebP) e o tamanho (até 150 KB).
- **"Não foi possível carregar a identidade visual atual":** o editor não abre para não apagar a identidade por engano. Recarregue a página; se continuar, avise o suporte técnico.

### Plano
A identidade visual é **básica no Lite**, avançada no Pro e completa no Full (capítulo [17](#17-recursos-do-plano-lite-pro-e-full)).

### Resultado esperado
Login e topo do sistema com a cara da agência. Se nada for configurado, o sistema continua funcionando com o visual padrão.

---

## 15. Uso no celular e app instalável

### Para que serve
Consultar e cadastrar rápido fora do escritório. **O celular não substitui o computador**: o foco é consulta e captação.

### O que existe no celular
- **Menu em gaveta:** o botão **☰** no topo abre o menu e ele fecha sozinho ao escolher uma tela.
- **Topo compacto**, com **Ajuda** e **Sair** sempre à vista.
- **Botão flutuante "+ Cliente"** (para quem pode criar cliente): abre o cadastro rápido de qualquer tela.
- **Cadastro rápido:** mostra só **Nome**, **Telefone** e **E-mail** (só o nome é obrigatório). O botão **"Mais campos"** mostra o resto. Ao editar um cliente, o formulário vem completo.
- **Listas de Clientes e Vendas em cartões**, um por registro, com os dados e os botões bem espaçados.
- **Dashboard resumido:** números primeiro; gráficos e ranking em **"Ver gráficos e rankings"**.
- **Ajuda:** o link **Ajuda** está no topo.

### Passo a passo: cadastrar um cliente no celular
1. Toque em **"+ Cliente"**.
2. Preencha **Nome** e, se tiver, **Telefone** e **E-mail**.
3. Se precisar de mais dados, toque em **"Mais campos"**.
4. **Criar.**

### Instalar como app
- O sistema pode ser instalado na tela inicial pelo navegador (a opção "Instalar" ou "Adicionar à tela inicial" depende do navegador e do aparelho). O app instalado tem os atalhos **Novo cliente**, **Vendas** e **Ajuda**.
- O app é **online**: sem internet, ele abre a casca do sistema, mas **os dados exigem conexão**. Não há cadastro offline.
- O app instalado guarda apenas a **casca do sistema** (telas e ícones), **nunca os dados de negócio**. Ao clicar em **Sair**, a sessão é apagada do aparelho (fica só a lembrança da última agência usada no login).

### Limites desta fase
- O app instalado traz o nome e os ícones padrão do Travel Lite. Nome e logo por agência no ícone ainda **não** existem.
- A instalação e o uso em **cada tipo de aparelho** ainda precisam ser validados em campo (veja o capítulo [21](#21-o-que-ainda-depende-da-empresa-ou-do-produto)).
- Comissões, financeiro, importações e cadastros continuam em tabela, com rolagem lateral no celular.

### Resultado esperado
Consulta e cadastro rápido de cliente pelo celular, com o mesmo escopo de permissões do computador. **O SELLER continua vendo só o que é dele.**

---

## 16. Ajuda, busca e dúvidas frequentes

### Para que serve
Tirar dúvidas **dentro do próprio sistema**, com exemplos prontos.

### Quem pode acessar
Qualquer pessoa logada (o link **Ajuda** fica no topo de todas as telas).

### O que tem
- Um artigo por área: Primeiros passos, Dashboard, Clientes, Vendas, Importação de planilhas, Financeiro, Comissões, Vendedores, Configurações e permissões, e **Planos e recursos**.
- Cada artigo traz: para que serve, quando usar, campos obrigatórios, **exemplo preenchido**, passo a passo, erros comuns, permissões necessárias e o que fazer se algo não aparecer.
- **Busca:** digite uma palavra (por exemplo, "comissão" ou "cancelar venda") em **"Buscar na ajuda"**.
- **Dúvidas frequentes** no final.
- Âncoras diretas, como `/ajuda#vendas`.

### Observações
- A Ajuda é **informativa**: ela não altera nenhuma permissão.
- Abrir a Ajuda conta como a última etapa do checklist de primeiros passos.

### Resultado esperado
Resposta rápida, sem precisar de suporte humano para as tarefas comuns.

---

## 17. Recursos do plano: Lite, Pro e Full

### Para que serve
Entender o que o plano **Lite** cobre e o que existe nos planos **Pro** e **Full**, para decidir quando vale conversar sobre ampliar.

### Quem pode acessar
**Qualquer pessoa logada**, somente leitura. O endereço é `/plano`. Os caminhos para chegar: **Ajuda → Planos e recursos**, o cartão **Plano e recursos** em Configurações e os avisos discretos no Dashboard, em Importações e na Identidade visual.

### A tabela

| Recurso | Lite | Pro | Full |
|---|---|---|---|
| Clientes | Sim | Sim | Sim |
| Vendas | Sim | Sim | Sim |
| Financeiro básico | Sim | Sim | Sim |
| Importação CSV/XLSX | Sim, limitada | Sim | Sim |
| Dashboard | Essencial | Avançado | Completo |
| Mobile | Consulta + cliente rápido | Operação ampliada | Completo |
| Branding | Básico | Avançado | Completo |
| Integrações | Preparado | Parcial | Completo |
| Migração para o Full | Readiness | Assistida | Nativo |

Na tela, **✓** significa disponível por completo e **◐** significa versão reduzida ou intermediária.

### Importante: é informativo
- **A tela de planos só informa.** Ela não libera nem bloqueia nada: o que cada pessoa pode fazer continua dependendo das **permissões** do perfil.
- **Não há cobrança, contratação nem checkout** no sistema.
- **Não há valores nem limites numéricos** nesta fase: eles serão informados pelo responsável comercial.

### Quer saber mais sobre outro plano?
- **MASTER:** use **"Copiar resumo para o responsável"**. O botão **apenas copia um texto** (plano atual e recursos de interesse). **Nada é enviado.** Cole o texto numa mensagem ao responsável pela agência ou ao comercial.
- **Demais perfis:** fale com o administrador da agência.

### Resultado esperado
Você entende, sem documentação externa, onde o Lite acaba e onde Pro e Full começam, sem perder nenhuma função do dia a dia.

---

## 18. Prontidão para migrar do Lite para o Full

### Para que serve
Antes de migrar, **verificar se os dados do Lite estão prontos** e listar o que precisa de correção.

### O que existe hoje
- É um **relatório técnico, somente leitura**, gerado sob demanda. **Ainda não existe uma tela** para isso no sistema (a tela e a exportação em PDF ou CSV são evolução futura).
- Quem pode pedir: **MASTER** (por meio do responsável técnico).
- O relatório **não altera dados** e mostra **só contagens**, nunca nomes, e-mails ou CPFs.

### O que o relatório verifica
Agência com nome e identificador válidos · usuários ativos com e-mail válido · pelo menos um MASTER · vendedores vinculados quando necessário · CPFs de clientes · status das vendas · recebíveis e pagamentos equilibrados · estados impossíveis nas comissões · falhas críticas pendentes na fila de integração.

### Como ler o resultado
Cada pendência vem com o **problema**, a **entidade afetada**, o **impacto**, a **ação recomendada** e **quem pode corrigir**, classificada por gravidade:
- **Bloqueador:** impede a migração.
- **Atenção:** permite migrar, com validação humana.
- **Informativo:** não impede.
A agência está **pronta** apenas quando **não há bloqueadores**.

### Fluxo recomendado do upgrade
1. A agência solicita o upgrade.
2. Gera-se o relatório de prontidão.
3. As pendências são corrigidas no Lite.
4. A migração é agendada.
5. Os dados são exportados ou sincronizados.
6. O operador valida amostras.
7. A agência acessa o ambiente Full.

### Observações
- **Nada é descartado em silêncio:** a migração deve ser verificável e deixar trilha do que foi migrado.
- Recursos do Full que ainda não têm equivalente no Lite, campos personalizados e dados inconsistentes podem exigir **decisão humana**.
- O plano comercial e o prazo **dependem da empresa** (capítulo [21](#21-o-que-ainda-depende-da-empresa-ou-do-produto)).

### Resultado esperado
Pendências conhecidas e corrigidas **antes** da migração, sem surpresa na hora de mudar de ambiente.

---

## 19. Boas práticas

- **Cadastre na ordem:** vendedores, conta financeira, categorias, clientes, primeira venda.
- **Defina a regra de comissão antes de confirmar vendas.** Isso evita comissões "Sem regra".
- **Revise o rascunho antes de confirmar.** Depois de confirmada, as parcelas e a comissão já foram geradas.
- **Cancelar é definitivo:** em caso de dúvida, não cancele; corrija ou crie uma nova venda.
- **Corrija baixas com estorno e motivo**, nunca por um lançamento "por cima".
- **Rode o dry-run da importação** e resolva todas as pendências antes de confirmar.
- **Dê a cada pessoa o perfil mínimo necessário.** Use **exceções** de permissão só quando houver motivo, e peça sempre a um MASTER.
- **Escolha com cuidado quem é MASTER.** O MASTER controla usuários, permissões, dashboard e identidade visual, ninguém altera o próprio perfil e o **último MASTER da agência não pode ser rebaixado**. Vale ter uma segunda pessoa de confiança nesse perfil.
- **Senhas:** mínimo de 8 caracteres, nunca compartilhadas. Se alguém sair da agência, **desative** o usuário.
- **Quem vende tem um login com vendedor vinculado.** Sem o vínculo, as listas ficam vazias.
- **Confira o escopo antes de achar que há erro:** a vendedora vê só as próprias vendas, e isso é proposital.
- **Use a Ajuda primeiro** (com a busca): ela tem exemplos preenchidos.
- **No celular, prefira consulta e cadastro rápido;** deixe financeiro, importação e relatórios para o computador.

---

## 20. Solução de problemas comuns

| O que aconteceu | O que significa | O que fazer |
|---|---|---|
| Não vejo um menu ou botão | O seu perfil não tem a permissão daquela ação | Peça a um MASTER em **Configurações → Permissões** |
| Mensagem "Acesso restrito" ao abrir um endereço | Falta permissão para aquela área (não é erro do sistema) | Volte ao Dashboard ou peça a permissão a um MASTER |
| "Invalid credentials" no login | Agência, e-mail ou senha incorretos (o sistema não diz qual) | Confira os três; se esqueceu a senha, peça uma nova a um MASTER |
| Fui deslogado | A sessão vale 24 horas, ou o usuário foi desativado | Entre de novo; se persistir, fale com um MASTER |
| Listas vazias para um vendedor | O login não tem vendedor vinculado, ou os dados são de outra carteira | Peça o vínculo em Configurações |
| Comissão "Sem regra" | A venda foi confirmada sem percentual no vendedor | Defina a regra em **Vendedores**; o valor é recalculado |
| Não consigo receber ou pagar | Falta conta financeira, ou falta permissão de gestão financeira | Cadastre a conta em **Cadastros** ou peça a permissão |
| Estorno recusado | O motivo é obrigatório | Escreva o motivo |
| Venda cancelada por engano | O cancelamento não pode ser desfeito | Crie uma nova venda |
| Importação com linhas pendentes | Falta associar colunas ou vincular clientes | Resolva em **Resultado por linha** e confirme |
| "Only CSV or XLSX uploads are allowed" ao importar | O arquivo não é `.csv` nem `.xlsx` (por exemplo, `.xls` antigo) | Salve a planilha como `.xlsx` ou `.csv` e envie de novo |
| "Cor primária é clara demais" | O texto branco ficaria ilegível | Escolha uma cor mais escura |
| Logo recusado | Formato ou tamanho fora da regra | Use PNG, JPEG ou WebP de até 150 KB |
| "Não foi possível carregar a identidade visual atual" | Falha ao ler a identidade; o editor fecha para proteger os dados | Recarregue a página; se continuar, avise o suporte técnico |
| Indicador do Dashboard faltando | Desligado na configuração ou sem permissão | MASTER confere "⚙ Configurar dashboard" |
| O app instalado abre, mas não mostra dados | Sem conexão com a internet | Conecte-se; os dados exigem internet |
| O checklist "Prepare sua agência" sumiu | Todas as etapas visíveis para você terminaram | É o esperado |
| Esqueci como fazer algo | | Use **Ajuda** e a busca |

Se o problema não estiver aqui nem na Ajuda, anote **o que você estava fazendo, a mensagem exata e o horário**, e fale com o administrador da agência.

---

## 21. O que ainda depende da empresa ou do produto

Estes pontos **não estão definidos** e, por isso, **não aparecem como número, preço ou promessa** neste manual nem no sistema.

| Tema | Situação hoje |
|---|---|
| **Limites do plano Lite** (clientes, vendas, usuários, importações) | Não definidos. O sistema fala em "limitada" e "essencial" sem números. Hoje **nenhum limite de plano é imposto** pela aplicação. |
| **Preço e condições comerciais** | Não definidos. Não existe cobrança, contratação nem checkout no sistema. |
| **Existência do plano Pro antes do Full** | A decisão é do produto; a tabela de recursos descreve os dois como referência. |
| **Quem aprova um upgrade** | Não definido. Por enquanto, só o MASTER vê o botão de copiar o resumo; o pedido é apenas um texto, sem envio. |
| **Redefinição de senha por e-mail** | Não existe. A senha é redefinida por um MASTER. |
| **Tela de prontidão para migração** | Não existe; hoje é um relatório técnico. Tela e exportação em PDF ou CSV são evolução futura. |
| **Agendamento e execução da migração para o Full** | Dependem de decisão e de operação da empresa. |
| **Identidade visual avançada e completa** (Pro e Full) | Descritas na tabela de planos, não implementadas. |
| **Integrações** (Pro e Full) | Descritas na tabela de planos; no Lite apenas "preparado". |
| **Ícone e nome do app instalado por agência** | Não existe; hoje o ícone é o padrão do Travel Lite (provisório). |
| **Cadastro offline e notificações no celular** | Fora do escopo desta fase. |
| **Validação em aparelhos reais** (Android e iPhone) | Pendente de teste em campo. |
| **Manual em PDF e checklist impresso** | Depois da estabilização visual. O checklist rápido está no anexo deste manual. |

---

## 22. Anexos: checklist rápido e glossário

### Checklist rápido (pode imprimir)

**Primeiro dia da agência (MASTER)**
- [ ] Entrei com a agência, o e-mail e a senha.
- [ ] Conferi a identidade visual (nome, logo, cores) em Configurações.
- [ ] Cadastrei os vendedores e a regra de comissão de cada um.
- [ ] Cadastrei a conta financeira e as categorias de venda (Cadastros).
- [ ] Criei os usuários, vinculei os vendedores e conferi as permissões.
- [ ] Cadastrei o primeiro cliente.
- [ ] Registrei e confirmei a primeira venda.
- [ ] Abri a Ajuda.

**Todo dia (vendedor)**
- [ ] Cadastrar o cliente novo (no celular: **+ Cliente**).
- [ ] Registrar a venda, revisar o rascunho e confirmar.
- [ ] Consultar minhas vendas e comissões.

**Toda semana (administração)**
- [ ] Dar baixa nas parcelas recebidas.
- [ ] Lançar e pagar as despesas.
- [ ] Aprovar e pagar as comissões.
- [ ] Conferir o Dashboard e os Relatórios.

### Glossário

| Termo | Significado |
|---|---|
| **Agência (identificador)** | O nome curto da sua agência no login, por exemplo `gadotti`. |
| **Rascunho** | Venda ainda editável, sem parcelas nem comissão. |
| **Confirmar** | Passo que gera as parcelas a receber e a comissão. |
| **Parcela / recebível** | Cada pagamento a receber de uma venda. |
| **Baixa** | Registrar que uma parcela foi recebida (ou uma despesa foi paga). |
| **Estorno** | Correção que mantém o lançamento original e registra um movimento inverso, com motivo. |
| **Margem** | Valor bruto da venda menos os custos diretos. |
| **Comissão "Sem regra"** | Comissão de uma venda confirmada antes de o vendedor ter percentual definido. |
| **Carteira** | O conjunto de clientes de um vendedor. |
| **Escopo** | O que o seu perfil permite ver: tudo da agência ou só o que é seu. |
| **Exceção de permissão** | Permissão diferente do padrão do perfil, concedida ou retirada por um MASTER. |
| **Dry-run** | Conferência da importação que **não grava nada**. |
| **Pendência** | Linha da importação (ou item da prontidão) que precisa de ajuste antes de seguir. |
| **Readiness (prontidão)** | Relatório que avalia se os dados do Lite estão prontos para migrar. |
| **Bloqueador / Atenção / Informativo** | Gravidade de uma pendência de migração. |
| **Lite, Pro, Full** | Os três planos descritos em Recursos do plano; hoje o sistema é o Lite. |
| **Informativo** | Algo que explica ou orienta, mas **não altera permissão nem libera recurso**. |
