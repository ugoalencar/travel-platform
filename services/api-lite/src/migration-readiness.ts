/**
 * Migration readiness (Lite → Full): read-only audit of the current
 * tenant's data against docs/travel-lite/product-experience/
 * MIGRATION-READINESS.md. Produces a report of pending items, each with
 * problem, affected entity, impact, recommended action and who can fix it,
 * in the severities BLOCKER (blocks migration), WARNING (migrates only
 * after human validation) and INFO (no mandatory action).
 *
 * Every query is a SELECT scoped to the tenant (RLS GUC + explicit
 * tenant_id); no row values other than counts leave this module — e-mails,
 * CPFs and slugs are validated in memory and only aggregated.
 */
import { parseSlug } from './branding';
import type { TenantClient } from './database';
import { isValidCpf, normalizeCpf } from './validation/cpf';

export type ReadinessSeverity = 'BLOCKER' | 'WARNING' | 'INFO';

export type ReadinessCheckId =
  | 'tenant_identity'
  | 'users_email'
  | 'users_master'
  | 'sellers_linked'
  | 'customers_cpf'
  | 'sales_status'
  | 'ledger_balance'
  | 'commissions_state'
  | 'outbox_health';

export type ReadinessCheckStatus = 'OK' | 'ATTENTION' | 'BLOCKED';

export interface ReadinessFinding {
  id: string;
  check: ReadinessCheckId;
  severity: ReadinessSeverity;
  problem: string;
  entity: string;
  affected: number;
  impact: string;
  action: string;
  owner: string;
}

export interface MigrationReadinessReport {
  generatedAt: string;
  ready: boolean;
  summary: { blockers: number; warnings: number; infos: number };
  checks: Array<{ id: ReadinessCheckId; label: string; status: ReadinessCheckStatus }>;
  findings: ReadinessFinding[];
  totals: {
    users: { active: number; inactive: number; masterActive: number; sellerLoginsActive: number; sellerLoginsUnlinked: number };
    sellers: { total: number; active: number; withoutCommissionRule: number };
    customers: { total: number; invalidCpf: number };
    sales: { total: number; draft: number; confirmed: number; partiallyPaid: number; paid: number; cancelled: number; confirmedWithoutReceivables: number };
    receivables: { total: number; open: number; partiallyPaid: number; paid: number; cancelled: number; paidMismatch: number };
    payables: { total: number; open: number; partiallyPaid: number; paid: number; cancelled: number; paidMismatch: number };
    payments: { total: number; reversals: number; withoutAllocation: number };
    commissions: { total: number; pendingRule: number; pending: number; approved: number; paid: number; cancelled: number };
    outbox: { total: number; pending: number; sent: number; failed: number };
  };
}

const CHECK_LABELS: ReadonlyArray<{ id: ReadinessCheckId; label: string }> = [
  { id: 'tenant_identity', label: 'Tenant com nome e slug válidos' },
  { id: 'users_email', label: 'Usuários ativos com e-mail válido' },
  { id: 'users_master', label: 'Pelo menos um usuário MASTER ativo' },
  { id: 'sellers_linked', label: 'Vendedores vinculados quando necessário' },
  { id: 'customers_cpf', label: 'Clientes sem CPF inválido' },
  { id: 'sales_status', label: 'Vendas com status válido' },
  { id: 'ledger_balance', label: 'Recebíveis e pagamentos balanceados' },
  { id: 'commissions_state', label: 'Comissões sem estado impossível' },
  { id: 'outbox_health', label: 'Outbox sem falhas críticas pendentes' },
];

const ACTIVE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SALE_STATUSES = ['DRAFT', 'CONFIRMED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'];
const OPEN_SALE_STATUSES = ['CONFIRMED', 'PARTIALLY_PAID', 'PAID'];
const COMMISSION_STATUSES = ['PENDING_RULE', 'PENDING', 'APPROVED', 'PAID', 'CANCELLED'];

interface FindingDraft {
  id: string;
  check: ReadinessCheckId;
  severity: ReadinessSeverity;
  problem: string;
  entity: string;
  impact: string;
  action: string;
  owner: string;
  affected: number;
}

/**
 * Counts rows of `table` whose paid_amount differs from the net sum of
 * their payment allocations. A payment counts unless it has been reversed
 * (reversePayment lowers paid_amount directly and the reversal row — not
 * the original — carries reversal_of_payment_id).
 */
function paidMismatchCountSql(table: 'receivables' | 'payables', targetColumn: 'receivable_id' | 'payable_id') {
  return `SELECT count(*)::int AS mismatched FROM ${table} r
   WHERE r.tenant_id = $1
     AND r.paid_amount <> COALESCE((
       SELECT SUM(CASE WHEN EXISTS (
         SELECT 1 FROM payments q
          WHERE q.tenant_id = a.tenant_id AND q.reversal_of_payment_id = a.payment_id
       ) THEN 0 ELSE a.amount END)
         FROM payment_allocations a
        WHERE a.tenant_id = r.tenant_id AND a.${targetColumn} = r.id
     ), 0::numeric)`;
}

export async function buildMigrationReadiness(
  client: TenantClient,
  tenantId: string,
): Promise<MigrationReadinessReport> {
  const drafts: FindingDraft[] = [];
  const add = (draft: Omit<FindingDraft, 'affected'>, affected: number): void => {
    if (affected > 0) drafts.push({ ...draft, affected });
  };

  const tenant = await client.query<{ name: string; slug: string }>(
    'SELECT name, slug FROM tenants WHERE id = $1',
    [tenantId],
  );
  const tenantRow = tenant.rows[0];
  add(
    {
      id: 'TENANT_NAME_INVALID',
      check: 'tenant_identity',
      severity: 'BLOCKER',
      problem: 'O nome do tenant está vazio ou só com espaços.',
      entity: 'tenant',
      impact: 'O tenant não pode ser identificado nem importado no ambiente completo.',
      action: 'Preencher um nome válido para o tenant antes da migração.',
      owner: 'MASTER',
    },
    tenantRow && tenantRow.name.trim().length === 0 ? 1 : 0,
  );
  add(
    {
      id: 'TENANT_SLUG_INVALID',
      check: 'tenant_identity',
      severity: 'BLOCKER',
      problem: 'O slug do tenant está vazio ou fora do padrão canônico (minúsculas, números e hífen).',
      entity: 'tenant',
      impact: 'O slug é a chave de identificação do tenant no login e na importação; sem ele a migração falha.',
      action: 'Corrigir o slug para o formato canônico (por exemplo, "minha-agencia").',
      owner: 'MASTER',
    },
    tenantRow && parseSlug(tenantRow.slug) !== tenantRow.slug ? 1 : 0,
  );

  const users = await client.query<{ email: string; role: string; status: string }>(
    'SELECT email, role, status FROM users WHERE tenant_id = $1',
    [tenantId],
  );
  const activeUsers = users.rows.filter((row) => row.status === 'ACTIVE');
  const invalidEmails = activeUsers.filter((row) => !ACTIVE_EMAIL_RE.test(row.email)).length;
  const masterActive = activeUsers.filter((row) => row.role === 'MASTER').length;
  const sellerLoginsActive = activeUsers.filter((row) => row.role === 'SELLER').length;
  const inactiveUsers = users.rows.length - activeUsers.length;

  add(
    {
      id: 'USERS_INVALID_EMAIL',
      check: 'users_email',
      severity: 'WARNING',
      problem: 'Há usuários ativos com e-mail em formato inválido.',
      entity: 'users',
      impact: 'Esses usuários não podem ser recriados como membros com acesso no ambiente completo.',
      action: 'Corrigir os e-mails dos usuários afetados ou desativá-los.',
      owner: 'MASTER',
    },
    invalidEmails,
  );
  add(
    {
      id: 'USERS_NO_ACTIVE_MASTER',
      check: 'users_master',
      severity: 'BLOCKER',
      problem: 'Nenhum usuário ativo com perfil MASTER.',
      entity: 'users',
      impact: 'Sem MASTER não há conta administrativa para validar e operar o ambiente migrado.',
      action: 'Promover um usuário ativo ao perfil MASTER (ou reativar o MASTER existente).',
      owner: 'MASTER',
    },
    masterActive === 0 ? 1 : 0,
  );

  const unlinked = await client.query<{ unlinked: number }>(
    `SELECT count(*)::int AS unlinked FROM users u
      WHERE u.tenant_id = $1 AND u.status = 'ACTIVE' AND u.role = 'SELLER'
        AND NOT EXISTS (
          SELECT 1 FROM sellers s WHERE s.tenant_id = u.tenant_id AND s.user_id = u.id
        )`,
    [tenantId],
  );
  const sellerLoginsUnlinked = unlinked.rows[0]?.unlinked ?? 0;
  add(
    {
      id: 'SELLER_LOGINS_UNLINKED',
      check: 'sellers_linked',
      severity: 'WARNING',
      problem: 'Logins de vendedor ativos sem cadastro de vendedor vinculado.',
      entity: 'sellers',
      impact: 'Esses logins operam sem carteira (acesso vazio) e migrariam como logins inutilizáveis.',
      action: 'Vincular cada login de vendedor ao cadastro correspondente ou desativar o login.',
      owner: 'MASTER',
    },
    sellerLoginsUnlinked,
  );

  const sellers = await client.query<{ total: number; active: number; without_rule: number }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status = 'ACTIVE')::int AS active,
            count(*) FILTER (WHERE status = 'ACTIVE' AND commission_rule_type = 'UNDEFINED')::int AS without_rule
       FROM sellers WHERE tenant_id = $1`,
    [tenantId],
  );
  const sellersRow = sellers.rows[0]!;
  add(
    {
      id: 'SELLERS_NO_COMMISSION_RULE',
      check: 'sellers_linked',
      severity: 'WARNING',
      problem: 'Vendedores ativos sem regra de comissão definida.',
      entity: 'sellers',
      impact: 'As vendas desses vendedores geram comissões PENDING_RULE, que migram sem valor calculado.',
      action: 'Definir a regra de comissão dos vendedores afetados.',
      owner: 'ADMIN ou MANAGER',
    },
    sellersRow.without_rule,
  );

  const customers = await client.query<{ total: number }>(
    'SELECT count(*)::int AS total FROM customers WHERE tenant_id = $1',
    [tenantId],
  );
  const customerCpfs = await client.query<{ cpf: string }>(
    "SELECT cpf FROM customers WHERE tenant_id = $1 AND cpf IS NOT NULL AND btrim(cpf) <> ''",
    [tenantId],
  );
  const invalidCpf = customerCpfs.rows.filter((row) => !isValidCpf(normalizeCpf(row.cpf))).length;
  add(
    {
      id: 'CUSTOMERS_INVALID_CPF',
      check: 'customers_cpf',
      severity: 'WARNING',
      problem: 'Clientes com CPF presente porém inválido (formato ou dígitos verificadores).',
      entity: 'customers',
      impact: 'CPFs inválidos exigem revisão manual antes da importação e podem ser rejeitados na validação do ambiente completo.',
      action: 'Corrigir ou limpar o CPF dos clientes afetados.',
      owner: 'ADMIN ou MANAGER',
    },
    invalidCpf,
  );

  const sales = await client.query<{
    total: number;
    draft: number;
    confirmed: number;
    partially_paid: number;
    paid: number;
    cancelled: number;
    invalid_status: number;
    confirmed_without_receivables: number;
  }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status = 'DRAFT')::int AS draft,
            count(*) FILTER (WHERE status = 'CONFIRMED')::int AS confirmed,
            count(*) FILTER (WHERE status = 'PARTIALLY_PAID')::int AS partially_paid,
            count(*) FILTER (WHERE status = 'PAID')::int AS paid,
            count(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled,
            count(*) FILTER (WHERE status <> ALL($2::text[]))::int AS invalid_status,
            count(*) FILTER (WHERE status = ANY($3::text[])
              AND NOT EXISTS (
                SELECT 1 FROM receivables r WHERE r.tenant_id = s.tenant_id AND r.sale_id = s.id
              ))::int AS confirmed_without_receivables
       FROM sales s WHERE s.tenant_id = $1`,
    [tenantId, SALE_STATUSES, OPEN_SALE_STATUSES],
  );
  const salesRow = sales.rows[0]!;
  add(
    {
      id: 'SALES_INVALID_STATUS',
      check: 'sales_status',
      severity: 'BLOCKER',
      problem: 'Vendas com status fora dos valores permitidos.',
      entity: 'sales',
      impact: 'Estado de venda desconhecido impede a importação consistente das vendas.',
      action: 'Revisar e corrigir o status dessas vendas.',
      owner: 'ADMIN ou MANAGER',
    },
    salesRow.invalid_status,
  );
  add(
    {
      id: 'SALES_CONFIRMED_WITHOUT_RECEIVABLES',
      check: 'sales_status',
      severity: 'WARNING',
      problem: 'Vendas confirmadas, parcialmente pagas ou pagas sem recebíveis vinculados.',
      entity: 'sales',
      impact: 'O histórico de recebimento da venda fica incompleto e os totais financeiros divergem após a migração.',
      action: 'Regenerar as parcelas da venda ou revisar o status da venda.',
      owner: 'ADMIN ou MANAGER',
    },
    salesRow.confirmed_without_receivables,
  );

  const receivables = await client.query<{
    total: number;
    open: number;
    partially_paid: number;
    paid: number;
    cancelled: number;
  }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status = 'OPEN')::int AS open,
            count(*) FILTER (WHERE status = 'PARTIALLY_PAID')::int AS partially_paid,
            count(*) FILTER (WHERE status = 'PAID')::int AS paid,
            count(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled
       FROM receivables WHERE tenant_id = $1`,
    [tenantId],
  );
  const receivablesRow = receivables.rows[0]!;
  const receivableMismatch = await client.query<{ mismatched: number }>(
    paidMismatchCountSql('receivables', 'receivable_id'),
    [tenantId],
  );
  const receivableMismatchCount = receivableMismatch.rows[0]?.mismatched ?? 0;
  add(
    {
      id: 'RECEIVABLES_PAID_MISMATCH',
      check: 'ledger_balance',
      severity: 'BLOCKER',
      problem: 'Recebíveis cujo valor pago não corresponde ao total líquido das alocações de pagamento.',
      entity: 'receivables',
      impact: 'O razão financeiro migra desbalanceado, com saldos de recebimento incorretos no ambiente completo.',
      action: 'Reconciliar manualmente pagamentos, estornos e valores pagos desses recebíveis.',
      owner: 'ADMIN ou MANAGER',
    },
    receivableMismatchCount,
  );

  const payables = await client.query<{
    total: number;
    open: number;
    partially_paid: number;
    paid: number;
    cancelled: number;
  }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status = 'OPEN')::int AS open,
            count(*) FILTER (WHERE status = 'PARTIALLY_PAID')::int AS partially_paid,
            count(*) FILTER (WHERE status = 'PAID')::int AS paid,
            count(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled
       FROM payables WHERE tenant_id = $1`,
    [tenantId],
  );
  const payablesRow = payables.rows[0]!;
  const payableMismatch = await client.query<{ mismatched: number }>(
    paidMismatchCountSql('payables', 'payable_id'),
    [tenantId],
  );
  const payableMismatchCount = payableMismatch.rows[0]?.mismatched ?? 0;
  add(
    {
      id: 'PAYABLES_PAID_MISMATCH',
      check: 'ledger_balance',
      severity: 'BLOCKER',
      problem: 'Pagamentos a fornecedores cujo valor pago não corresponde ao total líquido das alocações de pagamento.',
      entity: 'payables',
      impact: 'O razão financeiro migra desbalanceado, com saldos de pagamento incorretos no ambiente completo.',
      action: 'Reconciliar manualmente pagamentos, estornos e valores pagos desses pagamentos a fornecedores.',
      owner: 'ADMIN ou MANAGER',
    },
    payableMismatchCount,
  );

  const payments = await client.query<{ total: number; reversals: number; without_allocation: number }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE reversal_of_payment_id IS NOT NULL)::int AS reversals,
            count(*) FILTER (WHERE reversal_of_payment_id IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM payment_allocations a WHERE a.tenant_id = p.tenant_id AND a.payment_id = p.id
              ))::int AS without_allocation
       FROM payments p WHERE p.tenant_id = $1`,
    [tenantId],
  );
  const paymentsRow = payments.rows[0]!;
  add(
    {
      id: 'PAYMENTS_WITHOUT_ALLOCATION',
      check: 'ledger_balance',
      severity: 'WARNING',
      problem: 'Pagamentos que não são estorno e não têm nenhuma alocação de valor.',
      entity: 'payments',
      impact: 'Movimento registrado sem aplicação em recebível ou payable; o valor cobrado/pago diverge do aplicado.',
      action: 'Revisar esses pagamentos e associá-los ao lançamento correto (ou estorná-los).',
      owner: 'ADMIN ou MANAGER',
    },
    paymentsRow.without_allocation,
  );

  const commissions = await client.query<{
    total: number;
    pending_rule: number;
    pending: number;
    approved: number;
    paid: number;
    cancelled: number;
    invalid_status: number;
    value_violation: number;
    approved_without_payable: number;
    on_cancelled_sale: number;
  }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status = 'PENDING_RULE')::int AS pending_rule,
            count(*) FILTER (WHERE status = 'PENDING')::int AS pending,
            count(*) FILTER (WHERE status = 'APPROVED')::int AS approved,
            count(*) FILTER (WHERE status = 'PAID')::int AS paid,
            count(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled,
            count(*) FILTER (WHERE status <> ALL($2::text[]))::int AS invalid_status,
            count(*) FILTER (WHERE (status <> 'PENDING_RULE' AND commission_amount IS NULL)
              OR (status = 'PENDING_RULE' AND (commission_amount IS NOT NULL OR calculation_type IS NOT NULL))
              OR (status = 'PAID' AND paid_at IS NULL))::int AS value_violation,
            count(*) FILTER (WHERE status = 'APPROVED'
              AND NOT EXISTS (
                SELECT 1 FROM payables p WHERE p.tenant_id = sc.tenant_id AND p.commission_id = sc.id
              ))::int AS approved_without_payable,
            count(*) FILTER (WHERE status <> 'CANCELLED'
              AND EXISTS (
                SELECT 1 FROM sales s WHERE s.tenant_id = sc.tenant_id AND s.id = sc.sale_id AND s.status = 'CANCELLED'
              ))::int AS on_cancelled_sale
       FROM seller_commissions sc WHERE sc.tenant_id = $1`,
    [tenantId, COMMISSION_STATUSES],
  );
  const commissionsRow = commissions.rows[0]!;
  add(
    {
      id: 'COMMISSIONS_INVALID_STATUS',
      check: 'commissions_state',
      severity: 'BLOCKER',
      problem: 'Comissões com status fora dos valores permitidos.',
      entity: 'seller_commissions',
      impact: 'Estado de comissão desconhecido impede a importação consistente das comissões.',
      action: 'Revisar e corrigir o status dessas comissões.',
      owner: 'ADMIN ou MANAGER',
    },
    commissionsRow.invalid_status,
  );
  add(
    {
      id: 'COMMISSIONS_VALUE_VIOLATION',
      check: 'commissions_state',
      severity: 'BLOCKER',
      problem: 'Comissões cujo valor ou data de pagamento contradiz o status.',
      entity: 'seller_commissions',
      impact: 'Dados de comissão incoerentes com as regras de negócio não podem ser migrados com segurança.',
      action: 'Corrigir valor, tipo de cálculo ou data de pagamento para ficar coerente com o status.',
      owner: 'ADMIN ou MANAGER',
    },
    commissionsRow.value_violation,
  );
  add(
    {
      id: 'COMMISSIONS_APPROVED_WITHOUT_PAYABLE',
      check: 'commissions_state',
      severity: 'BLOCKER',
      problem: 'Comissões aprovadas sem payable correspondente.',
      entity: 'seller_commissions',
      impact: 'A obrigação de pagamento registrada na aprovação não existe no financeiro; a migração perderia a dívida com o vendedor.',
      action: 'Revisar a aprovação: recriar o payable ou cancelar a comissão aprovada.',
      owner: 'ADMIN ou MANAGER',
    },
    commissionsRow.approved_without_payable,
  );
  add(
    {
      id: 'COMMISSIONS_ON_CANCELLED_SALE',
      check: 'commissions_state',
      severity: 'BLOCKER',
      problem: 'Comissões não canceladas vinculadas a vendas canceladas.',
      entity: 'seller_commissions',
      impact: 'Comissão de venda cancelada migraria como valor devido indevidamente ao vendedor.',
      action: 'Cancelar essas comissões.',
      owner: 'ADMIN ou MANAGER',
    },
    commissionsRow.on_cancelled_sale,
  );
  add(
    {
      id: 'COMMISSIONS_PENDING_RULE',
      check: 'commissions_state',
      severity: 'WARNING',
      problem: 'Comissões aguardando definição de regra (PENDING_RULE).',
      entity: 'seller_commissions',
      impact: 'Migram sem valor calculado e exigem recálculo depois que a regra do vendedor for definida.',
      action: 'Definir a regra de comissão dos vendedores e recalcular as comissões pendentes.',
      owner: 'ADMIN ou MANAGER',
    },
    commissionsRow.pending_rule,
  );

  const outbox = await client.query<{ total: number; pending: number; sent: number; failed: number }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status = 'PENDING')::int AS pending,
            count(*) FILTER (WHERE status = 'SENT')::int AS sent,
            count(*) FILTER (WHERE status = 'FAILED' OR sync_status = 'FAILED')::int AS failed
       FROM integration_outbox WHERE tenant_id = $1`,
    [tenantId],
  );
  const outboxRow = outbox.rows[0]!;
  add(
    {
      id: 'OUTBOX_FAILED',
      check: 'outbox_health',
      severity: 'BLOCKER',
      problem: 'Eventos do outbox com falha de processamento ou de sincronização.',
      entity: 'integration_outbox',
      impact: 'Eventos críticos ficariam perdidos entre os ambientes e o espelhamento partiria de um estado incorreto.',
      action: 'Inspecionar o último erro e reprocessar ou cancelar os eventos afetados com o suporte de implantação.',
      owner: 'MASTER',
    },
    outboxRow.failed,
  );
  add(
    {
      id: 'OUTBOX_PENDING',
      check: 'outbox_health',
      severity: 'INFO',
      problem: 'Eventos aguardando processamento no outbox.',
      entity: 'integration_outbox',
      impact: 'Sem ação obrigatória: nesta fase o Travel Lite não consome o outbox; os eventos seguem para o consumidor do ambiente completo.',
      action: 'Nenhuma ação necessária; acompanhar o processamento depois da migração.',
      owner: 'MASTER',
    },
    outboxRow.pending,
  );

  const findings: ReadinessFinding[] = drafts.map((draft) => ({ ...draft }));

  const blockers = findings.filter((finding) => finding.severity === 'BLOCKER').length;
  const warnings = findings.filter((finding) => finding.severity === 'WARNING').length;
  const infos = findings.filter((finding) => finding.severity === 'INFO').length;

  const checks = CHECK_LABELS.map(({ id, label }) => {
    const inCheck = findings.filter((finding) => finding.check === id);
    const status: ReadinessCheckStatus = inCheck.some((finding) => finding.severity === 'BLOCKER')
      ? 'BLOCKED'
      : inCheck.some((finding) => finding.severity === 'WARNING')
        ? 'ATTENTION'
        : 'OK';
    return { id, label, status };
  });

  return {
    generatedAt: new Date().toISOString(),
    ready: blockers === 0,
    summary: { blockers, warnings, infos },
    checks,
    findings,
    totals: {
      users: {
        active: activeUsers.length,
        inactive: inactiveUsers,
        masterActive,
        sellerLoginsActive,
        sellerLoginsUnlinked,
      },
      sellers: {
        total: sellersRow.total,
        active: sellersRow.active,
        withoutCommissionRule: sellersRow.without_rule,
      },
      customers: { total: customers.rows[0]?.total ?? 0, invalidCpf: invalidCpf },
      sales: {
        total: salesRow.total,
        draft: salesRow.draft,
        confirmed: salesRow.confirmed,
        partiallyPaid: salesRow.partially_paid,
        paid: salesRow.paid,
        cancelled: salesRow.cancelled,
        confirmedWithoutReceivables: salesRow.confirmed_without_receivables,
      },
      receivables: {
        total: receivablesRow.total,
        open: receivablesRow.open,
        partiallyPaid: receivablesRow.partially_paid,
        paid: receivablesRow.paid,
        cancelled: receivablesRow.cancelled,
        paidMismatch: receivableMismatchCount,
      },
      payables: {
        total: payablesRow.total,
        open: payablesRow.open,
        partiallyPaid: payablesRow.partially_paid,
        paid: payablesRow.paid,
        cancelled: payablesRow.cancelled,
        paidMismatch: payableMismatchCount,
      },
      payments: {
        total: paymentsRow.total,
        reversals: paymentsRow.reversals,
        withoutAllocation: paymentsRow.without_allocation,
      },
      commissions: {
        total: commissionsRow.total,
        pendingRule: commissionsRow.pending_rule,
        pending: commissionsRow.pending,
        approved: commissionsRow.approved,
        paid: commissionsRow.paid,
        cancelled: commissionsRow.cancelled,
      },
      outbox: {
        total: outboxRow.total,
        pending: outboxRow.pending,
        sent: outboxRow.sent,
        failed: outboxRow.failed,
      },
    },
  };
}
