# Guia de uso — Travel Platform Full

**Público:** proprietários, administradores e equipe de agência.  
**Objetivo:** orientar o uso do produto, explicar a finalidade das áreas, a origem dos dados e os caminhos entre telas.  
**Status:** versão inicial baseada nas rotas e componentes do Full presentes neste checkout. Conteúdo de negócio que varia por configuração deve ser conferido na tela e na regra vigente da agência.

> Este guia descreve somente o Full para o release da Gadotti; Travel Lite não faz parte deste escopo. Os exemplos são fictícios e não representam clientes, valores ou resultados reais.

## Como usar este guia

- Comece pelo [roteiro recomendado](#roteiro-de-uso) se a agência está iniciando.
- Use a [matriz de áreas](#matriz-de-areas) para entender finalidade, origem dos dados e acesso direto à tela.
- Consulte os [fluxos completos](#fluxos-de-ponta-a-ponta) para percorrer uma operação entre áreas.
- Se uma tela ou ação não aparece, confira o perfil, as permissões, os módulos habilitados e se a agência já possui dados para aquela etapa.

## Roteiro de uso

1. **Configure a agência e os acessos.** Revise perfil, equipe, papéis, módulos e parâmetros financeiros. Dê a cada usuário apenas o acesso necessário ao trabalho.
2. **Prepare os cadastros.** Registre fornecedores, categorias e centros de custo que serão usados pela agência. Cadastre funcionários e, quando aplicável, as regras e condições de comissão.
3. **Organize o atendimento.** Cadastre clientes, registre desejos, crie oportunidades no pipeline e programe tarefas de acompanhamento.
4. **Apresente opções.** Prepare ofertas e propostas a partir das informações disponíveis; confira conteúdo, valores, datas e validade antes de compartilhar.
5. **Registre a venda.** Confirme cliente, vendedor, itens, fornecedor, categoria, custos, condições e parcelas. A venda é o elo entre a negociação e seus efeitos financeiros/operacionais.
6. **Acompanhe compromissos.** Confira recebíveis, pagáveis, baixas e movimentos financeiros. Um registro de baixa documenta a informação no sistema; não realiza nem comprova transferência bancária.
7. **Prepare a viagem.** Confira viagem, reserva, passageiros e serviços aplicáveis. Complete documentos, ocorrências e acompanhamento pós-viagem conforme o serviço contratado.
8. **Analise e feche o ciclo.** Use painel, relatórios, projeções e DRE como resumos. Investigue diferenças nas telas transacionais que originaram os números.

O roteiro é uma sequência útil, não uma exigência rígida. Algumas áreas dependem de módulos habilitados, dados anteriores e permissões.

## Matriz de áreas

As descrições de origem abaixo refletem o encadeamento funcional observado no cliente Full e nas rotas correspondentes. Os indicadores exibidos podem ter filtros e critérios próprios. Quando a regra não estiver explicitada pela interface, valide os registros de origem em vez de inferir o cálculo pelo nome do indicador.

### Painel e análise

| Área e tela | Para que serve / por que usar | De onde vêm os dados | Próxima ação |
|---|---|---|---|
| [Painel](/) | Acompanhar um resumo comercial, financeiro e operacional e priorizar o trabalho. | Oportunidades, tarefas, propostas, vendas, recebíveis, viagens e indicadores configurados. | Abra o registro de origem antes de alterar ou decidir. |
| [Configuração do painel](/settings/dashboard) | Escolher e organizar os indicadores disponíveis para a agência. | Preferências de widgets e capacidades do usuário. | Salve uma disposição que ajude a equipe a acompanhar o trabalho recorrente. |
| [Relatórios](/reports) | Consultar visões agregadas para acompanhamento gerencial. | Registros comerciais e operacionais, de acordo com os filtros da tela. | Ajuste período e filtros; valide amostras nas telas de origem. |
| [Relatórios financeiros](/financial/reports) | Analisar informações financeiras em relatórios. | Lançamentos financeiros, vendas e parâmetros do relatório selecionado. | Investigue divergências em recebíveis, pagáveis e caixa. |
| [DRE gerencial](/financial/dre) | Consultar a visão gerencial de receitas, custos e despesas reconhecidos segundo as regras do módulo. | Lançamentos e classificações financeiras elegíveis no período. | Confira categorias e período antes de interpretar o resultado. |
| [Projeções](/financial/projections) | Acompanhar valores projetados conforme os dados e critérios da tela. | Previsões e compromissos financeiros existentes. | Compare previsto e realizado verificando vencimentos e baixas. |

**Benefício:** o painel acelera a leitura do dia; relatórios e DRE apoiam análise. Nenhum deles substitui a conferência do detalhe transacional.

### CRM e comercial

| Área e tela | Para que serve / por que usar | De onde vêm os dados | Próxima ação |
|---|---|---|---|
| [Clientes](/customers) e detalhe `/customers/:id` | Manter cadastro e consultar contexto de relacionamento. | Campos do cadastro, interações, desejos, viagens e vendas relacionadas quando vinculadas. | Complete dados úteis ao atendimento e mantenha os vínculos corretos. |
| [Cadastro remoto](/enrollment-links) | Compartilhar um fluxo de cadastro quando a agência habilitar essa funcionalidade. | Convites e informações submetidas pelo fluxo de cadastro remoto. | Revise o resultado recebido na ficha do cliente. |
| [Desejos](/wishes) e detalhe `/wishes/:id` | Registrar intenção de viagem e detalhes de interesse. | Cliente, destino e dados do desejo. | Converta em oportunidade ou proposta conforme a etapa comercial. |
| [Pipeline](/pipeline) | Visualizar oportunidades por etapa e organizar o avanço comercial. | Oportunidades, valores, responsáveis e etapas registradas. | Atualize etapa e próxima ação de acordo com o atendimento real. |
| [Segmentação](/segments) | Definir e consultar grupos de clientes conforme critérios disponíveis. | Cadastro dos clientes e critérios configurados no segmento. | Confira resultados e revise critérios quando o conjunto não corresponder ao esperado. |
| [Tarefas](/tasks) | Registrar atividades, responsáveis e prazos de acompanhamento. | Tarefas criadas pela equipe e seus estados. | Marque a conclusão após realizar a atividade e crie o próximo lembrete quando necessário. |
| [Ofertas](/offers) e detalhe `/offers/:id` | Organizar ofertas comerciais disponíveis à equipe. | Conteúdo, valores, condições e validade cadastrados. | Confira disponibilidade e datas antes de usar com um cliente. |
| [Pescador](/pescador) | Apoiar a identificação e revisão de oportunidades de divulgação. | Itens e fila de revisão disponibilizados pelo módulo. | Revise sugestões antes de transformá-las em comunicação externa. |
| [Propostas](/proposals) e editor/visualização | Preparar, editar e acompanhar propostas apresentadas a clientes. | Cliente, itens/serviços, preços, datas e conteúdo da proposta. | Revise a prévia, compartilhe pelo fluxo permitido e registre a resposta. |

**Exemplo fictício:** Maria solicita uma viagem em família para Lisboa. Cadastre ou localize Maria, registre o desejo, abra uma oportunidade no pipeline e defina uma tarefa para retornar na data combinada. Prepare uma proposta vinculada ao atendimento e atualize o estágio conforme a resposta.

### Venda, reserva e importação

| Área e tela | Para que serve / por que usar | De onde vêm os dados | Próxima ação |
|---|---|---|---|
| [Vendas](/sales) | Consultar vendas e abrir seus detalhes. | Registros de venda e vínculos com cliente, vendedor, itens e situação. | Abra a venda para conferir itens, condições e histórico. |
| [Nova venda](/sales/new) | Registrar a negociação concluída conforme o fluxo disponível. | Cliente, vendedor, produtos/serviços, custos, fornecedor e condição de pagamento informados. | Confira totais, vencimentos e dados vinculados antes de confirmar. |
| [Categorias de venda](/sale-categories) | Manter categorias usadas para classificar vendas. | Cadastros de categoria da agência. | Use nomes consistentes para melhorar filtros e análises. |
| [Importar vendas](/sales/import) | Preparar importação de registros por arquivo no fluxo controlado. | Arquivo carregado, mapeamento de colunas, validações e resultado da revisão. | Revise correspondências e avisos antes de concluir a importação. Importar não deve ser confundido com apenas visualizar um arquivo. |
| [Reservas](/bookings) e detalhe `/bookings/:id` | Consultar reservas vinculadas ao atendimento e à viagem conforme os dados cadastrados. | Reservas registradas e relações disponíveis com cliente, venda ou viagem. | Complete as informações operacionais requeridas para o caso. |
| [História financeira da venda](/financial/sales/:saleId/story) | Entender eventos e valores associados a uma venda. | Venda, parcelas, recebimentos e eventos financeiros vinculados. | Use a história para localizar o evento e abra o lançamento correspondente. |

**Exemplo fictício:** registre uma venda de R$ 2.400,00 para Maria em duas parcelas de R$ 1.200,00. Associe os itens e o fornecedor corretos, confirme datas e valores e só então acompanhe cada parcela em Contas a Receber. A venda não significa que o valor integral já foi recebido nem que o valor total seja receita da agência.

### Operação de viagens

| Área e tela | Para que serve / por que usar | De onde vêm os dados | Próxima ação |
|---|---|---|---|
| [Viagens](/trips) e detalhe `/trips/:id` | Organizar viagem, destino, período, estado e vínculos disponíveis. | Viagens criadas pela equipe ou relacionadas a clientes/vendas quando o fluxo oferece essa opção. | Confira dados e vínculos; complete os componentes operacionais necessários. |
| [Excursões](/excursions) | Organizar um produto/saída compartilhada conforme o módulo. | Dados da excursão, oferta e viajantes vinculados. | Confira datas, capacidade e participantes apresentados pela tela. |
| [Aéreo](/operations/air) | Acompanhar serviços aéreos no contexto operacional. | Serviços aéreos registrados e seus vínculos operacionais. | Confira os dados do serviço e o viajante associado. |
| [Terrestre](/operations/land) | Acompanhar serviços terrestres. | Serviços terrestres e dados de viagem/reserva vinculados. | Confira percurso, datas e responsáveis conforme o registro. |
| [Passageiros](/operations/passengers) | Consultar viajantes e sua participação operacional. | Passageiros associados a reservas/viagens. | Complete vínculos faltantes na origem; uma lista vazia pode significar que ainda não há registros. |
| [Documentos](/operations/documents) | Acompanhar alertas/documentos de viajantes quando cadastrados. | Documentos e regras de alerta relacionadas aos passageiros. | Confira a ficha de origem e as datas; não trate ausência de alerta como confirmação de validade documental. |
| [Ocorrências](/operations/occurrences) | Registrar e acompanhar incidentes operacionais. | Ocorrências abertas pela equipe e estados de acompanhamento. | Registre fatos objetivos e acompanhe a resolução. |
| [Pós-viagem](/operations/post-trip) | Acompanhar tarefas e contatos após a viagem. | Viagens finalizadas e ações pós-viagem elegíveis. | Registre o retorno do cliente e os acompanhamentos realizados. |

**Exemplo fictício:** depois de registrar a venda, confira se existe uma viagem associada. Vincular viagem não substitui criar ou completar reserva, serviços e passageiros quando esses registros forem necessários para a operação.

### Financeiro

| Área e tela | Para que serve / por que usar | De onde vêm os dados | Próxima ação |
|---|---|---|---|
| [Visão financeira](/financial) | Ver resumo financeiro da agência. | Lançamentos e indicadores financeiros configurados para a visão. | Investigue cada indicador na tela detalhada correspondente. |
| [Contas a Receber](/financial/receivables) | Acompanhar compromissos de clientes/devedores e respectivos estados. | Parcelas e recebíveis gerados ou registrados, frequentemente associados a vendas. | Confira vencimento, origem e saldo; registre baixa somente após validação operacional. |
| [Contas a Pagar](/financial/payables) | Acompanhar obrigações da agência, incluindo valores relacionados a fornecedores. | Itens de venda, custos e lançamentos de pagamento registrados. | Confira fornecedor, origem, vencimento e estado antes de registrar pagamento. |
| [Receita da agência](/financial/agency-revenue) | Consultar receita própria conforme regras e eventos de vendas. | Regras de remuneração de fornecedor, itens elegíveis e política de reconhecimento/recebimento configurada. | Leia a regra vigente e diferencie previsto, reconhecido e recebido conforme a tela. |
| [Receitas](/financial/revenues) | Consultar registros de receita dessa área financeira. | Lançamentos incluídos no módulo de receitas. | Confirme se o registro pertence a receita avulsa ou à receita calculada da agência. |
| [Despesas](/financial/expenses) | Registrar e consultar despesas. | Lançamentos de despesa, categoria, centro de custo e pagamentos quando associados. | Classifique o lançamento e confira o vínculo financeiro. |
| [Fluxo de Caixa](/financial/cash-transactions) | Consultar movimentos de caixa registrados. | Movimentações e baixas lançadas no sistema. | Compare os movimentos com a documentação financeira externa da agência. |
| [Conciliação](/financial/reconciliation) | Apoiar a conferência entre movimentos e registros do sistema. | Dados de conciliação e transações carregadas/registradas conforme o fluxo. | Resolva divergências com base em evidência do movimento e do lançamento. |
| [Categorias financeiras](/financial/categories) | Classificar receitas e despesas para consulta e análise. | Cadastros de categorias da agência. | Aplique a categoria correta ao lançar um movimento. |
| [Centros de custo](/financial/cost-centers) | Identificar a área ou unidade gerencial relacionada a um lançamento. | Cadastro de centros de custo e atribuições dos lançamentos. | Use critérios internos consistentes. |
| [Configuração financeira](/financial/settings) | Definir parâmetros e contas usados pelo financeiro, conforme as opções disponíveis. | Configurações da agência e cadastros financeiros. | Revise impactos com responsável financeiro antes de alterar parâmetros. |

**Importante:** um número previsto pode não coincidir com realizado; “vencido”, “atrasado”, “pago” e “recebido” dependem do estado e do critério exibido em cada área. Não conclua que houve movimentação bancária apenas porque o sistema mostra uma baixa.

### Fornecedores e receita da agência

| Área e tela | Para que serve / por que usar | De onde vêm os dados | Próxima ação |
|---|---|---|---|
| [Fornecedores](/suppliers) | Manter os parceiros comerciais e informações usadas nas vendas e custos. | Cadastro de fornecedores e acordos disponíveis. | Confira se a venda aponta para o fornecedor correto e se os termos estão atualizados. |
| [Receita da agência](/financial/agency-revenue) | Acompanhar valores próprios da agência derivados de regras de remuneração. | Vendas/itens elegíveis, acordo ou regra vigente e condição de reconhecimento configurada. | Abra a origem do valor e confirme percentual/base/condição mostrados pela regra. |

**Exemplo fictício:** se uma regra prevê percentual sobre determinado item, o cálculo é regido pela base e condição configuradas. Não estime receita multiplicando o total geral da venda sem confirmar regra, atribuição, elegibilidade e estado de recebimento.

### Equipe e comissões

| Área e tela | Para que serve / por que usar | De onde vêm os dados | Próxima ação |
|---|---|---|---|
| [Funcionários](/employees) e detalhe `/employees/:id` | Manter equipe e consultar o cadastro do funcionário. | Dados de pessoas e vínculos da agência. | Confirme pessoa, função e dados necessários ao trabalho antes de atribuir operações. |
| [Regras de comissão](/commission-rules) | Definir regras de cálculo e vigência conforme as opções existentes. | Configuração da agência, vendas elegíveis e revisões das regras. | Simule/conferira a regra na tela, revise base, faixa e vigência antes de salvá-la. |
| [Liberação de comissão](/commission-release) | Acompanhar valores e condições de liberação. | Comissões calculadas, eventos financeiros e política vigente. | Resolva o motivo de pendência indicado antes de liberar. |
| [Folha de Pagamento](/payroll) | Consultar comissões e registros de folha da equipe. | Funcionário atribuído, vendas, regras de comissão, liberações e pagamentos registrados. | Rastreie venda de origem, critério de cálculo e estado antes de aprovar/pagar. |
| [Condições de pagamento](/payment-conditions) | Consultar ou manter condições usadas nos fluxos de pagamento disponíveis. | Parâmetros cadastrados para a agência. | Selecione a condição adequada ao fluxo e confirme datas e parcelas. |

**Exemplo fictício:** uma comissão pode depender do funcionário a quem a venda foi atribuída, da regra vigente e de uma política de liberação. Vendedor da venda e beneficiário da comissão não devem ser presumidos iguais sem conferir os campos e a regra aplicada.

### Marketing

| Área e tela | Para que serve / por que usar | De onde vêm os dados | Próxima ação |
|---|---|---|---|
| [Biblioteca de mídia](/media-library) | Organizar ativos usados pela equipe. | Arquivos e metadados inseridos na biblioteca. | Confirme direitos de uso e versão do material antes de publicar fora do sistema. |
| [Comunicação](/communications) | Preparar/consultar comunicações da agência. | Registros de comunicação, conteúdo e destinatários selecionados no fluxo. | Revise texto e público; envio depende do que estiver habilitado. |
| [Campanhas](/campaigns) | Organizar ações de marketing. | Cadastro da campanha, canais, público, datas e resultados disponíveis. | Confira segmentação, validade e conteúdo antes de ativar. |
| [Cupons](/coupons) | Gerenciar condições promocionais cadastradas. | Código, validade, elegibilidade e parâmetros do cupom. | Confira as regras aplicáveis antes de oferecer ao cliente. |

### Administração e acessos

| Área e tela | Para que serve / por que usar | De onde vêm os dados | Próxima ação |
|---|---|---|---|
| [Configurações](/settings) | Manter dados e preferências da agência, usuários e acessos conforme abas disponíveis. | Perfil da agência, membros e configuração persistida. | Altere apenas campos sob sua responsabilidade. |
| [Usuários](/settings?tab=invitations) | Convidar/administrar membros conforme permissões. | Convites e vínculos de usuários da agência. | Acompanhe o convite e atribua o papel adequado. |
| [Papéis e acessos](/settings?tab=permissions) | Consultar ou ajustar permissões administrativas disponíveis. | Papel do usuário e configuração de acesso. | Revise acesso mínimo necessário e teste com o perfil correspondente. |
| [Módulos](/settings/modules) | Consultar e administrar módulos habilitáveis da agência. | Configuração e disponibilidade contratual/administrativa. | A tela ausente pode refletir módulo desligado ou falta de permissão. |
| [Categorias de venda](/sale-categories) | Organizar categorias dos itens vendidos. | Cadastros de categoria da agência. | Padronize nomes para facilitar busca e relatórios. |
| [Backup e planilhas](/settings) → aba **Backup** | Agendar cópias diárias, baixar arquivos criptografados, verificar/restaurar cópias e criar CSVs para uso manual. | O backup vem das tabelas incluídas no manifesto operacional Full. CSVs consultam vendas, clientes, recebíveis, pagáveis, despesas e receitas da agência; cliente e venda são relacionados quando há vínculo no conjunto selecionado. | OWNER define horário/fuso, confere histórico e execução concluída. Para planilhas, escolha período, campos e filtros. O destino do download é escolhido pelo navegador. |

#### Como criar uma planilha

1. Em **Configurações → Backup**, escolha Vendas, Clientes, Contas a receber, Contas a pagar, Despesas operacionais ou Receitas da agência.
2. Defina as datas inicial e final e marque somente os campos necessários. Nas vendas e contas financeiras, escolha também os campos de cliente relacionados quando forem relevantes.
3. Selecione situação e demais filtros disponíveis para aquela área; identificadores de cliente, vendedor, fornecedor e categoria devem corresponder a registros da agência.
4. Clique em **Gerar e baixar CSV** e escolha onde guardar o arquivo no diálogo do navegador. O servidor aplica limite de 50.000 linhas e 10 MB; reduza período ou filtros se o limite for excedido.

CSV é uma extração para análise e operação manual. Não é criptografado como arquivo de recuperação, não é armazenado pelo sistema e não substitui o backup.

#### Como agendar e recuperar um backup

- Um OWNER ativo informa horário local e fuso IANA, confirma com a senha atual e salva o agendamento. Para ativá-lo, a operação técnica deve ter configurado a migration 118, o worker persistente, o armazenamento privado e a chave de criptografia versionada.
- “Ativo” representa a configuração da agenda. O funcionamento real só é comprovado por uma execução concluída; verifique data, resultado e histórico. Falhas são registradas sem incluir os dados do arquivo.
- Uma cópia gerenciada usa chave do servidor e fica no storage privado. Baixe o arquivo após uma execução concluída e guarde-o em local autorizado pela agência. A retenção operacional é de 30 dias, mantendo o backup concluído mais recente.
- Para restaurar, escolha uma cópia concluída, informe a senha atual e execute a verificação. Só prossiga se manifesto, integridade, agência/schema e destino vazio forem confirmados. A restauração não sobrescreve dados.
- O fluxo atual exige senha atual e bloqueia contas com MFA ativo; nesses casos, solicite atendimento assistido.
- O manifesto não inclui credenciais, sessões, tokens, MFA, histórico de auditoria completo, infraestrutura nem o conteúdo binário dos arquivos. Faça um ensaio de restauração em banco descartável antes de usar dados reais.

## Fluxos de ponta a ponta

### Do primeiro contato ao pós-viagem

1. Localize ou cadastre o cliente em [Clientes](/customers).
2. Registre o interesse em [Desejos](/wishes) e acompanhe a oportunidade no [Pipeline](/pipeline).
3. Crie uma tarefa de retorno em [Tarefas](/tasks) com responsável e prazo.
4. Prepare uma [Proposta](/proposals) ou use uma [Oferta](/offers); revise antes de apresentar.
5. Quando a venda for confirmada, registre-a em [Vendas](/sales), incluindo itens e condições corretas.
6. Confira se a [Reserva](/bookings) e a [Viagem](/trips) necessárias existem e estão vinculadas.
7. Complete os registros pertinentes em [Passageiros](/operations/passengers), [Aéreo](/operations/air), [Terrestre](/operations/land) e [Documentos](/operations/documents).
8. Acompanhe alterações em [Ocorrências](/operations/occurrences) e finalize o relacionamento em [Pós-viagem](/operations/post-trip).

### Da venda à conferência financeira

1. Abra a venda e confirme cliente, itens, fornecedor, categoria, vendedor, totais e vencimentos.
2. Consulte [Contas a Receber](/financial/receivables) para compromissos do cliente e [Contas a Pagar](/financial/payables) para obrigações correspondentes.
3. Registre baixas somente conforme o procedimento da agência e evidência de pagamento/recebimento.
4. Compare os lançamentos em [Fluxo de Caixa](/financial/cash-transactions) e faça a conferência em [Conciliação](/financial/reconciliation), quando aplicável.
5. Analise [Receita da agência](/financial/agency-revenue) separadamente do valor bruto vendido.
6. Consulte [DRE](/financial/dre), [relatórios](/financial/reports) e [projeções](/financial/projections) com o período e critérios apropriados.

### Da venda à comissão e folha

1. Confirme o funcionário beneficiário e os dados de atribuição na venda.
2. Abra [Regras de comissão](/commission-rules) e confira a regra vigente e sua base.
3. Consulte [Liberação de comissão](/commission-release) para o estado e o motivo de qualquer pendência.
4. Em [Folha](/payroll), rastreie cada valor até venda, funcionário e cálculo antes de aprovar ou registrar pagamento.

## Perguntas frequentes e resolução inicial

**Não vejo uma área no menu.** Confirme papel do usuário, permissão e módulo habilitado. Alguns papéis operacionais têm uma navegação mais restrita.

**Uma lista está vazia.** Verifique período/filtros, vínculos necessários e se existem registros na etapa anterior. Lista vazia, por si só, não prova falha do módulo.

**O painel difere de uma lista.** Compare período, estado, filtros e critério de cada indicador. Abra os registros de origem; não trate rótulos semelhantes como sinônimos contábeis.

**Não encontro a receita da agência.** Use [Receita da agência](/financial/agency-revenue). A tela de [Receitas](/financial/revenues) é uma área separada; confira a descrição atual do menu.

**Registrei uma baixa. Isso pagou o fornecedor ou recebeu do cliente?** Não. A baixa registra uma informação no sistema; confirme a movimentação no canal financeiro da agência.

**A importação terminou?** Confira o resumo final, avisos e registros criados no fluxo de importação. Um arquivo carregado ou mapeado não equivale a importação concluída.

**Vejo um código ou nome técnico.** Abra o registro relacionado para confirmar a identidade; códigos internos são identificadores, não descrição comercial.

## Limites e manutenção desta ajuda

- A disponibilidade de uma tela depende do papel, das permissões e dos módulos configurados para a agência.
- Os exemplos não são dados reais nem recomendação contábil, fiscal, jurídica ou de viagem.
- Fórmulas, estados e critérios de reconhecimento devem seguir as regras exibidas na aplicação e as decisões de produto vigentes.
- O conteúdo não afirma integração bancária, emissão automática, reserva externa ou envio de comunicação sem confirmação na tela correspondente.
- Prints devem ser produzidos em ambiente autorizado, com dados fictícios, ocultando informações pessoais e identificadores sensíveis. Preferir capturas atualizadas à publicação de screenshots desatualizados.
- Vídeos podem ser roteirizados por fluxo: objetivo do usuário, pré-requisitos, dados fictícios de demonstração, passos na tela, origem/efeito do dado e ressalvas do fluxo. Cada roteiro deve ser validado contra a versão que será publicada.

### Validações pendentes registradas na avaliação UX local

O relatório `.claude/RELATORIO-UX-FLUXO-CLIENTE-LOCAL.md` (27/10/2026) registra problemas observados no ambiente local que esta documentação não corrige: filtros de vendas e contas financeiras aparentemente não restringiram as listas; o segmento de demonstração falhou por critério `customer.notes`; “Receita da agência” não era encontrável pelo menu; e o painel apresentou identificadores técnicos e indicadores que pareciam inconsistentes. A avaliação não confirmou se o servidor local usava a versão mais recente. Reproduza e confirme cada item contra o código/ambiente candidato à publicação antes de gravar tutorial ou afirmar que o comportamento foi corrigido.

Na revisão documental/código atual desta ajuda, o acesso a `/financial/agency-revenue` existe na rota e na página de Ajuda, mas continua ausente do `Sidebar`. A tela ainda exibe enums técnicos como `PERCENTAGE`, `LINE_TOTAL`, `ON_FULL_SETTLEMENT` e `AGENCY_COLLECTS`, conforme o teste existente de renderização. O alerta de recebíveis em `DashboardPage.tsx` ainda constrói o plural “recebívelis” e aponta para `/financial/payables`. Esses são defeitos visíveis no código revisado e devem ser corrigidos antes de transformar essas telas em tutorial. As diferenças entre valores do painel registradas no relatório ainda não foram reproduzidas nesta rodada.

Os testes de interface atuais comprovam que filtros de Vendas, Contas a Receber e Contas a Pagar enviam parâmetros para a API. A inspeção também encontrou predicados de filtros nas rotas/consultas atuais. Isso não prova que a API retorna a lista restrita no banco do cenário. Para `customer.notes`, o código atual inclui o campo na lista permitida e o teste unitário de compilação de filtros passou; o resultado do segmento salvo do cenário continua sem validação no banco.

A avaliação também não percorreu todas as telas nem testou a conclusão de ações de gravação ou o vínculo de viagem iniciado por uma venda. Nesta rodada, o servidor local anterior não estava ativo em `127.0.0.1:5184`, portanto não foi possível repetir a navegação autenticada nem reproduzir as quantidades/diferenças do banco de demonstração. Este guia descreve a finalidade e as relações esperadas entre áreas; ele não certifica que cada fluxo foi exercitado ponta a ponta ou que cada perfil tem acesso a cada rota.

## Referência de implementação

- Ajuda dentro do Full: rota autenticada `/ajuda`, busca textual, roteiro de começo e links para as telas correspondentes.
- Fonte dos menus e rotas: `apps/agency/src/components/layout/Sidebar.tsx` e `apps/agency/src/App.tsx`.
- Ajuda Travel Lite: `docs/travel-lite/product-experience/HELP-CENTER.md`; não usar como evidência de cobertura do Full.
- Diretriz Full primeiro/Lite subconjunto: `docs/decisions/DEC-007-full-first-lite-parity.md`.
