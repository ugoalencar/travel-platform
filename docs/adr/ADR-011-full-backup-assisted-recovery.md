# ADR-011 — Recuperação assistida do backup Full

Status: aceito para implementação local, conforme instrução explícita do usuário em 2026-10-25 (D11). Banco ainda não validado nesta rodada.

Complementa ADR-010: o inventário pendente é encerrado e a interface em Configurações passa a permitir exportação, verificação e restauração assistida. O manifesto é `CLASSIFIED`: todas as tabelas estão incluídas ou excluídas com motivo; isso não significa backup de credenciais, infraestrutura ou arquivos binários.

A restauração exige OWNER exato ativo, senha atual, senha do arquivo, relatório de verificação correspondente ao destino, mesma agência, mesmo fingerprint de schema e todas as tabelas do manifesto vazias. Não há limpeza automática, remapeamento de agência ou sobrescrita. O operador provisiona a agência, identidades e referências externas excluídas antes do ensaio. Usuários com MFA inscrito continuam bloqueados pelo step-up atual. A senha do arquivo não é persistida pelo servidor.

O servidor valida o manifesto completo, hashes e `agency_id` de cada registro antes da escrita. Restaura em uma transação e confere hashes e contagens antes do commit; FKs e RLS permanecem ativas. As dependências são lidas do catálogo PostgreSQL; referências financeiras cíclicas são inseridas em uma única instrução com CTEs, permitindo a checagem de FKs ao fim da instrução sem desativá-las. Colunas geradas são recalculadas e identidades históricas preservadas com `OVERRIDING SYSTEM VALUE`.

A migration 115 adiciona uma função sem parâmetros, com `search_path` fixo e EXECUTE revogado de PUBLIC. Ela verifica OWNER ativo no contexto e apenas avança a sequência de atribuições até o máximo persistido; não recebe nome de tabela, sequência ou valor do cliente e não retorna dados de outras agências. O bloqueio da tabela serializa essa manutenção com novas inserções. Não adiciona tabelas nem altera registros históricos. Os grants de SELECT/INSERT permitem o round trip mantendo os demais privilégios e as políticas existentes.

Verificar e restaurar geram auditoria obrigatória. A restauração retorna erro se houver concorrência que cause divergência; a transação é revertida. O limitador de três tentativas por quinze minutos permanece por processo; ambiente com múltiplas instâncias exige armazenamento compartilhado antes da operação online.

## Recuperação de cópias automáticas — 2026-10-28

O usuário aprovou o fluxo Full com cópia criptografada em armazenamento gerenciado e download manual. A recuperação de um backup gerenciado usa o mesmo OWNER ativo, step-up, validação de manifesto/agência/schema e destino vazio definidos acima. A chave de cifra é do servidor e versionada; a senha do arquivo continua exclusiva da exportação manual.

O worker persistente, a migration 118, o bucket privado, a configuração da chave e a supervisão do processo são pré-requisitos de ativação. Não houve aplicação da migration nem configuração de ambiente online nesta entrega local. A operação deve executar um backup de prova, baixar e verificar o arquivo e ensaiar a restauração em banco descartável antes de receber dados reais.
