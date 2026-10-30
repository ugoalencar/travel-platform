# Travel Lite / Gadotti - parecer interno de entrega

Data: 22/10/2026. Destinatario: responsavel pelo Travel Lite.
Documento interno; nao enviar junto com credenciais.

Atualizacao de 23/10/2026: dominios demo/cliente publicados e validados no
Chrome; area de backup manual publicada e testada. Ver relatorio
.claude/RELATORIO-DOMINIOS-E-BACKUP-2026-10-23.md. Backup diario e demais
pendencias operacionais continuam em aberto.

## Decisao

**Nao declarar entrega completa nem liberacao para operacao diaria.**
Preparar apresentacao supervisionada em demo, condicionada a validar seu login.
Liberar piloto operacional somente depois dos bloqueios desta lista e do aceite
explicito do escopo reduzido. Nao usar a conta da Patricia para ensaiar.

## Base da analise e limites

- Leitura atual do codigo, politicas de acesso, checklist e runbook locais.
- Relatorio .claude/RELATORIO-PUBLICACAO-LITE-2026-10-22.md e resumo
  .tmp/lite-release-online-smoke-result.json.
- O relatorio mais recente registra 232 testes API, 132 frontend, gates verdes,
  teste do adaptador e verificacoes online com usuarios sinteticos removidos.
  Sao evidencias da publicacao anterior; nao foram reexecutadas nesta analise.
- Backup criptografado de pre-release encontrado no disco; restauracao anterior
  consta no relatorio. Nao foi aberto, descriptografado ou restaurado agora.
- Nenhuma credencial lida, login real, alteracao online, deploy ou novo teste de
  carga/seguranca executado nesta etapa. Configuracoes remotas nao revalidadas.
- O NO-GO tecnico anterior nao deve ser usado como fotografia atual: o relatorio
  posterior registra as correcoes. Os bloqueios abaixo sao de entrega e escopo.

## Bloqueios antes da operacao do cliente

| ID | Prioridade | Pendencia e evidencia | Criterio de conclusao | Responsavel proposto |
| --- | --- | --- | --- | --- |
| E01 | Aceite pendente | Parte tecnica resolvida em 23/10: dominios publicos HTTPS e agencias corretas; nenhum login real usado | Patricia confirma primeiro acesso no dominio Gadotti; nao precisa de conta Vercel do fornecedor | Fornecedor + Patricia |
| E02 | Bloqueante | Relatorio registra plano Hobby; documentacao oficial restringe uso pessoal nao comercial | Aprovar plano/hospedagem compativel com uso empresarial; nao tratar piloto gratuito como excecao automatica | Fornecedor |
| E03 | Alta | Auditoria de edicao de venda nao guarda diferencas de campos | Registrar autor, data, venda, campo, antes/depois e motivo conforme regra aprovada; testar recuperacao do historico e falha na gravacao | Desenvolvimento |
| E04 | Alta | Evidencia de backup pontual, nao de rotina automatizada com alertas | Definir agenda, retencao, responsavel, armazenamento separado e recuperacao testada; aprovar perda maxima de dados e prazo de retorno | Operacao |
| E05 | Alta | Recuperacao por e-mail existe no codigo, mas envio online nao consta no smoke | Testar em usuario sintetico/correio autorizado: entrega, URL correta, expiracao, uso unico e retorno ao login; nunca usar Patricia como teste | Operacao |
| E06 | Alta | Permissoes reais precisam de aceite da responsavel | Patricia = MASTER; validar vendedores vinculados, carteiras e limitacao a vendas/clientes; testar negacoes sem credenciais reais | Fornecedor + Patricia |
| E07 | Alta | Suporte, periodo, custos e tratamento de dados nao formalizados nesta entrega | Preencher e aprovar minuta 03; escolher contatos e canal de incidentes; nao prometer SLA nao contratado | Fornecedor + cliente |
| E08 | Alta | Dados iniciais e saldos requerem reconciliacao de negocio | Cliente confirma carteira, vendedores, vendas importadas, contas, recebimentos e comissoes de abertura com relatorio de conferencia | Patricia |
| E09 | Alta | Escopo solicitado maior que o publicado | Aprovar explicitamente piloto parcial ou concluir requisitos pendentes antes do aceite; decisao de perfil financeiro global registrada | Produto + Patricia |

E03: services/api-lite/src/routes/sales.ts:682-685 grava SALE_UPDATED com apenas
sale_number nos metadados. O autor e vinculado em audit-log.ts:114, mas isso nao
reconstroi o que mudou. SALE_UPDATED nao esta em REQUIRED_AUDIT_EVENTS
(audit-log.ts:65); falhas de gravacao desses eventos sao tratadas sem abortar
a operacao. Logs basicos nao equivalem a auditoria completa exigida pelo usuario.
Confirmar tambem a forma de consulta/exportacao restrita ao administrador.

E04: copia DPAPI depende do contexto Windows que a criptografou. Testar plano
de recuperacao se essa maquina/conta estiver indisponivel. Nao copiar a chave
de banco nem colocar backups no repositorio para resolver isso.

E08: o relatorio registra 57 vendas, mas quantidade/total nao certificam que
clientes, recebimentos, saldo inicial e comissoes representam a realidade.
Venda confirmada nao significa recebimento conciliado. Conferir importacoes
e registros provisorios com o cliente antes de uso financeiro efetivo.

## Escopo que nao pode ser apresentado como entregue

- Folha salarial/fechamento gerencial no Lite.
- Fila de aprovacao para cancelamento e alteracao de venda/produto.
- Revisao retroativa com previa, senha de confirmacao e ajustes.
- Bonus/teto de comissao e recuperacao de valores ja pagos.
- Prefixo e numero inicial configuraveis: aguardam definicao do cliente e
  implementacao/validacao; nao prometer configuracao automatica existente.
- Perfil financeiro global: especificacao registra descarte, mas ainda pede
  confirmacao do usuario. Resolver antes de aprovar a regra financeira.
- Cobranca recorrente do SaaS e emissao fiscal: fora da evidencia desta entrega;
  nao afirmar integracao Asaas ou emissao habilitada sem validacao especifica.

## Preparacao tecnica complementar

- Rate limit local usa Map em memoria (rate-limit.ts:22; app.ts:110).
  Nao garante contador compartilhado entre instancias serverless. Avaliar
  protecao persistente/compartilhada antes de exposicao publica do login.
- Definir monitoramento externo de saude, alertas de erro e limites de consumo;
  nao ha evidencia suficiente aqui de monitoramento continuo operacional.
- Registrar release reproduzivel, fontes e manifesto do artefato publicado.
  Checkout segue com alteracoes nao commitadas; commit/PR exigem autorizacao.
- Adaptar runbook antigo de container ao Vercel/Supabase e testar rollback.
  Nao restaurar banco de pre-release sobre vendas novas sem plano de reconciliacao.
- Definir acessos administrativos de emergencia, desligamento de funcionario,
  retencao de auditoria, exportacao e resposta a incidente com responsaveis.
- Nao desabilitar protecao Vercel, mudar DNS, contratar plano ou rotacionar
  senhas por consequencia deste documento: cada acao requer autorizacao.

## Materiais existentes e materiais preparados

Credenciais ficam fora deste pacote e do chat. Documento de entrega existente:
C:/Users/Ugo Alencar/Documents/Travel-Gadotti/Gadotti-Entrega-de-Credenciais-Iniciais-2026-10-21.pdf.
Sua existencia foi verificada, nao seu conteudo. Conferir URL e destinatarios
antes de enviar; nao reenviar todas as senhas a todos os funcionarios.

Usar 02-ROTEIRO-E-HOMOLOGACAO.md na reuniao e 03-ENTREGA-PILOTO.md para
formalizar escopo, condicoes, suporte e aceite. Campos em aberto sao pendencias,
nao compromissos assumidos pelo fornecedor.

## Fonte externa consultada

Vercel Hobby Plan, consultado em 22/10/2026:
https://vercel.com/docs/plans/hobby (secao Hobby billing cycle).
O provedor declara uso pessoal nao comercial. Verificar adequacao contratual
antes de colocar a agencia para operar; nao foi contratado plano nesta etapa.
