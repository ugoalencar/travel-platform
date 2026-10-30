# Backup operacional por agencia

Publicado em 23/10/2026 em Configuracoes > Backup.

Disponivel ao administrador de acesso total da agencia. A API verifica
permissao e contexto do servidor, exige reautenticacao e cifra a copia antes
de envia-la ao navegador. Nunca informar senha do arquivo a outros funcionarios.
Escolher senha exclusiva de pelo menos 12 caracteres e guarda-la em cofre
seguro separado do arquivo. Sem a senha do arquivo nao ha recuperacao.

O arquivo .tlbackup usa AES-256-GCM + scrypt e inclui 28 tabelas operacionais (a lista atual está em `BACKUP_TABLES`, `services/api-lite/src/tenant-backup.ts`),
IDs e relacionamentos. Nao inclui usuarios/senhas/sessoes, tokens, schema,
politicas RLS, arquivos do provedor nem configuracao de infraestrutura.
Restaura a operacao da mesma agencia preservando identidades existentes;
nao e copia completa para reconstruir um projeto perdido.

Historico mostra geracao, nao armazenamento remoto ou confirmacao de que o
download foi guardado. Nao ha botao de restauracao automatica no cliente.
Restaurações sao assistidas, com aprovacao do responsavel, copia previa,
verificacao de destino, conflitos de dados recentes e comparacao de conteudo.
O ensaio do demo apagou/restaurou em uma transacao atomica; nao simulou
perda total do projeto ou indisponibilidade do provedor.

Backup diario continua nao configurado. Agendamento independente, destino
externo, retencao, alertas e restauracao de desastre precisam ser implantados
e validados separadamente. Nao depender do browser ou disco efemero Vercel.

Rotas: GET /backup/status e POST /backup/export, tambem sob /api.
Pedido export: currentPassword e archivePassword; nenhum tenantId aceito.
Resposta cifrada limitada a copia operacional de ate 2 MiB de JSON de origem.
Senhas nao sao armazenadas no historico e os campos sao limpos apos tentativa.
