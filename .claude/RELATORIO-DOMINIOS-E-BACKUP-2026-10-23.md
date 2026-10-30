# Travel Lite - dominios e backup operacional

Concluido em 23/10/2026, America/Sao_Paulo.
Autorizacao: usuario autorizou backup/exclusao/restauracao exclusivamente do demo,
publicacao apos teste e conclusao dos novos enderecos, preservando credenciais.

## Enderecos publicados

- Demo: https://travellite.travelplataforma.com.br
- Cliente: https://gadotti.travelplataforma.com.br
- Ambos vinculados ao projeto existente travel-lite-gadotti e deployment
  dpl_Fk9opa9cg5Tiv4PCBfRPVbkrFZSh, estado READY confirmado.
- Artefato: travel-lite-gadotti-m7yskyma8-ugoalencars-projects.vercel.app,
  target preview, bundle index-brDXaDXD.js.
- Aliases publicos autorizados; URL gerada Vercel permanece protegida (302).
  Nao foi desabilitada protecao global; ssoProtection permanece
  all_except_custom_domains. Aplicacao exige sua propria autenticacao.
- Registro CNAME publico dos dois dominios ja apontava para Vercel; havia cache
  local do Render. Nao editei a zona DNS. Conclui aliases e certificado do demo.
- HTTP redireciona para HTTPS em ambos (308); paginas HTTPS retornam 200.
- No Chrome: agencia fixa demo no primeiro dominio e gadotti no segundo;
  nenhuma excecao JavaScript. Corrigido travellite -> demo em branding.ts.
- Mesmo banco Supabase bseoafxmqgcxjdpzvwzn. Nenhum usuario existente recriado
  ou senha real alterada. Digest dos registros completos dos usuarios Gadotti,
  incluindo hashes de senha, permaneceu identico ao anterior; somente booleano
  de comparacao foi retornado, sem leitura/exposicao de credenciais.
- CORS permite os dois origins HTTPS exatos. APP_URL do deployment foi ajustada
  para o dominio Gadotti; envio/recuperacao de senha por e-mail em todos os
  dominios nao foi certificado nesta etapa, conforme pendencia operacional.
- Nenhum plano contratado, commit/push ou mudanca em main/Full/Render.

## Teste autorizado de exclusao e restauracao

Tenant demo: 7c443fee-c487-4480-81a6-1eb8ea54060b.
Tenant Gadotti: 8ae74276-f597-424b-97e7-e53e370230ed (nao modificado).

1. Snapshot consistente de 25 tabelas operacionais do demo, sem usuarios,
   hashes de senha, sessoes ou tokens de recuperacao.
2. Copia externa ao banco criptografada por Windows DPAPI:
   C:/Users/Ugo Alencar/Documents/Travel-Gadotti/backups/demo-operations-2026-10-22.dpapi.
3. Leitura/decriptografia comparada byte a byte com o snapshot antes da exclusao.
   Arquivo: 49.350 bytes; SHA-256 do conteudo original:
   d9557b09cde0cb342892e659a9cc205e0f53a72ab6500a0eac7fafa6182e54b4.
4. Exclusao efetiva apenas das linhas do demo, na ordem das dependencias;
   comprovadas zero linhas desse tenant nas 25 tabelas.
5. Restauracao preservando IDs e relacionamentos, sem desabilitar RLS/FKs,
   seguida de comparacao integral dos registros com o snapshot.
6. Comparacao do digest de 29 tabelas da Gadotti antes/depois: sem alteracoes.
7. Exclusao/restauracao foram realizadas dentro de UMA transacao atomica,
   com timeout e rollback automatico se qualquer verificacao falhasse.
   Nao foi um teste de queda do provedor nem de perda total do projeto.
8. Contagem posterior: demo 2 usuarios, 6 clientes e 9 vendas; Gadotti
   5 usuarios e 57 vendas. Identidades e senhas preservadas.

## Area Configuracoes > Backup publicada

- Exportacao manual real, restrita ao perfil de acesso total da agencia.
- Exige senha atual e senha separada do arquivo (minimo 12 caracteres).
- Rejeita escolha de tenant no pedido; usa apenas contexto autenticado e RLS.
- Snapshot das 25 tabelas em uma unica instrucao SQL/MVCC.
- JSON versionado cifrado AES-256-GCM, chave derivada por scrypt e AAD com tenant.
- Arquivo .tlbackup entregue por download; senha do arquivo nao e armazenada.
- Historico de geracao por agencia via BACKUP_EXPORTED; evento obrigatorio:
  falha de auditoria impede exportacao. Historico nao comprova guarda do download.
- Limite atual 2 MiB de dados JSON; copias maiores requerem operacao assistida.
- Sem endpoint publico para restaurar/sobrescrever dados.
- **Backup diario automatico NAO configurado**. A interface informa esse estado.
  Permanecem pendentes scheduler independente, armazenamento externo,
  retencao e alertas; o download manual nao substitui backup integral de desastre.

## Validacao

- API Lite completa: 237/237 testes, 29 arquivos, exit 0.
- Frontend Lite completo: 137/137 testes, 14 arquivos, exit 0.
- Typecheck e build Lite: exit 0. Lint: exit 0, quatro avisos Fast Refresh.
- Build frontend mantem aviso de bundle maior que 500 kB.
- Chrome local/fixture: download cifrado decriptado/conferido; sem erro JS e
  sem overflow de pagina em desktop/mobile 390px.
- Chrome online nos dois dominios: HTTPS, formulario e tenant correto.
- Conta MASTER sintetica criada exclusivamente no demo para o smoke online;
  login, area Backup, geracao/download, decriptografia de 25 tabelas,
  9 vendas e 6 clientes, e logout passaram. Conta/sessoes temporarias removidas;
  consulta final confirmou zero contas temporarias. Logs de auditoria preservados.
- API health online 200. Sem sessao, /api/sales, /api/users e
  /api/backup/status bloqueados com 401 nos caminhos exercitados.
- Preflight de ambos os dominios: 204 com origin especifico, nao wildcard.
- Gadotti nao foi acessada com credencial real; primeiro acesso da Patricia
  permanece reservado a ela. Aceite funcional da cliente ainda pendente.

## Evidencias locais sem senhas

- .tmp/backup-desktop.png, .tmp/backup-mobile.png
- .tmp/domain-demo-20261023.png, .tmp/domain-gadotti-20261023.png
- .tmp/backup-online-20261023.png
- .tmp/lite-release-domains-20261023 (artefato publicado)
- ADR: docs/adr/ADR-LITE-BACKUP-001-operational-export.md

Conta Vercel permanece Hobby. A publicacao tecnica dos dominios nao elimina
a necessidade de adequar o plano ao uso empresarial, nem resolve folha Lite,
aprovacoes, retroatividade, auditoria antes/depois ou as demais pendencias do
parecer de entrega. Nao declarar o projeto inteiro concluido por este deploy.
