# Revisao Codex da proposta Claude: COM-01, COM-02 e COM-03

Data: 2026-10-23. Entrada: `RELATORIO-PARIDADE-FULL-LITE-2026-10-23.md`.
Parecer: **recebido como levantamento, nao aprovado para implementacao**.
Nenhuma mudanca funcional ou migracao foi realizada nesta revisao.

## Achados bloqueantes no contrato proposto

### P1 - Acumulador de comissoes nao equivale ao acumulador de vendas

Relatorio Claude, secao 5.2 item 5 (`:331`), propoe somar
`commission_entries.calculation_base`, inclusive entradas legadas e diferentes
bases. O Lite soma vendas confirmadas do vendedor/mes/categoria na metrica da
regra atual (`services/api-lite/src/commission-engine.ts:245`).

Consequencias: venda confirmada sem comissao gerada conta no Lite, mas nao no
Full proposto; uma venda com mais de uma entrada pode contar mais de uma vez;
bruto, margem e bases de itens nao sao somaveis sem normalizacao explicita.
Afirmar equivalencia apenas por usar PACKAGE_TOTAL nao basta.

Exigir contrato canonico de evento elegivel, metrica, periodo, vendedor e
categoria, com unidade de acumulacao identificada e deduplicacao. Testar
vendas sem comissao, geracao atrasada, varios produtos, regras revisadas e
troca de bruto para margem. Nao copiar a query de acumulado sem resolver isso.

### P1 - Conversao de revisoes no mesmo dia perde informacao

O relatorio (`:281` e `:566`) fecha a revisao anterior na vespera da proxima e
rejeita inicio igual ao anterior. O Lite permite `effective_from` igual ao
da revisao mais recente (`routes/commission-rules.ts:188-201`) e desempata por
`version_number` (`commission-engine.ts:92-93`).

Para duas revisoes no mesmo dia, derivar a vespera cria intervalo invertido.
Nao descartar revisao nem reatribuir snapshot ao novo identificador. Preservar
identidade/ordem de versoes e definir projecao de vigencia efetiva com origem
rastreavel, inclusive revisoes supersedidas sem intervalo ativo. Incluir
teste de ida de duas revisoes na mesma data com comissoes que apontam a ambas.

### P1 - Perda de categorias e pendencias contradiz a meta de migracao

O de-para em `:564` admite categorias distintas virarem um unico enum; em
`:570`, considera nao migrar `PENDING_RULE`. Isso nao entrega equivalencia:
categorias com regras distintas podem colidir, e pendencias continuam sendo
dados operacionais do cliente.

Propor representacao sem perda para categorias e pendencias. Preservar o
fluxo manual Full atual pode ser compativel com um novo fluxo de importacao,
mas nao autoriza omitir dados. Se nao houver destino equivalente, marcar a
migracao impedida; nunca transformar omissao em migracao bem-sucedida.

### P1 - Indice proposto repete limitacao ja documentada no Full

Em `:229`, a proposta usa `COALESCE(product_type::text,'')` em indice.
`infrastructure/migrations/080_employee_commission_rules.sql:203-209` ja
documenta que o cast enum -> text nao e IMMUTABLE nesse contexto. A mesma
migration usa indices parciais separados para evitar esse problema.

Reformular a estrategia de unicidade para os quatro escopos, incluindo
regras com nulos, e provar a DDL em ambiente descartavel autorizado. Nao
apresentar a SQL ilustrativa como migration executavel ou aprovada.

### P1 - Folha precisa de controle de liquidacao por comissao e por canal

A secao 7.2 sugere somar liberado menos o pago avulso na geracao da folha,
mas nao fecha o contrato de reservas/alocacoes por comissao, pagamentos pela
folha, pagamentos parciais em competencias futuras e alteracoes entre gerar
folha e efetivamente pagar. Apenas guardar `released` na geracao nao impede
que o valor fique desatualizado na quitacao.

Definir saldo liquidavel considerando todos os canais, bloqueios atomicos
e revalidacao no pagamento, com rastreio de liquidacao pela folha. Reproduzir
o risco legado com teste antes de alterar politicas financeiras. Nao manter
um caminho inseguro para ON_SALE e declarar exclusividade global resolvida.

## Riscos atuais do Full corroborados por leitura, ainda sem teste DB

- Criacao de payable de comissao sem trava na entrada e sem unicidade
  correspondente nas migrations examinadas: `services/api/src/commissions.ts:312`.
  Reexecucao concorrente pode inserir duas obrigacoes.
- `services/api/src/payroll.ts:274` inclui comissoes APPROVED/PAYABLE/PAID no
  liquido; `payPayrollEntry` cria obrigacao pelo liquido completo. O caminho
  avulso cria outra obrigacao: risco de pagamento duplo sem vinculacao de canal.
- `services/api/src/financial.ts:2861` atualiza payable e folha, nao o status
  da entrada de comissao. A busca em fonte/migrations nao encontrou outra
  sincronizacao para PAID; confirmar por teste integrado.
- `cancelCommissionsForSale` deixa PAYABLE/PAID intactos
  (`employee-commissions.ts:497`): comportamento atual documentado, nao
  autorizacao para cancelar obrigacoes financeiras automaticamente.
- Arredondamento divergente reproduzido em Node com a formula real do Full:
  `18.5 * (3 / 100)` resulta em 0,55 no Full e 0,56 no roundMoney Lite.
  Nao alterar valores historicos nem decidir politica de arredondamento aqui.

Estorno de recebimento/pagamento nao foi localizado nos caminhos financeiros
examinados do Full. Registrar como candidato adicional de paridade, nao como
recurso entregue nem como simples guarda para um futuro fluxo inexistente.

## Ajustes de escopo e decisoes

- Separar decisao tecnica de pergunta de negocio: nao devolver 22 perguntas
  ao usuario. Agrupar somente escolhas comerciais/financeiras indispensaveis.
- Preservar bases por produto, passageiro, bilhete e folha do Full.
- A instrucao humana sobre perfil financeiro global continua valida ate
  existir confirmacao verificavel de mudanca; relato de outro agente nao a revoga.
- Separar paridade com o codigo Lite atual de evolucao para total/excedente
  desejada pelo usuario. Nao impor progressao marginal como unica regra final.
- Numeros de migrations e `calc_version=2` sao propostas, nao reservas.
- Relacionar cada caso numerico ao teste exato; falta de execucao deve ser
  explicita. Schemas aplicados e dados remotos nao foram verificados.
- Reler AI_CONTEXT e QUALITY-GATES e examinar a tela de folha, omitidos na
  rodada do Claude. Nao e necessario executar banco para concluir o documento.

## Proxima entrega exigida

Contrato revisado, matriz sem perda e lista curta de decisoes humanas. Manter
HOLD de implementacao. A fase inicial deve caracterizar os riscos atuais e
definir suas protecoes antes de progressividade/liberacao novas. Sem banco
online, Gadotti, deploy, migrations executadas ou alteracao de codigo.
