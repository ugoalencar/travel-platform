export interface HelpSection {
  title: string;
  items: string[];
}

export interface HelpArticle {
  id: string;
  title: string;
  purpose: string;
  when: string;
  requiredFields: string[];
  example: string[];
  steps: string[];
  commonErrors: string[];
  sections?: HelpSection[];
  permissions: string[];
  missing: string;
  availability?: string;
  haystack: string;
}

export interface HelpFaqItem {
  question: string;
  answer: string;
  haystack: string;
}

type RawArticle = Omit<HelpArticle, 'haystack'>;
type RawFaqItem = Omit<HelpFaqItem, 'haystack'>;

function strip(value: string): string {
  const lowered = value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return lowered
    .split(/\s+/)
    .map((word) => (word.endsWith('ao') ? `${word.slice(0, -2)}oes` : word))
    .join(' ');
}

export function helpMatch(item: { haystack: string }, query: string): boolean {
  const term = strip(query.trim());
  return term.length > 0 && item.haystack.includes(term);
}

function indexArticle(article: RawArticle): HelpArticle {
  const parts = [
    article.title,
    article.purpose,
    article.when,
    article.availability ?? '',
    article.missing,
    ...article.requiredFields,
    ...article.example,
    ...article.steps,
    ...article.commonErrors,
    ...article.permissions,
    ...(article.sections ?? []).flatMap((section) => [section.title, ...section.items]),
  ];
  return { ...article, haystack: strip(parts.join(' ')) };
}

function indexFaq(item: RawFaqItem): HelpFaqItem {
  return { ...item, haystack: strip(`${item.question} ${item.answer}`) };
}

const RAW_ARTICLES: RawArticle[] = [
  {
    id: 'primeiros-passos',
    title: 'Primeiros passos',
    purpose: 'Colocar a agência no ar do zero, na ordem certa, sem depender de suporte humano.',
    when: 'Primeiro acesso do MASTER, base vazia, ou quando faltar uma etapa fundamental antes da primeira venda.',
    requiredFields: [],
    example: [
      'Conta financeira: “Banco do Brasil — CC 1234”',
      'Categoria: “Passagens aéreas”',
      'Vendedora: “Ana Souza” com 5% de comissão',
      'Cliente: “Maria Souza — (11) 98888-7777”',
      'Venda: VND-0001 de R$ 2.400,00 confirmada',
      'Ajuda aberta para consultar os erros comuns',
    ],
    steps: [
      'Cadastre os vendedores e a regra de comissão de cada um (menu Vendedores).',
      'Cadastre a conta financeira e as categorias de venda (menu Cadastros).',
      'Cadastre o primeiro cliente (menu Clientes).',
      'Registre e confirme a primeira venda (menu Vendas).',
      'Abra a Ajuda e leia “Vendas” e “Financeiro” para entender os status.',
      'Acompanhe o progresso pelo checklist “Prepare sua agência” no Dashboard, em Configurações e nesta página.',
    ],
    commonErrors: [
      'Checklist some quando todas as etapas visíveis já foram concluídas — isso é esperado.',
      'Um item não aparece se o seu perfil não tem permissão para aquela tarefa (um SELLER não vê tarefas administrativas).',
    ],
    permissions: [
      'MASTER, ADMIN e MANAGER veem todas as etapas administrativas.',
      'SELLER vê apenas as etapas de cliente, primeira venda e ajuda.',
      'O checklist nunca bloqueia o uso do sistema — pode ser ignorado.',
    ],
    missing: 'O checklist fica no Dashboard, em Configurações e no topo desta página. Se ele não aparece, sua base já está no dia zero ou o perfil não tem tarefas pendentes.',
    availability: 'Identidade visual (logo e cores) é uma etapa planejada: básica no Lite, avançada no Pro e completa no Full.',
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    purpose: 'Ver em uma tela o mês da agência: vendas, valor vendido, recebido, a receber, despesas, comissões pendentes, ranking e gráficos.',
    when: 'Consultar os números do dia a dia e acompanhar o desempenho da equipe.',
    requiredFields: ['Nenhum — o dashboard se alimenta das vendas, do financeiro e das comissões já lançadas.'],
    example: [
      'Vendas do mês: 2 · Valor vendido no mês: R$ 1.500,00',
      'Ranking: Ana Souza — 2 vendas, R$ 1.500,00 vendidos, R$ 300,00 de margem',
      'Recebido: R$ 800,00 · A receber: R$ 1.600,00',
    ],
    steps: [
      'Abra “Dashboard” no menu — os widgets vêm já calculados no seu escopo.',
      'MASTER: use “⚙ Configurar dashboard” para ordenar, ligar ou desligar indicadores (vale para toda a agência).',
      'Cada pessoa vê os mesmos widgets com os números que tem permissão para ver.',
    ],
    commonErrors: [
      'Widget faltando: pode estar desabilitado na configuração ou fora da sua permissão (widgets financeiros exigem leitura financeira).',
      'Vendedora vê apenas as próprias vendas — não é falha de dados.',
    ],
    sections: [
      {
        title: 'Nenhum indicador disponível para o seu perfil',
        items: [
          'Significa que o seu perfil não tem permissão de leitura de nenhum widget.',
          'Peça a um administrador para revisar suas permissões em Configurações › Usuários e permissões.',
        ],
      },
    ],
    permissions: [
      'Qualquer usuário autenticado abre o Dashboard.',
      'Configurar widgets: dashboard.configure (concedido apenas a MASTER).',
      'Widgets de despesas, a pagar, resultado e fluxo de caixa exigem leitura financeira.',
      'Comparativo de vendedores e fluxo de caixa nos relatórios exigem permissão de relatórios.',
    ],
    missing: 'Se um indicador não aparece: confira “⚙ Configurar dashboard” e fale com um administrador para liberar a permissão correspondente.',
    availability: 'Dashboard essencial no Lite; visão avançada no Pro e completa no Full.',
  },
  {
    id: 'clientes',
    title: 'Clientes',
    purpose: 'Cadastrar a carteira de clientes, guardar contato e definir quem é o responsável pela conta.',
    when: 'Antes de registrar a primeira venda e sempre que um novo contato fechar negócio.',
    requiredFields: [
      'Nome (obrigatório)',
      'E-mail, CPF e telefone (opcionais, mas ajudam na identificação)',
      'Responsável: preenchido automaticamente com o vendedor vinculado ao login',
    ],
    example: [
      'Nome: Maria Souza · E-mail: maria@email.com · CPF: 123.456.789-00 · Telefone: (11) 98888-7777',
      'Responsável: Ana Souza (preenchido sozinho para quem tem vendedor vinculado)',
    ],
    steps: [
      'Menu “Clientes” → “Novo cliente”.',
      'Preencha o nome e, se tiver, CPF, e-mail e telefone.',
      'Salvar. Para desativar: “Desativar” na linha do cliente (com confirmação).',
    ],
    commonErrors: [
      'Nome é obrigatório — o formulário aponta o campo em pt-BR.',
      'Cliente não aparece para a vendedora: ele pertence a outra carteira; ela vê apenas as próprias.',
      'Cliente criado antes da regra de carteira fica sem responsável e só aparece para quem tem leitura total, até um MASTER atribuir.',
    ],
    permissions: [
      'Criar: MASTER, ADMIN, MANAGER e SELLER.',
      'Ver todos os clientes: MASTER, ADMIN e MANAGER; SELLER vê apenas os próprios.',
      'Reatribuir responsável: permissão de atualizar todos os clientes (MASTER, ADMIN, MANAGER) — a troca gera registro de auditoria.',
    ],
    missing: 'Menu “Clientes” ausente ou sem botão “Novo cliente”: o perfil não tem permissão de criação — fale com um administrador da agência.',
    availability: 'Clientes fazem parte do Lite, do Pro e do Full.',
  },
  {
    id: 'vendas',
    title: 'Vendas',
    purpose: 'Lançar vendas em rascunho, confirmar (gera as parcelas a receber e a comissão), registrar custos e cancelar.',
    when: 'Toda vez que um cliente fechar negócio, e para revisar custos e parcelas antes da confirmação.',
    requiredFields: [
      'Cliente, vendedor e categoria (obrigatórios)',
      'Valor bruto, data da venda, vencimento e número de parcelas',
      'Custos diretos (opcionais, lançados no rascunho)',
    ],
    example: [
      'VND-0001 · Cliente: Maria Souza · Vendedora: Ana Souza · Categoria: Passagens aéreas',
      'Bruto: R$ 2.400,00 · 3 parcelas · 1º vencimento em 15/11/2026',
      'Custo direto: taxa de embarque R$ 120,00 → margem de R$ 2.280,00',
    ],
    steps: [
      'Menu “Vendas” → “Nova venda”.',
      'Escolha cliente, vendedor e categoria.',
      'Informe valores, vencimento e parcelas; lance os custos diretos se houver.',
      'Salvar como rascunho, revisar e “Confirmar”.',
      'Após confirmada: as parcelas aparecem em Financeiro › A receber e a comissão em Comissões.',
      'Para cancelar: abra a venda → “Cancelar venda” (a confirmação é pedida e a ação não pode ser desfeita).',
    ],
    commonErrors: [
      'Confirmar sem regra de comissão do vendedor deixa a comissão “Sem regra” — defina o percentual em Vendedores.',
      'Campos obrigatórios em falta: o formulário explica o que corrigir.',
      'Venda cancelada não pode ser reaberta; uma nova venda deve ser criada.',
    ],
    sections: [
      {
        title: 'Status das vendas',
        items: [
          'Rascunho — venda ainda editável; é aqui que você lança os custos diretos.',
          'Confirmada — gera as parcelas a receber e a comissão do vendedor.',
          'Parcial — alguma parcela já foi recebida, mas ainda falta valor.',
          'Pago — todas as parcelas foram recebidas.',
          'Cancelada — não pode ser desfeita; exige permissão para editar todas as vendas (administrador ou gerente).',
        ],
      },
    ],
    permissions: [
      'Criar venda: MASTER, ADMIN, MANAGER e SELLER.',
      'Editar ou cancelar qualquer venda: MASTER, ADMIN e MANAGER (todas as vendas).',
      'SELLER edita e cancela apenas as próprias vendas.',
      'Um login sem vendedor vinculado só vende como o próprio vendedor.',
    ],
    missing: 'Menu “Vendas” ausente: o perfil não tem permissão de criação. Sem vendedor vinculado ao login, as listas vêm vazias — peça o vínculo em Configurações.',
    availability: 'Vendas fazem parte do Lite, do Pro e do Full.',
  },
  {
    id: 'importacao',
    title: 'Importação de planilhas',
    purpose: 'Trazer clientes ou vendas em lote de um arquivo CSV ou XLSX, com validação prévia e reconciliação de pendências.',
    when: 'Migração de outro sistema ou carga inicial grande demais para cadastro manual.',
    requiredFields: [
      'Arquivo CSV ou XLSX',
      'Mapeamento das colunas do arquivo para os campos do sistema',
    ],
    example: [
      'Arquivo: clientes_2026.xlsx',
      'Colunas: “Nome completo” → nome · “CPF” → cpf · “Celular” → telefone · “E-mail” → email',
    ],
    steps: [
      'Menu “Importações” → envie o arquivo CSV ou XLSX.',
      'Associe cada coluna do arquivo ao campo correspondente.',
      'Dry-run: valida e mostra as pendências — nada é gravado ainda.',
      'Resolva as pendências linha a linha (vincular cliente existente ou ignorar a linha).',
      'Confirme para gravar.',
    ],
    commonErrors: [
      'Coluna sem mapeamento: o campo obrigatório não recebe valor e a linha fica pendente.',
      'Pendência de cliente: vincule ou ignore a linha antes de confirmar.',
      'Dry-run não grava nada — é apenas conferência.',
    ],
    permissions: ['Executar importação e reconciliar pendências: MASTER, ADMIN e MANAGER.'],
    missing: 'Menu “Importações” ausente: o perfil não tem permissão de importação — fale com um administrador.',
    availability: 'Importação CSV/XLSX no Lite é limitada; mais recursos no Pro e no Full.',
  },
  {
    id: 'financeiro',
    title: 'Financeiro',
    purpose: 'Dar baixa nas parcelas a receber, lançar e pagar despesas, estornar movimentos e acompanhar o caixa.',
    when: 'Cliente pagou; houve uma saída do caixa; uma baixa foi registrada por engano; é hora de conferir o saldo.',
    requiredFields: [
      'Receber: parcela, conta financeira, valor e data da baixa',
      'Despesa: descrição, valor, vencimento, categoria financeira e conta',
      'Estorno: motivo (obrigatório)',
    ],
    example: [
      'Baixa: parcela de R$ 800,00 da venda VND-0001 → conta “Banco do Brasil” → R$ 800,00 em 05/11/2026',
      'Despesa: “Aluguel do escritório” — R$ 1.500,00, vencimento 05/11/2026, categoria “Despesas fixas”',
    ],
    steps: [
      'Financeiro › “A receber” → “Receber” na parcela → informar conta, valor e data.',
      'Financeiro › “A pagar” → “Nova despesa” para saídas; depois “Pagar” na conta.',
      'Para corrigir: “Estornar” com motivo — o lançamento original é mantido e um movimento inverso é registrado.',
      'Saldo inicial da conta fica em Cadastros › contas financeiras; as baixas alimentam o livro-caixa.',
    ],
    commonErrors: [
      'Sem conta financeira cadastrada a baixa não pode ser registrada — cadastre em Cadastros.',
      'Estorno sem motivo é recusado.',
      'Despesa vencida aparece com o status “Vencido”.',
    ],
    permissions: [
      'Consultar listas e saldos: MASTER, ADMIN, MANAGER e VIEWER.',
      'Recebimentos, despesas, pagamentos e estornos: MASTER, ADMIN e MANAGER.',
      'Pagar uma comissão exige também a permissão de pagamento de comissões.',
    ],
    missing: 'Menu “Financeiro” ausente: falta a leitura financeira. Botões de baixa ausentes: falta a permissão de gestão financeira — um administrador pode conceder (ex.: liberar recebimento a uma vendedora).',
    availability: 'Financeiro básico no Lite; recursos ampliados no Pro e no Full.',
  },
  {
    id: 'comissoes',
    title: 'Comissões',
    purpose: 'Acompanhar, aprovar e pagar a comissão gerada em cada venda confirmada.',
    when: 'Depois de confirmar vendas e ao fechar a folha de comissão da equipe.',
    requiredFields: [
      'Regra de comissão do vendedor (percentual sobre o bruto), definida em Vendedores',
      'Para pagar: conta financeira e baixa em Financeiro › A pagar',
    ],
    example: [
      'Ana Souza com 5% sobre o bruto: venda de R$ 2.400,00 → comissão de R$ 120,00',
      'Status “Pendente” → “Aprovar” → vira conta a pagar → baixa em A pagar → status “Pago”',
    ],
    steps: [
      'Menu “Comissões” → filtre por vendedor e período.',
      'Aprove as comissões pendentes.',
      'Financeiro › “A pagar” → pagar a conta de comissão.',
    ],
    commonErrors: [
      '“Sem regra”: a venda foi confirmada sem percentual no vendedor — defina a regra em Vendedores e o valor é recalculado.',
      'Comissão aprovada mas não paga: virou conta a pagar e aguarda a baixa financeira.',
      'Venda cancelada não gera pagamento de comissão.',
    ],
    sections: [
      {
        title: 'Status das comissões',
        items: [
          'Sem regra — venda confirmada sem regra de comissão no vendedor; um administrador define a regra em Vendedores e o valor é recalculado.',
          'Pendente — valor calculado, aguardando aprovação.',
          'Aprovada — virou conta a pagar; o pagamento depende da permissão financeira.',
          'Pago — conta quitada.',
        ],
      },
    ],
    permissions: [
      'Ver: MASTER, ADMIN, MANAGER e VIEWER veem todas; SELLER vê apenas as próprias.',
      'Aprovar: MASTER, ADMIN e MANAGER.',
      'Pagar: MASTER, ADMIN e MANAGER, com permissão financeira.',
    ],
    missing: 'Sem acesso ao menu “Comissões” ou vendo apenas parte das comissões: é o escopo do seu perfil — fale com um administrador.',
    availability: 'Comissões fazem parte do Lite, do Pro e do Full.',
  },
  {
    id: 'vendedores',
    title: 'Vendedores',
    purpose: 'Cadastrar quem vende, a regra de comissão de cada um e o login vinculado.',
    when: 'Antes da primeira venda, ao contratar alguém, ou ao ajustar o percentual de comissão.',
    requiredFields: [
      'Nome (obrigatório)',
      'Regra de comissão: percentual sobre o valor bruto da venda',
      'Login vinculado (opcional; um login representa no máximo um vendedor)',
    ],
    example: ['Ana Souza · comissão 5% sobre o bruto · login vendedora@agencia.com vinculado'],
    steps: [
      'Menu “Vendedores” → “Novo vendedor”.',
      'Informe nome e regra de comissão.',
      'Para dar acesso ao sistema: Configurações → “Novo usuário” → vincule o vendedor no cadastro do usuário.',
    ],
    commonErrors: [
      'Vendedor sem regra → comissões nascem “Sem regra” nas vendas dele.',
      'Um login não pode representar dois vendedores.',
      'Venda cancelada mantém o vendedor, mas não gera comissão.',
    ],
    permissions: [
      'Ver a lista: MASTER, ADMIN, MANAGER e VIEWER.',
      'Cadastrar e editar: MASTER, ADMIN e MANAGER.',
      'Vincular usuário ao vendedor: permissão de gestão de usuários.',
    ],
    missing: 'Menu “Vendedores” ausente: falta a leitura de vendedores. Botão “Novo vendedor” ausente: falta a permissão de gestão.',
    availability: 'Vendedores fazem parte do Lite, do Pro e do Full.',
  },
  {
    id: 'configuracoes',
    title: 'Configurações e permissões',
    purpose: 'Gerir usuários, perfis, permissões exceções e quem pode executar cada ação da agência.',
    when: 'Criar um login, trocar perfil, conceder uma permissão extra, reativar ou desativar acesso.',
    requiredFields: [
      'Usuário: nome, e-mail (login), senha com no mínimo 8 caracteres e perfil',
      'Perfis: MASTER, ADMIN, MANAGER, SELLER ou VIEWER',
      'Vendedor vinculado (opcional, para quem vai vender)',
      'Exceções de permissão (diferentes do padrão do perfil) exigem permissão de gestão de permissões',
    ],
    example: [
      'Usuário “Ana Souza” · ana@agencia.com · senha forte · perfil SELLER · vendedor “Ana Souza” vinculado',
      'Exceção: conceder recebimento financeiro a uma vendedora (marcada como exceção na tela)',
    ],
    steps: [
      'Configurações → “Novo usuário”.',
      'Preencha nome, e-mail, senha e perfil; vincule o vendedor se a pessoa for vender.',
      '“Permissões” na linha do usuário para ajustar exceções — o que for diferente do padrão fica registrado como exceção.',
      '“Desativar” encerra o acesso na próxima requisição.',
    ],
    commonErrors: [
      'Ninguém altera o próprio perfil, o próprio status ou as próprias permissões — nem mesmo o MASTER.',
      'O último MASTER da agência nunca pode ser rebaixado.',
      'Ninguém concede uma permissão que não possui; permissões só MASTER só são concedidas por um MASTER.',
      'Senha com menos de 8 caracteres é recusada.',
    ],
    sections: [
      {
        title: 'Perfis e permissões',
        items: [
          'Perfis: MASTER, ADMIN, MANAGER, SELLER e VIEWER. Cada perfil tem permissões padrão, que um MASTER pode ajustar por usuário em Configurações.',
          'Se um menu não aparece, seu perfil não tem a permissão correspondente — fale com um administrador da agência.',
          'Você não tem acesso a uma área por link direto? O sistema explica o motivo e mantém o endereço na tela.',
        ],
      },
    ],
    permissions: [
      'Criar e editar usuários: MASTER (gestão de usuários).',
      'Exceções de permissão: apenas MASTER (gestão de permissões; permissões só MASTER incluem a própria gestão de permissões e a configuração do dashboard).',
      'Categorias, contas financeiras e catálogos básicos: MASTER, ADMIN e MANAGER.',
    ],
    missing: 'Menu “Configurações” ausente: o perfil não tem as permissões de gestão. Qualquer menu ou botão que não aparece significa permissão ausente — a própria tela de acesso negado explica e preserva o endereço.',
    availability: 'Identidade visual (logo e cores): planejada — básica no Lite, avançada no Pro, completa no Full.',
  },
];

const RAW_FAQ: RawFaqItem[] = [
  {
    question: 'Por que não vejo um menu ou um botão?',
    answer:
      'Cada menu e cada ação exigem uma permissão específica. Se algo não aparece, o seu perfil não tem essa permissão. Uma área aberta por link direto mostra a explicação e mantém o endereço. Peça a um administrador para conceder a permissão em Configurações › Usuários e permissões.',
  },
  {
    question: 'Como faço a primeira venda, do começo ao fim?',
    answer:
      'Cadastre vendedores com regra de comissão, conta financeira e categorias (Cadastros), cadastre o cliente, abra Vendas → Nova venda, preencha cliente, vendedor, categoria e valores, salve, revise e confirme. As parcelas vão para Financeiro › A receber e a comissão para Comissões.',
  },
  {
    question: 'Posso desfazer o cancelamento de uma venda?',
    answer:
      'Não. O cancelamento é definitivo e exige permissão para editar todas as vendas. Se precisar retomar o negócio, crie uma nova venda.',
  },
  {
    question: 'A comissão nasceu como “Sem regra”. O que fazer?',
    answer:
      'Significa que a venda foi confirmada sem percentual de comissão no vendedor. Um administrador define a regra em Vendedores e o valor é recalculado automaticamente.',
  },
  {
    question: 'A importação já gravou meus dados?',
    answer:
      'Não. O dry-run apenas valida e mostra as pendências, sem gravar nada. Os dados só entram depois que você resolve as pendências linha a linha e confirma a importação.',
  },
  {
    question: 'A vendedora não enxerga todos os clientes. É erro?',
    answer:
      'Não. Quem tem perfil de venda vê apenas a própria carteira. Atribuir cliente a outra pessoa exige permissão de atualização total e gera registro de auditoria.',
  },
  {
    question: 'Um usuário sem vendedor vinculado pode vender?',
    answer:
      'O login pode existir, mas sem vendedor vinculado as listas vêm vazias e relatórios e cadastros respondem sem dados (fail-closed). Em Configurações, vincule o usuário a um cadastro de vendedor.',
  },
  {
    question: 'Quem pode aprovar e pagar comissões?',
    answer:
      'MASTER, ADMIN e MANAGER. Quem tem perfil de venda vê apenas as próprias comissões, no estado pendente, aprovada ou paga.',
  },
  {
    question: 'Qual a diferença entre Lite, Pro e Full?',
    answer:
      'Lite atende clientes, vendas, financeiro básico, importação limitada e dashboard essencial. Pro e Full acrescentam dashboard avançado e completo, operação mobile ampliada, branding avançado e completo e integrações parciais e completas, com migração assistida para o Pro e nativa para o Full.',
  },
  {
    question: 'Posso mudar o logo e as cores da agência?',
    answer:
      'A identidade visual está planejada como etapa seguinte: básica no Lite, avançada no Pro e completa no Full. Enquanto isso, opere com as configurações atuais de usuários e permissões.',
  },
  {
    question: 'Esqueci a senha de um usuário. E agora?',
    answer:
      'Nesta edição não há redefinição por e-mail. Alguém com acesso a Configurações define uma nova senha em Editar — no mínimo 8 caracteres. Fale com um administrador da agência.',
  },
];

export const HELP_ARTICLES: HelpArticle[] = RAW_ARTICLES.map(indexArticle);
export const HELP_FAQ: HelpFaqItem[] = RAW_FAQ.map(indexFaq);
