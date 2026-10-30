# Runbook: backup gerenciado do Travel Platform Full

Este runbook descreve a operação técnica das cópias diárias da agência. A implementação de código não configura bucket, chave, banco, worker ou produção. A migration 118 precisa ser revisada e aplicada por processo autorizado antes de habilitar a agenda.

## Componentes

- `tenant_backup_schedules` e `tenant_backup_runs`: configuração e metadados por agência com RLS forçada.
- Worker persistente `npm run start:backup-worker --workspace=@travel-platform/api`: consulta candidatos vencidos, valida OWNER ativo e processa cada agência por transação tenant explícita.
- Storage privado via adaptador de arquivos existente (`STORAGE_PROVIDER=supabase`); namespace reservado `internal/managed-backups/`.
- Envelope AES-256-GCM com AAD contendo formato, agência e versão da chave. O navegador só recebe o arquivo já cifrado.
- API de Settings: OWNER configura agenda, acompanha histórico, baixa, verifica e restaura a cópia. CSV financeiro é um fluxo separado e manual.

## Pré-requisitos de ativação

1. Revisar a migration 118 e aplicá-la somente no ambiente autorizado, após validar grants, função de candidatos, RLS e backup do banco.
2. Criar/configurar o bucket privado `internal` conforme o contrato do adaptador Supabase Storage existente. Não habilitar acesso público nem emitir URL pública.
3. Provisionar pelo secret manager um keyring com chave aleatória de 32 bytes codificada em Base64 e um identificador de versão. Exemplo de formato (valor fictício):

   ```text
   TENANT_BACKUP_KEYRING_JSON={"v1":"<base64-de-32-bytes>"}
   TENANT_BACKUP_CURRENT_KEY_VERSION=v1
   ```

4. Definir `STORAGE_PROVIDER=supabase`, `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` usando o cofre do ambiente. A service role deve existir somente no servidor/worker.
5. Fornecer `DATABASE_URL` para o papel runtime e `PLATFORM_DATABASE_URL` para o papel de plataforma conforme F-06 e as regras de startup. O runtime e o papel de plataforma não podem ser superuser nem `BYPASSRLS` na aplicação; validar privilégios no ambiente.
6. Fazer build e iniciar `start:backup-worker` em serviço dedicado supervisionado por gerenciador de processos. Configurar reinício em saída não zero, encerramento SIGTERM e alerta de indisponibilidade. Executar API e worker com a mesma versão de migration, bucket e keyring.
7. Configurar alerta operacional para execução FAILED, ausência de execução SUCCEEDED dentro do período esperado e worker parado. A tela não consulta health do processo; “agenda ativa” é configuração persistida, não prova de worker saudável.

Não grave esses valores em Git, log, imagem de container, banco de aplicação ou documentação real. O keyring aceita até oito versões para permitir rotação. Mantenha as versões antigas disponíveis enquanto houver arquivos cifrados que dependam delas; retire uma chave somente depois de expirar/exportar e verificar todos os arquivos correspondentes.

## Execução, concorrência e falhas

- O processo consulta tarefas a cada 30 segundos. Mais de uma instância pode concorrer: o worker reivindica agência/data local com lock `FOR UPDATE SKIP LOCKED` e restrição única `(agency_id, scheduled_local_date)`.
- A função de plataforma devolve apenas agência, OWNER ativo e metadados da agenda. O worker revalida OWNER ativo dentro do tenant e usa RLS para leitura/escrita dos registros.
- A cópia contém snapshot das tabelas incluídas no manifesto `CLASSIFIED`, cifrado antes do envio ao storage. O histórico (`tenant_backup_runs`) e a agenda (`tenant_backup_schedules`) são metadados operacionais excluídos; após recuperação da agência, reveja e reconfigure a agenda. No banco ficam apenas objeto, versão, hash, contagem, tamanho, estado e datas.
- Uma execução só fica SUCCEEDED depois de gravar o objeto e atualizar o histórico/auditoria. Erros recebem código genérico; conteúdo, SQL e segredos não devem entrar em logs.
- Há até cinco tentativas por data, com intervalo de 15 minutos. Depois do limite, a agenda avança para o próximo horário diário e o histórico mantém a falha.
- A retenção é de 30 dias e preserva a execução concluída mais recente. Exclusões do storage acontecem depois do commit que remove o registro; falha de limpeza pode deixar objeto privado órfão para tratamento operacional.

## Validação antes de dados reais

1. Verifique `GET /health` e `GET /ready` da API e os logs de inicialização do worker, sem expor variáveis secretas.
2. Confirme no OWNER da agência que storage e criptografia estão configurados; habilite um horário próximo em fuso conhecido.
3. Aguarde uma execução real e confirme status SUCCEEDED, data local, quantidade e tamanho no histórico. A presença de configuração não é evidência suficiente.
4. Baixe a cópia cifrada e guarde-a em destino autorizado fora do serviço.
5. Verifique e restaure essa cópia em banco descartável da mesma versão de schema e mesma agência vazia. Confira contagens e hashes antes de declarar o ensaio aprovado.
6. Registre operador, identificador do run, versão de chave, intervalo de schema e resultado do ensaio no registro operacional aprovado.

Não ensaie restauração sobre dados reais. A restauração do produto recusa agência diferente, schema incompatível e tabelas de destino preenchidas; não apaga nem sobrescreve dados.

## Planilhas CSV

O configurador exporta vendas, clientes, contas a receber, contas a pagar, despesas operacionais e receitas da agência. A API aceita apenas colunas/filtros do catálogo e escopo do tenant autenticado; usa limites de 50 mil linhas e 10 MiB, neutraliza fórmulas e audita dataset/colunas/filtros/contagem sem dados pessoais. CSV não é backup de recuperação e é baixado por ação explícita no navegador.

## Estado desta implementação

O código foi alterado localmente e a migration 118 foi criada, mas não aplicada. Nenhum bucket, keyring, worker supervisionado, ambiente online ou backup da Gadotti foi configurado nesta tarefa. A ativação depende dos passos acima e de autorização operacional para o ambiente alvo.
