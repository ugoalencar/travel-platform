# Full: backup diário gerenciado e exportação configurável

## Objetivo

Preparar o Travel Platform Full para a Gadotti operar seus dados reais com duas saídas independentes: arquivos criptografados para recuperação da agência e planilhas configuráveis para consulta/uso manual fora do sistema. O usuário confirmou que não haverá release Lite e pediu continuidade somente no Full.

## Decisões aprovadas

- Executar toda a entrega apenas no Full (`apps/agency` e `services/api`).
- Usar armazenamento privado gerenciado para cópias automáticas; permitir download manual pela área de Backup.
- Gerar planilhas CSV compatíveis com Excel, selecionáveis por conjunto de dados, campos, período e filtros permitidos.
- Adotar retenção padrão de 30 dias para as cópias diárias.
- Não acessar produção/staging, não fazer deploy, não aplicar migrations a nenhum banco e não commitar sem autorização.

## Abordagens consideradas

1. Timer dentro da API web: descartado porque instâncias podem reiniciar, escalar ou ser efêmeras; a execução não teria garantia diária.
2. Agendamento externo específico de um provedor: não escolhido porque o checkout não contém uma integração de scheduler operacional configurada.
3. Worker persistente separado com agenda e histórico no PostgreSQL: escolhido. Ele verifica trabalhos vencidos, reivindica cada execução com locking transacional compartilhado e processa cada agência em contexto tenant explícito. A disponibilidade do worker, do armazenamento privado e da chave de cifra é condição para habilitar a agenda.

## Backup gerenciado

- Um OWNER habilita/desabilita o backup diário, define horário e fuso IANA, consulta execuções/situação e baixa um arquivo selecionado.
- O worker cria o snapshot a partir do manifesto de backup Full classificado, cifra em AES-256-GCM com chave mestra gerenciada no servidor e AAD vinculada à agência, e grava em bucket privado. O navegador nunca recebe chave de storage nem chave de cifra.
- A chave de cifra é configurada fora do banco e possui identificador de versão no envelope; ausência de chave ou storage deixa o recurso indisponível e não declara a agenda ativa.
- O banco guarda apenas configuração da agenda, estado/metadata da execução, chave do objeto e contagens/hash; falha de storage deixa execução como falha, não como sucesso.
- A retenção elimina cópias com mais de 30 dias pelo worker e respeita o escopo da agência. Não remove o registro da execução mais recente nem remove objeto sem confirmar a autorização interna.
- O estado inclui configuração, próxima execução, última tentativa, último sucesso, resultado/erro sanitizado e quantidade de cópias disponíveis.
- A recuperação de uma cópia gerenciada segue o fluxo de verificação/restauração existente: OWNER, reautenticação, mesma agência e destino vazio. Nunca sobrescreve nem limpa registros automaticamente. Identidades, credenciais, auditoria histórica, arquivos binários e configuração de infraestrutura continuam fora do manifesto; a interface declara esses limites.
- Exportações atuais por senha permanecem disponíveis e separadas das cópias gerenciadas.

## Planilhas configuráveis

- A área Backup apresenta um configurador de exportação com conjuntos iniciais: vendas, clientes, contas a receber, contas a pagar, despesas operacionais e receitas da agência.
- Cada conjunto declara no servidor sua allowlist de colunas/filtros e as relações disponíveis. Vendas e obrigações financeiras podem incluir identificadores/nome do cliente quando houver relação.
- O usuário escolhe período, colunas e filtros aceitos pelo conjunto. O servidor valida datas, enumerações, limites e autorização; monta parâmetros SQL sem aceitar nomes de tabela/coluna livres; sempre limita a consulta ao tenant autenticado.
- O CSV usa o serializador seguro existente (BOM, neutralização de fórmulas, limite de linhas/tamanho), é entregue como download e não é guardado no storage. O frontend pode abrir o diálogo de salvar do navegador; não grava em pastas locais sem interação.
- Exportações geram evento de auditoria com dataset, filtros não sensíveis, contagem e timestamp; não gravam valores pessoais ou financeiros em logs.
- CSV é saída manual e não é arquivo de recuperação.

## Componentes e interfaces

- Backend Full: serviço de agenda/execução e criptografia com chave do servidor; tabelas de configuração e execuções com RLS; runner separado e comandos npm documentados; rotas OWNER para status, agenda, lista/download e recuperação de cópia gerenciada.
- Frontend Full: aba Backup com agenda diária, estado/histórico/download/recuperação, e configurador CSV por conjunto de dados.
- Relatórios: um catálogo explícito de datasets/colunas/filtros e um executor tenant-scoped; reutilizar `services/api/src/report-csv.ts` em vez de duplicar codificação CSV.
- Documentação: revisar ADR-010/011, manual de backup, ajuda Full e instruções operacionais do worker/storage/chaves.

## Segurança e falhas

- Contexto de agência para execução de worker é sempre argumento explícito e validado; não depende de `AsyncLocalStorage` herdado de request.
- Jobs são reivindicados com exclusão mútua no PostgreSQL e idempotência por agência/data local, evitando duplicação em múltiplas instâncias.
- RLS, autorização OWNER, `no-store`, rate limiting/step-up aplicáveis, criptografia autenticada, segregação por agência, limites de payload/linhas e auditoria obrigatória permanecem ativos.
- Erros de execução são sanitizados; não registram conteúdo de backup, segredo, SQL ou dados dos clientes.
- Se o worker ou storage não estiverem configurados, nenhuma interface apresenta backup automático como ativo.

## Validação e limites de entrega

- Testes unitários/API para agenda, chave/envelope, filtros/allowlists, CSV, permissões, tenant isolation, falhas de storage, idempotência, retenção e recuperação.
- Testes de integração/RLS ficam escritos para banco descartável, mas nenhuma migration é aplicada pelo agente sem autorização específica.
- Typecheck, lint, testes focados e build das áreas alteradas são gates locais. Não constituem evidência de configuração/deploy/backup online.
- A entrega de código não ativa o worker nem cria bucket/chaves no ambiente Gadotti. Isso requer configuração e smoke autenticado no ambiente de release antes de receber dados reais.
