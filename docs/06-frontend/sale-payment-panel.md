# Pagamento no detalhe da venda Full — Onda C

O painel `SalePaymentPanel` integra a `SaleSummaryPage`, em
`apps/agency/src/pages/SalesJourneyPages.tsx`. Usa o helper `request` já existente,
componentes de UI do Full, `formatBRL`, `formatDateBR` e `parseMoneyInput`.
O papel é consultado pelo mecanismo existente `useCurrentUser`.

## Decisões da interface

- A API não possui rota de prévia. A interface calcula uma prévia indicativa
  conforme o contrato: centavos inteiros, resíduo na última parcela, meses
  ancorados no dia original e entrada percentual com half-up. Não envia valores
  calculados ao backend. A aplicação envia apenas condição, quantidade e forma;
  aplicabilidade por categoria/produtos é validada pelo servidor.
- `DOWN_PAYMENT_PLUS_BALANCE` envia `installments: 1`; não representa o saldo
  livre como quantidade fixa de parcelas. A entrada vence na data da venda.
- O formulário recebe data civil da baixa e envia meia-noite com offset `-03:00`,
  seguindo a referência `America/Sao_Paulo` desta fase. Não solicita horário.
  Vencimentos são exibidos como datas civis, sem deslocamento pelo navegador.
- Baixas são livres, distribuídas pelo backend por vencimento. O formulário
  valida valor positivo, duas casas decimais, limite do saldo, data e forma.
  A política de quitação integral de parcelas é informada e validada pelo backend.
- Cada nova tentativa recebe `crypto.randomUUID()`. Falha de rede, timeout ou erro
  5xx preserva payload e chave no painel aberto, bloqueando edição até reenvio.
  Respostas 4xx definitivas permitem corrigir os dados numa nova tentativa.
  A tentativa não é persistida ao recarregar ou sair da página.
- Depois de uma baixa, consulta `/balance`: replay idempotente pode devolver
  saldo histórico. Falha nessa leitura não reenvia o pagamento confirmado;
  impede nova baixa até atualizar o saldo. O resumo financeiro vizinho também
  é recarregado após operações.
- Leitura e cobrança exigem MANAGER/ADMIN/OWNER na apresentação. Revisão aparece
  apenas para ADMIN/OWNER, exige motivo e recalcula somente vencimentos de linhas
  sem baixa. Não troca condição, quantidade ou valores. Autorização efetiva
  continua nas rotas do backend.

## Escopo excluído

Cadastro/configuração de condições, troca de condição aplicada, baixa dirigida
a recebível, estorno, juros, alteração de status comercial da venda, comissão,
Lite, backend, migrations, acesso remoto e publicação.

## Verificação pendente

Testes foram escritos antes do código de implementação. Node, testes, lint,
typecheck e build não foram executados, por instrução expressa do usuário.
Os cenários estão em:

- `src/components/sales/SalePaymentPanel.test.tsx`: prévia 10x100, entrada 30%,
  saldo 700 com baixas de 300 e 400, excesso local/servidor, reenvio idempotente,
  falha de leitura após baixa, papéis, motivo, estados de carregamento/erro/vazio
  e integração à tela existente.
- `src/lib/paymentSchedule.test.ts`: centavos, meses, entrada e limites.
- `src/lib/salePaymentApi.test.ts`: rotas, encoding e payloads.
- `src/lib/paymentScheduleErrors.test.ts`: tradução de erros.

Comandos para o responsável pelos gates, a partir da raiz (não executados):

```powershell
npm run test --workspace=@travel-platform/agency -- src/components/sales/SalePaymentPanel.test.tsx src/lib/paymentSchedule.test.ts src/lib/salePaymentApi.test.ts src/lib/paymentScheduleErrors.test.ts src/pages/SalesJourneyPages.test.tsx
npm run lint --workspace=@travel-platform/agency
npm run typecheck --workspace=@travel-platform/agency
npm run test --workspace=@travel-platform/agency
npm run build --workspace=@travel-platform/agency
```
