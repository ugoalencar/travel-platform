# Full: cronograma de recebíveis e baixas parciais

Implementação backend da Fase 1 do ADR-006. A migration
`105_receivable_payment_schedules.sql` deve ser aplicada pelo procedimento
autorizado; não foi executada na preparação desta entrega.

| Método | Rota | Papel mínimo | Resultado |
| --- | --- | --- | --- |
| GET | `/payment-conditions` | MANAGER | Condições ativas com aplicabilidade |
| POST | `/payment-conditions` | ADMIN | Cadastra condição sem juros |
| POST | `/sales/:id/payment-schedule` | MANAGER | Aplica condição e gera recebíveis |
| GET | `/sales/:id/payment-schedule` | MANAGER | Snapshot e recebíveis efetivos |
| GET | `/sales/:id/balance` | MANAGER | Saldo, baixas, prazos e sinalizações |
| POST | `/sales/:id/payments` | MANAGER | Baixa livre ou dirigida, idempotente |
| POST | `/sales/:id/payment-schedule/revise` | ADMIN | Reancora vencimentos abertos com motivo |

Todas as rotas usam `protectedHooks`; agência e autor vêm exclusivamente da
sessão. ADMIN/OWNER respeitam a hierarquia existente. Leitura financeira fica
no mesmo piso MANAGER dos pagamentos do Full; revisão tem piso próprio ADMIN.

O cadastro recebe os campos de `PaymentCondition` de `payment-schedule.ts`,
exceto `version`, atribuída pelo servidor. Também recebe `paymentMethods`
(lista obrigatória de identificadores textuais), `categoryIds` e `productIds`.
As duas últimas listas vazias significam ausência de restrição naquela dimensão.
Quando ambas são preenchidas, ambas precisam corresponder; todos os itens ativos
precisam pertencer aos produtos permitidos. FKs compostas protegem as referências.
O Full ainda usa métodos textuais em `payments.method`; esta fase não inventa
um cadastro de formas de pagamento ou contas bancárias.

Aplicação: `{ conditionId, installments, paymentMethod }`. Valores e datas vêm
da venda e da condição no servidor. Nenhum valor de parcela, total, vencimento,
agência ou snapshot é aceito do cliente. Condições e limites inválidos retornam
422; campos desconhecidos ou com tipos inválidos retornam 400. Venda inexistente
no tenant retorna 404; reaplicação e operações incompatíveis retornam 409.

Baixa: `{ amount, idempotency_key, method, paid_at, receivable_id?, reference?,
notes? }`. `paid_at` exige timestamp ISO com fuso. O servidor normaliza para UTC.
A chave é única por agência e venda. Repetição do mesmo conteúdo normalizado
devolve a resposta original, inclusive seu saldo naquele momento; conteúdo
diferente com a mesma chave retorna 409. O saldo atual está na rota de leitura.
Alocação automática segue vencimento, número e ID; indicação de recebível limita
a baixa ao saldo daquela linha. Excesso retorna 422. Baixa atrasada é aceita e
marcada `late`. `allowsPartialPayments=false` exige completar cada linha atingida.

Decisões para as perguntas abertas do ADR:

- Q1/Q5: alocação por vencimento, com recebível explícito opcional.
- Q2: entrada vence na data civil da venda. Entrada exigida não impede confirmação;
  `down_payment_pending` permanece até sua quitação. Efeitos em receita são ADR-007.
- Q4: acrescenta `due_date DATE`, preservando `due_at TIMESTAMPTZ` e seus valores
  históricos. A projeção inicial da migration 105 usa UTC explicitamente. Novos
  cronogramas usam datas civis; `due_at` é a projeção de meia-noite UTC.
  Relatório de atraso, dashboard e `/balance` comparam `due_date` com a data
  corrente em `America/Sao_Paulo`: só existe atraso no dia civil seguinte.
  Esse é o padrão já usado por `sale_date`; o schema atual não configura fuso
  por agência. Linhas sem `due_date` preservam a comparação por instante `due_at`.
  Projeções de caixa incluem o saldo aberto no intervalo de datas civis,
  incluindo o próprio dia do vencimento. Baixas realizadas após o prazo mantêm
  o sinal histórico `late` no saldo, com a data do pagamento no mesmo fuso.
- Parcelas iguais são mensais a partir da âncora mais o deslocamento configurado,
  com dia limitado ao último dia de cada mês, sempre tomando o dia original como
  referência. O prazo de saldo relativo ao embarque aplica-se ao recebível BALANCE.
- Revisão reancora a condição originalmente aplicada, exigindo `{ reason }`,
  novo snapshot versionado e auditoria na mesma transação. Não troca condição,
  quantidade de parcelas ou valores. Linhas pagas ou parcialmente pagas mantêm
  seus vencimentos. Motivo integral fica no histórico imutável.
- Valores monetários usam centavos inteiros; porcentagem de entrada aceita quatro
  casas e usa produto inteiro com `BigInt` e half-up. O campo SQL que comporta tanto
  dinheiro quanto porcentagem é `NUMERIC(16,4)`; valores AMOUNT exigem duas casas,
  percentuais ficam entre zero e cem. Demais valores novos usam `NUMERIC(14,2)`.

O snapshot inclui condição, rótulos, aplicabilidade, versão, escolha efetiva,
datas de origem, total e cronograma. O histórico é insert-only com RLS forçada e
triggers de imutabilidade. O cadastro pode mudar sem reescrever snapshots.
O primeiro recebível legado sem alocação é reaproveitado; dados já pagos exigem
conciliação explícita e não são substituídos automaticamente.

O saldo é `total - soma(payment_allocations)`. `PARTIALLY_PAID` é derivado;
`settled_at` é persistido ao zerar o saldo usando o maior timestamp das baixas.
O estado comercial da venda continua com o fluxo existente de confirmação e
`mark-paid`, agora verificando todas as parcelas. Edição financeira após aplicação
é recusada; adicionar/cancelar itens também passa por essa proteção e rollback.
A alocação financeira genérica recusa recebíveis com cronograma aplicado para
preservar idempotência e política de baixa no serviço da venda.

Fora desta fase: UI, Lite, receita da agência, comissão, juros, estorno de baixa
com efeitos dependentes do ADR-007, troca de condição já aplicada, cadastro de
contas bancárias e migração dos cronogramas de demonstração em `revenues`.

Testes escritos antes da implementação: `payment-schedule.test.ts` e a estrutura
inicial de `sale-payment-schedules.test.ts`. Depois foram acrescentadas regressões
de revisão, rollback, migração e compatibilidade. Nenhum teste, Node, migration,
lint, typecheck ou build foi executado nesta entrega. O teste de integração usa
os mesmos helpers de bootstrap do teste de itens, com
`DATABASE_TEST_CONTAINER_NAME` e `DATABASE_TEST_PORT`, e recria somente o banco
local de teste validado pelos helpers. Executar sequencialmente, em ambiente
descartável autorizado, pois os helpers preservam o padrão de container compartilhado.

Correções da revisão Onda C:

- Pendências, próximos recebíveis, dashboard, atraso e projeções usam
  `GREATEST(amount - soma(payment_allocations), 0)`, com escopo de agência.
- Pagamentos recentes retornam uma linha por pagamento, valor integral da baixa,
  dados do primeiro recebível por vencimento/número/ID e limite de dez pagamentos.
- Trocar categoria de venda com cronograma aplicado retorna 409, inclusive em
  `PENDING`. A troca exige revisão explícita da condição e sua aplicabilidade;
  a rota atual de revisão apenas reancora datas e não autoriza essa troca.
- Regressões financeiras compartilham o bootstrap de
  `services/api/tests/sale-payment-schedules.test.ts`, respeitando
  `DATABASE_TEST_CONTAINER_NAME` e `DATABASE_TEST_PORT`.
  O papel runtime é preparado antes da 105, sem grants adicionais após ela.
  A FK cruzada usa categoria existente de outra agência. As corridas aguardam
  duas operações bloqueadas antes de liberar a venda. Falhas de auditoria na
  aplicação e revisão verificam rollback integral e permitem nova tentativa.

Validação desta revisão: somente leitura e inspeção estática. Testes, lint,
typecheck, build e migrations não foram executados; os gates ficam para o
responsável pela execução em banco descartável autorizado.