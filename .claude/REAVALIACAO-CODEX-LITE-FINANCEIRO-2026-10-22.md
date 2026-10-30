# Reavaliacao Codex - resposta do Claude

Data: 2026-10-22
Branch: wip/organizacao-2026-10-20
Entrada: RESPOSTA-REVISAO-CODEX-LITE-FINANCEIRO-2026-10-22.md
Veredito: **NO-GO mantido**.

## 1. P1 - Confirmar venda pela interface retorna HTTP 400

Referencias:

- apps/travel-lite/src/api.ts:93: Content-Type application/json incondicional.
- apps/travel-lite/src/api.ts:98: corpo enviado somente se options.body existe.
- apps/travel-lite/src/pages/SalesPage.tsx:209: confirmacao POST sem body.
- apps/travel-lite/src/SalesDetail.test.tsx: a camada api e mockada, portanto o
  teste de componente nao exercita o transporte HTTP nem o parser Fastify.

Reproducao em Chrome real, com frontend local e API atual em fixture isolada:

1. Login de usuario sintetico MASTER.
2. Criar regra progressiva por vendedor e categoria.
3. Criar venda de R$ 1.000,00, duas parcelas, com forma ON_RECEIPT.
4. O rascunho retorna 201 e o detalhe retorna 200 com customer: esse defeito
   anterior foi corrigido; nao ocorre a tela em branco.
5. Clicar Confirmar envia POST /api/sales/:id/confirm, sem corpo, com
   Content-Type: application/json.
6. Fastify responde 400, codigo FST_ERR_CTP_EMPTY_JSON_BODY e mensagem
   "Body cannot be empty when content-type is set to 'application/json'".
   A venda continua em rascunho e a tela exibe o erro.

O ciclo completo do navegador continua reprovado. O teste para na confirmacao;
aprovacao, recebimento e pagamento posteriores nao foram exercitados pelo
navegador nesta rodada. Nao foi aplicado workaround de header no teste.

Correcao esperada: alinhar header e corpo na abstracao HTTP existente, com
regressao que execute fetch real contra Fastify. Avaliar todos os comandos
sem corpo que usam essa abstracao, nao somente a tela de vendas.

## 2. P1 - Bloqueio de estorno nao e seguro contra pagamento concorrente

Referencias:

- services/api-lite/src/finance.ts:200-211: assertCommissionsStillCovered le
  paid_amount sem serializar com o pagamento da obrigacao.
- services/api-lite/src/finance.ts:284: verifica cobertura durante estorno.
- services/api-lite/src/routes/cash-flow.ts:444: pagamento bloqueia payable.
- services/api-lite/src/routes/cash-flow.ts:462: consulta liberacao.
- services/api-lite/src/routes/cash-flow.ts:485: atualiza valor pago.

Reproducao deterministica, repetida duas vezes, com rotas HTTP e PostgreSQL
reais, em dados sinteticos:

1. Venda R$ 1.000,00 ON_RECEIPT, comissao R$ 100,00, duas parcelas recebidas.
2. Iniciar pagamento da comissao. Depois da leitura da liberacao de R$ 100,00,
   pausar antes do UPDATE do payable, mantendo a transacao aberta.
3. Em outra requisicao, estornar um recebimento de R$ 500,00. A verificacao
   consulta o valor pago ainda confirmado como zero; permite o estorno (201).
4. Retomar o pagamento, que usa a liberacao lida antes do estorno (200).
5. Estado final: R$ 100,00 pagos, R$ 50,00 liberados, comissao PAID.

A pausa e exclusivamente uma barreira de escalonamento no cliente SQL da
fixture. Nenhuma resposta financeira ou resultado SQL e simulado; todas as
queries sao executadas no PostgreSQL. O objetivo e reproduzir uma intercalacao
possivel de duas requisicoes reais, sem depender de temporizacao aleatoria.

Correcao esperada: pagamento e estorno precisam da mesma estrategia de
serializacao e ordem consistente de bloqueios, com releitura da cobertura
dentro dessa protecao. Evitar apenas adicionar locks em ordem oposta, criando
deadlocks. Adicionar regressao concorrente e preservar o rollback/auditoria.

## Correcoes anteriores verificadas

| Achado anterior | Evidencia atual |
| --- | --- |
| Detalhe sem customer | GET retorna customer e rascunho abre sem erro JS |
| Override de aprovada | HTTP 409; comissao e payable preservados em R$ 100 |
| Bypass legado | Rota especifica e PATCH legado retornam 403 com REVOKE; permanece uma versao |
| Estorno depois de pago | Em sequencia retorna 409, mantendo liberado/pago R$ 100; insuficiente sob concorrencia |
| Arredondamento | Total R$ 0,02 = soma das fatias R$ 0,02 |

O fluxo HTTP sequencial de recebimento, liberacao proporcional, pagamento
parcial, quitacao e rejeicao de duplicidade passou. Viewer, separacao de
agencias e leitura RLS dos casos exercitados tambem passaram.

## Verificacao independente desta rodada

| Gate | Resultado |
| --- | --- |
| API Lite completa | 227/227, 26 arquivos, exit 0 |
| Frontend Lite completo | 129/129, 11 arquivos, exit 0 |
| Typecheck API Lite + frontend Lite | Exit 0 |
| Lint API Lite + frontend Lite | Exit 0; quatro avisos Fast Refresh no frontend |
| Build API Lite + frontend Lite | Exit 0; aviso de bundle frontend 802,88 kB |
| Diagnostico HTTP/PostgreSQL/Chrome | 6 passaram, 2 falharam; exit 1, repetido |
| git diff --check | Exit 0; avisos LF/CRLF |

Full e agency nao foram reexecutados nesta rodada. Os 19 testes financeiros
selecionados do Full passaram na revisao anterior, nao sao nova evidencia.

## Ambiente e evidencias

- Banco exclusivamente descartavel: travel-lite-postgres-test,
  127.0.0.1:55600/travel_lite_test; fixtures reinicializam seu esquema.
- API Fastify criada a partir do codigo atual em porta local efemera.
- Vite 127.0.0.1:5181, tenant-a sintetico; /api encaminhada para a API real
  da fixture, sem simular respostas nem alterar o payload do browser.
- API de desenvolvimento em 4010 nao foi reconstruida/reiniciada.
- Nenhuma conta real, credencial de cliente, banco remoto ou deploy utilizado.
- Artefatos ignorados: .tmp/lite-financial-audit.test.ts,
  .tmp/lite-financial-audit.config.ts e
  .tmp/lite-financial-audit-observations.json.
- Screenshot atual: .tmp/financial-audit-browser-failure.png.
- Screenshots desktop/mobile de rodadas anteriores nao comprovam o ciclo
  completo atual; o teste atual para antes da verificacao mobile final.

Com LITE_TEST_ADMIN_URL e LITE_TEST_RUNTIME_URL apontando exclusivamente para
o banco descartavel indicado, reproduzir por:

```powershell
npx vitest run --config .tmp/lite-financial-audit.config.ts
```

Nao executar contra banco com dados a preservar. Foram alterados apenas o
diagnostico ignorado e este relatorio; nenhuma correcao de produto foi feita.

## Pendencias de escopo e publicacao

Continuam pendentes: folha Lite, fila de aprovacao de cancelamento/alteracao,
retroatividade com reautenticacao/ajustes e bonus/teto/recuperacao negativa.
O bloqueio de estorno nao implementa recuperacao; o bloqueio de override nao
implementa ajuste de comissao aprovada.

A decisao sobre o perfil financeiro global solicitado pelo usuario ainda
precisa de confirmacao, conforme reconhecido na resposta do Claude. ADR em
Proposta e escopo pendente nao devem ser apresentados como aprovados.

Corrigir os dois bloqueios, repetir os gates e concluir o ciclo real pela
interface antes de nova recomendacao de publicacao. Validacao remota,
backup, configuracao do hosting e migracoes online continuam fora desta etapa.
