/**
 * HTTP errors for Travel Lite. Mirrors services/api/src/errors.ts semantics:
 * domain code + status, rendered by the shared Fastify error handler.
 */

export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(localizeHttpMessage(message));
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
  }
}

function localizeHttpMessage(message: string): string {
  const exact: Record<string, string> = {
    'A cancelled payable cannot be paid': 'Uma conta a pagar cancelada não pode ser paga',
    'A cancelled receivable cannot receive payments': 'Uma conta a receber cancelada não pode receber pagamentos',
    'A category with this name already exists': 'Já existe uma categoria com este nome',
    'A commission without a rule must be resolved before approval':
      'Uma comissão sem regra precisa ser resolvida antes da aprovação',
    'A paid sale cannot be cancelled': 'Uma venda paga não pode ser cancelada',
    'A payable already exists for this sale cost': 'Já existe uma conta a pagar para este custo da venda',
    'A record with this name already exists': 'Já existe um registro com este nome',
    'A reversal cannot be reversed': 'Um estorno não pode ser estornado',
    'A seller with this CPF already exists': 'Já existe um vendedor com este CPF',
    'A user with this e-mail already exists': 'Já existe um usuário com este e-mail',
    'Access to another seller is not allowed': 'Acesso a dados de outro vendedor não é permitido',
    'Assigning a customer to another seller requires customers.update_all':
      'Atribuir cliente a outro vendedor exige permissão de atualização completa de clientes',
    'At least one field is required': 'Informe pelo menos um campo',
    'Authentication required': 'Autenticação obrigatória',
    'Cannot assign a role above your own': 'Você não pode atribuir um perfil acima do seu',
    'Cannot manage a user above your own role': 'Você não pode gerenciar um usuário com perfil acima do seu',
    'Category not found': 'Categoria não encontrada',
    'Commission for this sale was already paid': 'A comissão desta venda já foi paga',
    'Commission not found': 'Comissão não encontrada',
    'Commission rule FIXED requires commission_fixed_amount': 'A regra de comissão fixa exige valor fixo',
    'Commission rule UNDEFINED does not accept rate or fixed amount':
      'A regra de comissão indefinida não aceita percentual nem valor fixo',
    'CSV must include a header row': 'O CSV precisa incluir uma linha de cabeçalho',
    'Customer not found': 'Cliente não encontrado',
    'Each override needs a known permission and effect GRANT or REVOKE':
      'Cada ajuste precisa de uma permissão conhecida e efeito GRANT ou REVOKE',
    'Each permission may appear only once': 'Cada permissão pode aparecer apenas uma vez',
    'Each widget needs a known key and a boolean enabled':
      'Cada widget precisa de uma chave conhecida e um indicador ativo verdadeiro ou falso',
    'Financial party not found': 'Fornecedor ou favorecido financeiro não encontrado',
    'Forbidden': 'Acesso negado',
    'Import batch is already completed': 'Este lote de importação já foi concluído',
    'Import batch not found': 'Lote de importação não encontrado',
    'Import file must include headers and at least one data row':
      'O arquivo de importação precisa incluir cabeçalhos e pelo menos uma linha de dados',
    'Import record not found': 'Registro de importação não encontrado',
    'Insufficient permissions': 'Permissões insuficientes',
    'Invalid credentials': 'Agência, e-mail ou senha inválidos',
    'Only CSV or XLSX uploads are allowed': 'Envie apenas arquivos CSV ou XLSX',
    'Password change is not required': 'A troca de senha não é necessária',
    'Payment amount must be greater than zero': 'O valor do pagamento deve ser maior que zero',
    'Payment has already been reversed': 'Este pagamento já foi estornado',
    'Payment has no single allocation to reverse': 'Este pagamento não tem uma alocação única para estornar',
    'Payment not found': 'Pagamento não encontrado',
    'Payable is already fully paid': 'Esta conta a pagar já está totalmente paga',
    'Payable not found': 'Conta a pagar não encontrada',
    'Receivable is already fully paid': 'Esta conta a receber já está totalmente paga',
    'Receivable not found': 'Conta a receber não encontrada',
    'Record not found': 'Registro não encontrado',
    'Request body must be an object': 'O corpo da requisição deve ser um objeto',
    'Resource not found': 'Recurso não encontrado',
    'Reversal would make the paid amount negative': 'O estorno deixaria o valor pago negativo',
    'Sale cost not found': 'Custo da venda não encontrado',
    'Sale has received payments and cannot be cancelled': 'A venda recebeu pagamentos e não pode ser cancelada',
    'Sale is already cancelled': 'A venda já está cancelada',
    'Sale not found': 'Venda não encontrada',
    'Selected customer has a different birth date': 'O cliente selecionado possui outra data de nascimento',
    'Selected sheet was not found in the XLSX file': 'A aba selecionada não foi encontrada no arquivo XLSX',
    'Seller not found': 'Vendedor não encontrado',
    'Sales can only be registered for your own seller': 'Vendas só podem ser registradas para o seu próprio vendedor',
    'Status changes go through confirm/cancel': 'Mudanças de status devem usar confirmar ou cancelar',
    'The content does not match the informed image type': 'O conteúdo não corresponde ao tipo de imagem informado',
    'This role already has every permission': 'Este perfil já possui todas as permissões',
    'This seller is already linked to another user': 'Este vendedor já está vinculado a outro usuário',
    'This user is already linked to another seller': 'Este usuário já está vinculado a outro vendedor',
    'Total sale costs must not exceed gross_amount': 'O total de custos não pode exceder o valor bruto da venda',
    'User is not linked to a seller': 'Usuário não está vinculado a um vendedor',
    'User not found': 'Usuário não encontrado',
    'XLSX file could not be read as spreadsheet data': 'O arquivo XLSX não pôde ser lido como planilha',
    'XLSX must include a header row': 'O XLSX precisa incluir uma linha de cabeçalho',
    'XLSX must include at least one sheet': 'O XLSX precisa incluir pelo menos uma aba',
    'XLSX upload has invalid MIME type': 'O envio XLSX possui tipo de arquivo inválido',
    'You cannot change a permission you do not hold': 'Você não pode alterar uma permissão que não possui',
    'You cannot change your own permissions': 'Você não pode alterar suas próprias permissões',
    'You cannot change your own role or status': 'Você não pode alterar seu próprio perfil ou status',
    'You cannot reset your own password': 'Você não pode redefinir sua própria senha',
  };
  if (exact[message]) return exact[message];

  const fieldMessage = translateFieldMessage(message);
  if (fieldMessage) return fieldMessage;

  return message
    .replace(/^Requires permission (.+)$/u, 'Permissão necessária: $1')
    .replace(/^Payment amount exceeds the remaining balance \((.+)\)$/u, 'O pagamento excede o saldo restante ($1)')
    .replace(/^Only DRAFT sales can be confirmed \(current: (.+)\)$/u, 'Somente vendas em rascunho podem ser confirmadas (atual: $1)')
    .replace(/^Only DRAFT sales can receive new costs$/u, 'Somente vendas em rascunho podem receber novos custos')
    .replace(/^Only DRAFT sales can be edited$/u, 'Somente vendas em rascunho podem ser editadas')
    .replace(/^Only PENDING commissions can be approved \(current: (.+)\)$/u, 'Somente comissões pendentes podem ser aprovadas (atual: $1)')
    .replace(/^A (.+) commission cannot be overridden$/u, 'Uma comissão $1 não pode ser sobrescrita')
    .replace(/^Only a MASTER can change (.+)$/u, 'Somente um MASTER pode alterar $1')
    .replace(/^You cannot change a permission you do not hold \((.+)\)$/u, 'Você não pode alterar uma permissão que não possui ($1)')
    .replace(/^Commission rule (.+) requires commission_rate$/u, 'A regra de comissão $1 exige percentual de comissão');
}

function translateFieldMessage(message: string): string | null {
  const prefix = /^Field ([\w_]+) /u.exec(message);
  if (!prefix) return null;
  const field = prefix[1];
  const rest = message.slice(prefix[0].length);
  const label = `O campo ${field}`;

  if (rest === 'is required') return `${label} é obrigatório`;
  if (rest === 'is required and must be a string') return `${label} é obrigatório e deve ser texto`;
  if (rest === 'is required and must be one of: ' + message.split('one of: ')[1]) {
    return `${label} é obrigatório e deve ser um destes valores: ${message.split('one of: ')[1]}`;
  }
  if (rest === 'must be a string') return `${label} deve ser texto`;
  if (rest === 'must be a number') return `${label} deve ser numérico`;
  if (rest === 'must be an integer') return `${label} deve ser um número inteiro`;
  if (rest === 'must be a boolean') return `${label} deve ser verdadeiro ou falso`;
  if (rest === 'must be a valid UUID') return `${label} deve ser um identificador válido`;
  if (rest === 'must be a valid CPF') return `${label} deve ser um CPF válido`;
  if (rest === 'must not exceed gross_amount') return `${label} não pode exceder o valor bruto da venda`;
  if (rest === 'must not be negative') return `${label} não pode ser negativo`;
  if (rest === 'must have at most 2 decimal places') return `${label} deve ter no máximo 2 casas decimais`;
  if (rest === 'must be greater than zero') return `${label} deve ser maior que zero`;
  if (rest === 'must be a date in YYYY-MM-DD format') return `${label} deve ser uma data no formato AAAA-MM-DD`;
  if (rest === 'must reference an existing record of this tenant') {
    return `${label} deve referenciar um registro existente deste ambiente`;
  }
  if (rest === 'must reference an OUT financial category of this tenant') {
    return `${label} deve referenciar uma categoria financeira de saída deste ambiente`;
  }
  if (rest === 'must reference an existing customer') return `${label} deve referenciar um cliente existente`;
  if (rest === 'must reference a user of this tenant') return `${label} deve referenciar um usuário deste ambiente`;
  if (rest === 'must be an existing role') return `${label} deve ser um perfil existente`;
  if (rest === 'must be an array') return `${label} deve ser uma lista`;

  const atMostChars = /^must be at most (\d+) characters$/u.exec(rest);
  if (atMostChars) return `${label} deve ter no máximo ${atMostChars[1]} caracteres`;
  const atLeastChars = /^must be at least (\d+) characters$/u.exec(rest);
  if (atLeastChars) return `${label} deve ter pelo menos ${atLeastChars[1]} caracteres`;
  const oneOf = /^must be one of: (.+)$/u.exec(rest);
  if (oneOf) return `${label} deve ser um destes valores: ${oneOf[1]}`;
  const min = /^must be at least (.+)$/u.exec(rest);
  if (min) return `${label} deve ser pelo menos ${min[1]}`;
  const max = /^must be at most (.+)$/u.exec(rest);
  if (max) return `${label} deve ser no máximo ${max[1]}`;

  return null;
}

export class ValidationError extends HttpError {
  constructor(message: string) {
    super(400, 'VALIDATION_ERROR', message);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Insufficient permissions') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Resource not found') {
    super(404, 'NOT_FOUND', message);
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}
