# Ordem de alinhamento funcional Full / Lite

Data: 2026-10-23. Coordenacao: Codex.
Estado: entregas documentais Claude/OpenCode recebidas; regularizacao local
iniciada. Nenhuma das nove discrepancias esta encerrada integralmente.

## Avanco local e consolidacao

Atualizacao desta rodada:

- **Fase 0 financeira validada em banco novo descartavel**, com autorizacao
  explicita do usuario. Complementadas revalidacao no pagamento e trava de
  aprovacao/regeneracao: [evidencias](../../.claude/REVISAO-CODEX-FASE0-2026-10-23.md).
  37 testes finais passaram. Isso nao encerra COM-01/02/03.
- **CSV API Full expandida aos 10 endpoints existentes**, com mapeamento
  explicito e 105 testes puros/HTTP mockados aprovados. Interface de download
  e paridade do conteudo continuam pendentes; os dois endpoints iniciais
  abaixo sao historico da primeira entrega, nao o limite atual.
- **Protecao contra formulas aplicada no CSV Lite**, tomando Full como
  referencia, com 30 testes puros aprovados e typecheck Lite aprovado.
  Nao houve deploy. A pendencia de backport mencionada abaixo esta atendida
  no codigo local, nao no ambiente online.
- **CEP em implementacao pelo OpenCode**, conforme informado pelo usuario;
  arquivos reservados continuam preservados, aguardando relatorio final.

- CSV-01: camada API inicial implementada no Full para `/reports/sales` e
  `/reports/financial/cash-flow` com `format=csv`, protecao de formulas e
  JSON/permissoes preservados. Testes novos usam dados simulados, nao banco.
  Botao na interface, outros contratos e paridade de conteudo continuam pendentes.
- OpenCode: [desenho revisado](../../.opencode/REVISAO-CODEX-PARIDADE-FULL-LITE-2026-10-23.md)
  e [tarefa de implementacao CEP local](../../.opencode/NEXT-PROMPT-IMPLEMENTAR-CEP-FULL-2026-10-23.md)
  preparados; o encaminhamento externo nao foi feito automaticamente.
  `app.ts`, `server.ts`, cliente API e CustomerDetail ficam reservados ao
  OpenCode durante essa tarefa; Codex nao edita esses arquivos em paralelo.
- Claude: resposta recebida, com [consolidacao adicional](../../.claude/CONSOLIDACAO-CODEX-RESPOSTA-PARIDADE-2026-10-23.md).
  HOLD financeiro permanece por liquidacao parcial, politica e ordem historica.
- Correcao da protecao contra formula no CSV Lite e pendencia de seguranca
  priorizada, apos referencia Full validada; nao ha autorizacao de deploy.

### Evidencias da camada CSV API

Verificacoes locais em 2026-10-23:

- `npm.cmd run test --workspace=@travel-platform/api -- tests/report-csv.test.ts tests/reports-csv-http.test.ts`:
  22 testes aprovados em 2 arquivos. Testes primeiro reproduziram falha por
  ausencia do CSV, depois passaram com implementacao e protecoes.
- `npm.cmd run typecheck --workspace=@travel-platform/api`: exit 0.
- `npm.cmd run lint --workspace=@travel-platform/api`: exit 0, 13 avisos em
  outros arquivos; nenhum erro remanescente nos novos testes.
- `npm.cmd run build --workspace=@travel-platform/api`: exit 0.
- Sem teste integrado de banco/RLS, sem teste visual e sem reinicializacao
  do servidor de demonstracao; nao declarar a interface ou o online prontos.

## Revisao recebida em 2026-10-23

Claude entregou levantamento documental COM-01/02/03, sem codigo ou testes.
Codex manteve HOLD de implementacao por cinco problemas de contrato, incluidos
em [revisao tecnica](../../.claude/REVISAO-CODEX-PARIDADE-FULL-LITE-2026-10-23.md).
O [retorno ao Claude](../../.claude/NEXT-PROMPT-PARIDADE-CORRECOES-2026-10-23.md)
esta preparado, nao enviado automaticamente.

Antes de novas regras, caracterizar e tratar os riscos de obrigacao duplicada,
pagamento por folha e avulso, sincronizacao PAID e cancelamento. A leitura
corroborou riscos, mas nao substitui testes integrados. Estorno financeiro e
candidato adicional de paridade ainda nao implementado; nao declarar a lista
inicial de nove uma cobertura completa de todas as capacidades.

## Limites confirmados

- Full primeiro; Lite nao pode possuir capacidades exclusivas (DEC-007).
- Bancos Lite e Full continuam separados. Nao executar fusao de bancos.
- Gadotti permanece no Lite e sera candidata a teste futuro de migracao,
  mediante nova autorizacao. Nao migrar, bloquear ou alterar seu ambiente agora.
- Trabalho local; sem deploy, acesso remoto, dados reais, .env, instalacao,
  reset de banco, migrations executadas, commit, push ou alteracao de main.
- Preservar alteracoes existentes no checkout e funcionalidades dos dois produtos.
- Nesta rodada, os agentes externos entregam contratos e planos tecnicos nos
  seus arquivos exclusivos. Codigo e schema dependem da consolidacao desses
  desenhos; nao interpretar a entrega dos prompts como codigo implementado.

## Ordem por dependencias e risco

Os numeros indicam ordem de integracao, nao impedem analise em paralelo.
CEP e CSV nao precisam esperar a conclusao financeira para serem especificados.

| Ordem | ID | Pendencia da vistoria | Responsavel | Dependencia / criterio principal |
| --- | --- | --- | --- | --- |
| 0 | BASE | Contratos de compatibilidade e mapa de responsabilidades | Codex | Fixar equivalencia, limites e evidencias antes de alterar schema |
| 1 | COM-01 | Heranca de regras e revisoes append-only (ponto 2) | Claude | BASE; preservar funcionario/produto, vigencia e historico Full |
| 2 | COM-02 | Comissoes progressivas e excedente (ponto 1) | Claude | COM-01; casos numericos iguais e nenhuma mudanca historica silenciosa |
| 3 | COM-03 | Liberacao por recebimento (ponto 3) | Claude | COM-02; baixas parciais, estornos, concorrencia e folha |
| 4 | SEC-01 | Permissoes individuais (ponto 4) | Codex | BASE; desenho aprovado, sem enfraquecer RBAC/RLS |
| 5 | BAK-01 | Backup operacional Full (ponto 6) | Codex | SEC-01; reautenticacao, criptografia e recuperacao comprovada |
| 6 | IMP-01 | Importacao de vendas conciliada (ponto 5) | Claude, rodada posterior | COM-03, SEC-01, BAK-01; nao duplicar vendas/comissoes |
| 7 | CEP-01 | Consulta e preenchimento por CEP (ponto 7) | OpenCode | BASE; independente do motor financeiro |
| 8 | CSV-01 | Exportacao CSV (ponto 9) | OpenCode | BASE; preservar filtros, escopo e seguranca do arquivo |
| 9 | DASH-01 | Dashboard configuravel (ponto 8) | OpenCode, rodada posterior | SEC-01; configuracao nao concede acesso aos dados |

Todos os nove pontos da vistoria estao representados. Folha no Lite, PDF,
backup diario, fila de aprovacao e revisao retroativa continuam demandas
separadas; nao sao implementacao automatica desta regularizacao.

## Proxima etapa, somente apos alinhamento validado

O usuario indicou `docs/AJUSTES-23-10-2026-GADOTTI.MD` como o pacote seguinte,
nao para inicio imediato. O [registro de escopo](GADOTTI-ADJUSTMENTS-2026-10-23.md)
preserva a fonte, separa comissao recebida pela agencia de comissao paga ao
funcionario e lista as frentes a especificar. Nao incorporar silenciosamente
essas novas regras na rodada atual nem implementar diretamente no Lite.

## BASE: contrato transversal a consolidar pelo Codex

- Matriz capacidade Lite -> implementacao Full -> testes -> estado.
- Identidade, chaves, enums, moeda, competencia, datas e proveniencia de dados.
- Separar contrato funcional comum de armazenamento fisico; nenhum agente
  deve assumir equivalencia entre `tenant_id` e `agency_id` por renomeacao.
- Manter o [runbook de migracao](../travel-lite/MIGRACAO-LITE-PARA-FULL.md)
  como criterio futuro de compatibilidade; o executor de migracao e outro projeto.
- Reservar inicializacao de APIs, tipos compartilhados, migrations e integracao
  de permissoes para consolidacao unica, sem edicoes paralelas concorrentes.

## Rodada externa preparada agora

### Claude: dominio de comissoes, COM-01 a COM-03

Entrada: [.claude/NEXT-PROMPT-PARIDADE-FULL-LITE-2026-10-23.md](../../.claude/NEXT-PROMPT-PARIDADE-FULL-LITE-2026-10-23.md).
Saida exclusiva nesta rodada:
`.claude/RELATORIO-PARIDADE-FULL-LITE-2026-10-23.md`.

Entregar desenho e sequencia de implementacao/testes, nao um segundo motor
desconectado do Full existente. Identificar comportamento preservado, lacunas
e mudancas de regra que precisam de decisao humana.

### OpenCode: CEP-01 e CSV-01

Entrada: [.opencode/NEXT-PROMPT-PARIDADE-FULL-LITE-2026-10-23.md](../../.opencode/NEXT-PROMPT-PARIDADE-FULL-LITE-2026-10-23.md).
Saida exclusiva nesta rodada:
`.opencode/RELATORIO-PARIDADE-FULL-LITE-2026-10-23.md`.

Entregar contratos, UX preservada e planos pequenos, sem editar modulos de
comissao/financeiro. DASH-01 permanece fila posterior, nao iniciar nesta rodada.

### Codex: integracao, seguranca e aceite

Consolidar as duas respostas, resolver colisoes e definir o desenho de
SEC-01/BAK-01. Registrar ADR quando houver mudanca arquitetural e planos de
implementacao separados por subsistema. Somente depois iniciar codigo local
com escopos de escrita exclusivos e aprovacao das decisoes pendentes.

## Decisoes que nao podem ser inventadas

1. A spec de comissoes declara o perfil financeiro global descartado, mas
   informa que a confirmacao humana nao foi verificada. A instrucao humana
   anterior pede esse perfil. Registrar a contradicao e obter confirmacao;
   nao propagar descarte como requisito aprovado.
2. O motor atual Lite usa faixas marginais, enquanto a solicitacao original
   contempla total por padrao e excedente selecionavel. Separar paridade com
   o que esta implementado de evolucao do comportamento desejado.
3. O Full possui bases por produto/passageiro/bilhete e folha. Nao reduzir
   essas capacidades ao copiar o fluxo mais simples de venda do Lite.
4. Definir comportamento de delegacao individual sem substituir a hierarquia
   base por GRANT irrestrito. Isso exige desenho de seguranca explicito.

## Gate de encerramento de cada pendencia

- [ ] Contrato e arquivos afetados aprovados; ambiguidades resolvidas.
- [ ] Teste de regressao falhando antes da correcao quando aplicavel.
- [ ] Implementacao Full validada antes de alterar o recorte Lite.
- [ ] Evidencias de equivalencia e ausencia de regressao no Full e no Lite.
- [ ] Lint, typecheck, testes relevantes e build com resultados finais.
- [ ] Banco/RLS e testes de concorrencia quando aplicaveis, somente com
  autorizacao e ambiente descartavel isolado; nao usar demo de apresentacao.
- [ ] Teste local de interface desktop/mobile quando houver mudanca visual.
- [ ] Matriz de paridade atualizada; nenhum segredo ou dado pessoal em evidencias.
- [ ] Revisao Codex; aprovacao local do usuario antes de eventual publicacao.

Nao marcar item concluido por relatorio de agente sem verificar codigo e gates.
Nao executar suites que resetam banco compartilhado em paralelo.

## Divisao ativa e economia de contexto

Esta distribuicao atualiza a rodada documental acima; nao significa que novos
prompts ja foram enviados aos agentes externos.

| Responsavel | Frente | Condicao de execucao |
| --- | --- | --- |
| Claude | COM-01, depois COM-02 e COM-03, em entregas separadas | Fechar as decisoes financeiras pendentes antes de implementar cada contrato. Fase 0 ja revisada; nao repetir a auditoria inteira. |
| OpenCode | Finalizar CEP-01 ja encaminhado | Manter a reserva de arquivos do prompt CEP ate devolver a entrega. DASH-01 somente em rodada posterior a SEC-01. |
| Codex | Integracao, CSV-01, SEC-01 e BAK-01 | UI CSV aguarda liberacao de `apps/agency/src/lib/api.ts`; seguranca e backup exigem seus desenhos e gates. Centralizar revisao e testes integrados. |

IMP-01 permanece com Claude em rodada posterior a COM-03, SEC-01 e BAK-01.

Regras para reduzir repeticao sem perder verificacao:

- Cada tarefa recebe as regras obrigatorias, um briefing curto, o contrato
  relevante e os caminhos autorizados; nao reenviar todo o historico.
- Uma frente de escrita por arquivo. Mudancas em arquivos compartilhados passam
  pela coordenacao Codex antes de outra frente comecar.
- Cada agente executa testes focados na propria alteracao. Codex executa os
  gates integrados ao consolidar, sem repetir revisoes ja aceitas sem motivo.
- Retorno curto: arquivos alterados, comandos e resultados finais, pendencias e
  decisoes necessarias. Atualizar o relatorio da tarefa, sem criar copias.
- Testes que resetam banco sao serializados e usam somente o banco local novo
  e descartavel autorizado. Preservar demo de apresentacao, Gadotti e online.
- Toda funcionalidade deve existir primeiro no Full; a derivacao Lite preserva
  o contrato aprovado. Os novos ajustes Gadotti continuam aguardando a paridade.

## Referencias

- [Vistoria com evidencias](../travel-lite/FULL-LITE-PARITY-AUDIT-2026-10-23.md).
- [DEC-007](../decisions/DEC-007-full-first-lite-parity.md).
- [Escopo](scope.md).
