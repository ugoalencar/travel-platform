# Procedimento de migracao por cliente: Lite para Full

## Como acionar

Envie ao agente:

```text
Siga D:\travel-platform\docs\travel-lite\MIGRACAO-LITE-PARA-FULL.md
para o cliente NOME DO CLIENTE. Prepare o pareamento e execute o checklist.
Informe os bloqueios e solicite as autorizacoes operacionais que faltarem.
```

O agente deve ler este documento, `AGENTS.md`, a DEC-007 e o codigo atual.
Esta instrucao inicia o procedimento, nao uma exclusao ou migracao online
automatica. Nome comercial nao identifica inequivocamente o tenant.

## Cliente previsto para teste futuro

Definicao do responsavel pelo produto em 2026-10-23: **Gadotti sera o cliente
de teste de migracao posteriormente, mas nao deve migrar agora**.

- Gadotti permanece no Lite; nenhuma janela de migracao esta definida.
- Esta indicacao nao autoriza acesso remoto, copia de dados reais, bloqueio,
  transferencia, alteracao de credenciais ou exclusao de dados.
- O teste futuro exige nova autorizacao explicita e cumprimento integral
  deste procedimento, incluindo confirmacao de ambientes e recuperacao.
- Exemplos com o nome Gadotti nao constituem uma ordem de migracao.

## Objetivo e estado do procedimento

Manter bancos Lite e Full separados e transferir somente a agencia aprovada,
com rastreabilidade por registro e liberacao do Full apos validacao completa.
Durante a transferencia, a agencia deve ficar bloqueada para uso operacional
nos dois ambientes, sem interromper outras agencias.

Este documento e um runbook para agentes; nao implementa um botao, job ou
bloqueio no sistema. Antes de executar, comprovar que os mecanismos exigidos
existem e funcionam. `/migration/readiness` e um diagnostico de leitura, nao
um executor. Se faltar pareamento, bloqueio efetivo, executor seguro ou
recuperacao, registrar impedimento e nao iniciar a transferencia online.

## Ficha obrigatoria da operacao

Criar um identificador unico e um dossie sem segredos em
`docs/travel-lite/migrations/<id-da-operacao>/` contendo:

- `01-plano.md`: cliente, slug, IDs exatos Lite e Full, referencias dos projetos
  origem/destino, ambiente, versoes de codigo/schema e escopo autorizado.
- `02-pareamento.md`: matriz de entidades/campos e regras de conversao.
- `03-checklist.md`: controles abaixo, resultados e referencias das evidencias.
- `04-resultado.md`: parecer final, pendencias, autorizacoes e recuperacao.

Registrar operador, autorizador, janela e timestamps com fuso. Identificadores
dos projetos nao substituem verificacao do destino conectado. Nao registrar
senhas, hashes de senha, tokens, URLs de conexao, CPF, emails, dumps ou dados
pessoais no dossie versionavel. Backups, mapa detalhado de IDs e evidencias
sensiveis devem ficar em armazenamento privado autorizado e criptografado;
no dossie, registrar somente sua referencia e integridade verificavel.

## Checklist e gates

Cada item deve ter status PASSOU, FALHOU, NAO EXECUTADO ou NAO APLICAVEL,
evidencia e responsavel. NAO APLICAVEL exige justificativa aprovada. Ausencia
de evidencia nao significa sucesso; qualquer gate obrigatorio falho impede
avancar. Nunca preencher o checklist com base em expectativa.

### A. Identificacao, permissao e prontidao

- [ ] Confirmar nome/slug e identificar o tenant correto, sem escolher por nome parecido.
- [ ] Confirmar projetos, IDs e agencias de origem/destino com o operador.
- [ ] Verificar se ja existe destino ou operacao anterior para impedir duplicacao.
- [ ] Registrar autorizacao explicita para acesso aos ambientes e para a
  transferencia, incluindo schema, arquivos e usuarios quando aplicavel.
- [ ] Definir janela, comunicacao ao cliente, autorizador e criterio de abortar.
- [ ] Conferir paridade funcional real: nenhuma regra Lite pode perder efeito no Full.
- [ ] Verificar capacidade, conectividade e privilegios minimos de origem/destino.
- [ ] Resolver impedimentos do relatorio de prontidao; nao usar apenas seu
  indicador `ready` como prova de compatibilidade com o destino.

### B. Pareamento obrigatorio

Para cada entidade, registrar origem e destino reais, campos/tipos, IDs/FKs,
ordem de carga, conversoes, regras, conflitos, idempotencia e validacao. O
mapeamento inicial abaixo deve ser confirmado no schema atual, nao executado
como regra pronta. Nao criar viagens/reservas ficticias para adaptar vendas.

| Dominio | Origem Lite de referencia | Pareamento a comprovar no Full |
| --- | --- | --- |
| Agencia | tenants | agencies e configuracoes |
| Usuarios/acesso | users, roles, user_permissions | identidades, papeis, permissoes e vinculos |
| Clientes | customers | customers, documentos e endereco |
| Vendedores | sellers | employees, usuarios e vinculos comerciais |
| Categorias/catalogos | sale_categories e catalogos financeiros | taxonomia/produtos e catalogos correspondentes |
| Vendas | sales e custos associados | sales e dependencias reais |
| Financeiro | receivables, payables, payments e alocacoes | titulos, pagamentos, estornos e conciliacao |
| Comissoes | seller_commissions, regras, versoes e faixas | planos/regras, lancamentos e snapshots |
| Auditoria/importacoes | audit_logs, lotes, registros e eventos | trilha historica e proveniencia |
| Arquivos/configuracoes | anexos, marca, dashboard e integracoes, se existentes | objetos privados, metadados e configuracoes compativeis |

- [ ] Inventariar todas as tabelas, arquivos e dependencias do tenant; nenhum
  dado fica sem destino ou decisao explicita de tratamento.
- [ ] Registrar mapa privado de IDs origem/destino e referencias externas;
  preservar IDs quando compativel, sem presumir que os schemas sao iguais.
- [ ] Resolver colisoes e diferencas de enums, datas, moeda e precisao monetaria.
- [ ] Preservar comissoes/financeiro historicos sem recalcular com regras atuais.
- [ ] Validar identidades e formato de hash/autenticacao. Nao copiar sessoes,
  tokens ou senhas em texto; eventual redefinicao exige plano aprovado.
- [ ] Comprovar permissoes equivalentes sem promover funcionarios a administradores.
- [ ] Tratar filas/webhooks/integracoes sem reenviar notificacoes ou cobrar em dobro.

### C. Ensaio e recuperacao

- [ ] Executar ensaio em ambiente isolado autorizado, com dados sinteticos ou
  copia protegida autorizada; nao usar dados reais em testes sem aprovacao.
- [ ] Comprovar retomada idempotente e rejeicao de duas migracoes simultaneas
  para a mesma agencia. Entre projetos, nao presumir transacao unica atomica.
- [ ] Gerar backup recuperavel do escopo da origem e do destino afetado;
  comprovar integridade e restauracao em ambiente isolado.
- [ ] Definir recuperacao para falha antes e depois do corte de acesso.
  Apos novas vendas no Full, nunca reabrir o Lite desatualizado sem reconciliar.
- [ ] Aprovar o resultado do ensaio e o plano antes de iniciar a janela real.

### D. Bloqueio e transferencia

- [ ] Reautenticar o administrador que autoriza o inicio; registrar a operacao.
- [ ] Ativar manutencao persistente por tenant nos dois ambientes e drenar
  operacoes em andamento antes de capturar o estado final da origem.
- [ ] Testar negacao efetiva por API, sessoes ja abertas, tarefas, importacoes,
  webhooks e acessos diretos existentes. Uma tela de aviso nao e bloqueio.
- [ ] Confirmar que outras agencias permanecem operacionais e que somente
  o executor autorizado pode acessar o escopo bloqueado.
- [ ] Capturar manifesto final consistente apos bloqueio e encerrar filas em voo.
- [ ] Transferir na ordem de dependencias, com checkpoints e log privado por registro.
- [ ] Manter destino indisponivel ao cliente e origem intacta durante a copia.

### E. Validacao do sucesso

- [ ] Reconciliar contagens por entidade/status e registros por mapa de IDs,
  nao somente totais globais.
- [ ] Comparar conteudo normalizado e integridade dos arquivos por checksum;
  justificar transformacoes previstas no pareamento.
- [ ] Comprovar ausencia de orfaos, duplicatas e vinculos cruzados entre agencias.
- [ ] Reconciliar valores por venda/titulo: bruto, custos, margem, parcelas,
  baixas, alocacoes, saldo, estornos e comissoes por status, sem diferenca
  inexplicada. Arredondamentos/conversoes exigem regra e evidencia aprovadas.
- [ ] Conferir regras, vigencia, faixas e snapshots de comissao preservados.
- [ ] Conferir auditoria, autoria, datas e rastreabilidade da origem.
- [ ] Testar login e permissoes do administrador e de funcionario por meios
  autorizados, sem trocar silenciosamente senha real ou consumir primeiro acesso.
- [ ] Testar jornadas aplicaveis: cliente, venda, recebimento, comissao,
  pagamento, relatorio e documentos, usando registros de teste identificados
  e procedimento aprovado, sem alterar vendas reais para provar funcionamento.
- [ ] Executar testes negativos de acesso e isolamento; verificar rotas e
  endereco de destino, sem assumir que copiar dados altera DNS/roteamento.
- [ ] Registrar aceite do operador e autorizacao para a liberacao.

### F. Corte, liberacao e limpeza separada

- [ ] Atualizar direcionamento/configuracao autorizado e verificar que apenas
  o Full sera o ambiente operacional da agencia.
- [ ] Liberar o Full somente apos todos os gates; manter Lite bloqueado para
  impedir operacao em dois bancos e monitorar os indicadores acordados.
- [ ] Emitir resultado CONCLUIDA, FALHOU ou ABORTADA com evidencias,
  horarios, versoes, operador, aceite e local dos backups protegidos.
- [ ] Definir prazo de retencao/recuperacao com o responsavel; nao inventar prazo.
- [ ] Excluir dados operacionais Lite apenas em operacao posterior, com
  autorizacao destrutiva explicita, escopo verificado, aceite e backup valido.
  Nunca apagar tabelas/projeto compartilhados ou dados de outras agencias.
- [ ] Preservar trilha exigida e medir espaco reutilizavel; nao prometer
  reducao imediata de armazenamento faturado apos exclusao.

## Em caso de falha

Interromper a etapa, registrar o ponto exato e manter o destino bloqueado.
Nao liberar acesso apenas para encerrar manutencao. Retomar do checkpoint
validado ou aplicar a recuperacao aprovada, com verificacao antes de liberar
qualquer ambiente. Se o Full ja recebeu alteracoes, reconciliar primeiro.
Comunicar ao operador o impacto e o proximo passo, sem expor segredos.

## Resultado minimo do agente

Entregar o dossie com pareamento, checklist e evidencias; informar cliente e
ambientes confirmados, dados reconciliados, testes realizados, falhas,
ambiente liberado, estado da origem e recuperacao disponivel. Migracao
concluida nao significa origem excluida. Nunca alegar sucesso se transferencia,
autenticacao, isolamento ou reconciliacao nao foram comprovados.

## Referencias

- [Regra Full primeiro](../decisions/DEC-007-full-first-lite-parity.md).
- [Vistoria inicial](FULL-LITE-PARITY-AUDIT-2026-10-23.md).
- [Mapeamento inicial de produto](product-experience/MIGRATION-MAPPING.md).
- [Prontidao](product-experience/MIGRATION-READINESS.md).
- [Upgrade](product-experience/UPGRADE-TO-FULL.md).
