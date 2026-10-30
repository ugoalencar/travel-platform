// Translates the backend's raw error message (services/api/src/errors.ts
// throws ValidationError/NotFoundError/ConflictError/etc with English
// text everywhere -- ~680 distinct messages across the whole API,
// confirmed by a full grep sweep) into pt-BR for display, at the single
// point every fetch response's error body is read. Reported directly:
// "a tradução precisa em todo sistema tem lugares ainda com inglês" --
// translating all ~680 backend strings individually isn't tractable, but
// they follow a small set of consistent templates (Field "x" is
// required, "X not found", ...), so this pattern-matches those instead.
// Field names (customerId, tripId, ...) are left as-is, same as most
// pt-BR software leaves technical identifiers untranslated.
// Falls through to the original English message if nothing matches --
// strictly better than throwing on an unrecognized message.

const ENTITY_LABELS: Record<string, string> = {
  Customer: 'Cliente',
  Dependent: 'Dependente',
  Employee: 'Funcionário',
  Sale: 'Venda',
  Proposal: 'Proposta',
  Wish: 'Desejo',
  Offer: 'Oferta',
  Booking: 'Reserva',
  Trip: 'Viagem',
  Opportunity: 'Oportunidade',
  Task: 'Tarefa',
  Pipeline: 'Pipeline',
  Stage: 'Etapa',
  Payment: 'Pagamento',
  Receivable: 'Conta a receber',
  Payable: 'Conta a pagar',
  Commission: 'Comissão',
  'Commission plan': 'Plano de comissão',
  Invitation: 'Convite',
  User: 'Usuário',
  Agency: 'Agência',
  Asset: 'Arquivo',
  Automation: 'Automação',
  Campaign: 'Campanha',
  Coupon: 'Cupom',
  Document: 'Documento',
  'Cost center': 'Centro de custo',
  Category: 'Categoria',
  Department: 'Departamento',
  Supplier: 'Fornecedor',
  'Air service': 'Serviço aéreo',
  'Land service': 'Serviço terrestre',
  'Scheduled departure': 'Partida programada',
  Deduction: 'Desconto',
  'Payroll entry': 'Folha de pagamento',
  Interaction: 'Interação',
  Publication: 'Publicação',
  Partner: 'Parceiro',
  Contract: 'Contrato',
  Template: 'Modelo',
  'Enrollment link': 'Link de cadastro',
  Submission: 'Envio',
  Revenue: 'Receita',
  Expense: 'Despesa',
  'Travel product': 'Produto de viagem',
};

const TYPE_LABELS: Record<string, string> = {
  string: 'um texto',
  number: 'um número',
  boolean: 'verdadeiro ou falso',
  array: 'uma lista',
  object: 'um objeto',
};

const EXACT_MESSAGES: Record<string, string> = {
  'Only interest-free conditions are supported': 'Somente condições sem juros são permitidas.',
  'Money must fit NUMERIC(14,2) without rounding': 'Informe um valor com até duas casas decimais e dentro do limite permitido.',
  'Invalid civil date': 'Informe uma data válida.',
  'Date outside supported range': 'A data está fora do intervalo permitido.',
  'maxInstallments must be between 1 and 999': 'A quantidade de parcelas deve estar entre 1 e 999.',
  'Invalid deadline offset': 'O prazo da condição é inválido.',
  'Invalid entry percentage': 'O percentual de entrada é inválido.',
  'Entry must be positive': 'A entrada deve ser positiva.',
  'NONE entry must have zero value': 'Uma condição sem entrada deve ter entrada de valor zero.',
  'Entry configuration is required': 'A configuração da entrada é obrigatória.',
  'Entry is only supported with DOWN_PAYMENT_PLUS_BALANCE': 'A entrada exige uma condição de entrada e saldo.',
  'Sale total must be positive': 'O total da venda deve ser positivo.',
  'Travel start is required': 'A data de embarque é obrigatória para esta condição.',
  'Installment limit exceeded': 'A quantidade de parcelas excede os limites da condição.',
  'Free balance is not a fixed installment plan': 'Entrada e saldo não usam quantidade fixa de parcelas.',
  'Entry must be positive and smaller than total': 'A entrada deve ser positiva e menor que o total.',
  'Condition applicability contains an invalid reference': 'A condição possui categoria ou produto inválido.',
  'Sale is not open for collection': 'Esta venda não está aberta para cobrança.',
  'Sale already has an applied condition': 'Esta venda já possui uma condição aplicada. Atualize o saldo.',
  'Payment condition not found or inactive': 'A condição de pagamento não existe ou está inativa.',
  'Payment condition is not applicable to this sale or method': 'A condição não se aplica a esta venda ou forma de pagamento.',
  'Payment condition is not applicable to every sale item': 'A condição não se aplica a todos os itens da venda.',
  'Existing receivables require explicit reconciliation': 'Os recebíveis existentes exigem conciliação antes de aplicar o cronograma.',
  'Payment must be positive': 'O valor da baixa deve ser positivo.',
  'Idempotency key was already used with a different payload': 'Esta tentativa de baixa já foi usada com outros dados. Atualize o saldo antes de continuar.',
  'Apply a payment condition before collecting sale payments': 'Aplique uma condição de pagamento antes de registrar baixas.',
  'Payment method is not applicable': 'A forma de pagamento não é permitida nesta condição.',
  'Payment exceeds sale balance': 'A baixa excede o saldo da venda.',
  'Payment exceeds selected receivable balance': 'A baixa excede o saldo da parcela selecionada.',
  'Partial payments are not allowed': 'Esta condição não permite baixa parcial de uma parcela.',
  'No receivable available for allocation': 'Não existe parcela disponível para receber esta baixa.',
  'No payment condition to revise': 'Esta venda não possui condição de pagamento para revisar.',
  'Revision cannot change obligation amounts': 'A revisão não pode alterar os valores das parcelas.',
  'paid_at must be an ISO timestamp with timezone': 'A data da baixa deve incluir um fuso horário válido.',
  'Request body must be an object': 'O corpo da requisição deve ser um objeto',
  'At least one field must be provided': 'Pelo menos um campo deve ser fornecido',
  'Not found': 'Não encontrado',
  'Too many requests': 'Muitas requisições. Tente novamente em instantes.',
  'Request failed.': 'Falha na requisição.',
  Unauthorized: 'Não autorizado',
  Forbidden: 'Acesso negado',
};

export function translateApiErrorMessage(message: string): string {
  if (!message) return message;
  if (EXACT_MESSAGES[message]) return EXACT_MESSAGES[message];

  let m = message.match(/^Field "([^"]+)" is required and must be a non-empty string$/);
  if (m) return `O campo "${m[1]}" é obrigatório e deve ser um texto não vazio`;

  m = message.match(/^Field "([^"]+)" must be a non-empty string$/);
  if (m) return `O campo "${m[1]}" deve ser um texto não vazio`;

  m = message.match(/^Field "([^"]+)" is required$/);
  if (m) return `O campo "${m[1]}" é obrigatório`;

  m = message.match(/^Field "([^"]+)" must not be empty$/);
  if (m) return `O campo "${m[1]}" não pode estar vazio`;

  m = message.match(/^Field "([^"]+)" must not be negative$/);
  if (m) return `O campo "${m[1]}" não pode ser negativo`;

  m = message.match(/^Field "([^"]+)" must be a valid \w+$/);
  if (m) return `O campo "${m[1]}" contém um valor inválido`;

  m = message.match(/^Field "([^"]+)" must be a (string|number|boolean|array|object)$/);
  if (m) return `O campo "${m[1]}" deve ser ${TYPE_LABELS[m[2] as string]}`;

  m = message.match(/^Field "([^"]+)" (.+)$/);
  if (m) return `Campo "${m[1]}": ${m[2]}`;

  m = message.match(/^([A-Za-z][A-Za-z ]*?) not found$/);
  if (m) {
    const entity = ENTITY_LABELS[m[1] as string] ?? m[1];
    return `${entity} não encontrado(a)`;
  }

  return message;
}
