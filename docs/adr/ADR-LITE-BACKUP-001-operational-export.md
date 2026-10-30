# ADR Lite Backup 001 - Exportacao operacional por agencia

Data: 2026-10-22. Status: aceito para o escopo autorizado de backup manual.

Usuario autorizou backup, exclusao/restauracao do demo e publicacao apos teste.
Area em Configuracoes; exportacao apenas pelo perfil de acesso total da agencia,
com reautenticacao, isolamento pelo tenant da sessao e auditoria obrigatoria.
Formato versionado JSON cifrado AES-256-GCM com chave derivada por scrypt de
senha especifica do arquivo; sem dependencia ou segredo global novo.

A copia contem 28 tabelas operacionais (corrigido de 25; ver `BACKUP_TABLES`), nao identidades/senhas/sessoes nem
schema, politicas ou infraestrutura. E recuperacao operacional na mesma agencia,
nao substitui backup integral de desastre. Historico registra geracao no servidor,
nao comprova que o usuario guardou o download. Limite atual 2 MiB de dados JSON;
copias maiores exigem operacao assistida. Nenhuma restauracao publica implementada.

Backup diario permanece nao configurado: nao ha scheduler independente nem
armazenamento externo integrado. Nao usar timer de browser, filesystem efemero
Vercel ou o computador do fornecedor como rotina diaria de producao.
