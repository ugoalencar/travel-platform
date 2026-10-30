import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

interface HelpTopic {
  id: string;
  area: string;
  title: string;
  purpose: string;
  data: string;
  benefit: string;
  example: string;
  next: { label: string; to: string }[];
}

const TOPICS: HelpTopic[] = [
  { id: 'painel', area: 'Visão geral', title: 'Painel da agência', purpose: 'Acompanhar indicadores comerciais, financeiros e operacionais em um só lugar.', data: 'É calculado a partir das oportunidades, propostas, vendas, recebimentos, viagens e tarefas registradas. Cada indicador respeita o período, o perfil e os módulos disponíveis.', benefit: 'Ajuda a decidir o que precisa de atenção hoje sem substituir a conferência nas telas de origem.', example: 'Comece por tarefas vencidas e propostas aguardando retorno; abra o registro de origem para agir.', next: [{ label: 'Abrir painel', to: '/' }, { label: 'Configurar indicadores', to: '/settings/dashboard' }] },
  { id: 'clientes', area: 'CRM e comercial', title: 'Clientes e cadastro remoto', purpose: 'Manter os dados e o histórico de relacionamento de cada viajante.', data: 'Dados de contato e perfil vêm do cadastro do cliente; desejos, vendas, viagens e interações aparecem conforme forem vinculados.', benefit: 'Centraliza o contexto para atendimento e reduz cadastros duplicados.', example: 'Cadastre “Maria Oliveira”, telefone fictício “(11) 90000-0000” e registre a preferência por viagens em família no campo disponível.', next: [{ label: 'Clientes', to: '/customers' }, { label: 'Cadastro remoto', to: '/enrollment-links' }] },
  { id: 'desejos', area: 'CRM e comercial', title: 'Desejos, pipeline, segmentação e tarefas', purpose: 'Organizar intenção de viagem, oportunidades, públicos e próximos contatos.', data: 'Desejos pertencem a clientes; oportunidades e etapas refletem o pipeline; segmentos usam critérios configurados; tarefas registram responsável e prazo.', benefit: 'Dá continuidade ao atendimento e ajuda a priorizar contatos sem perder o histórico.', example: 'Registre um desejo para “Lisboa em julho”, mova a oportunidade conforme o atendimento avançar e crie uma tarefa de retorno para a data combinada.', next: [{ label: 'Desejos', to: '/wishes' }, { label: 'Pipeline', to: '/pipeline' }, { label: 'Segmentação', to: '/segments' }, { label: 'Tarefas', to: '/tasks' }] },
  { id: 'ofertas', area: 'CRM e comercial', title: 'Ofertas, Pescador, seguros e propostas', purpose: 'Montar opções comerciais, materiais e propostas para apoiar a venda.', data: 'Ofertas e propostas são registros comerciais; campanhas Pescador podem gerar itens para revisão; seguros usam produtos, apólices, viajantes e vendas quando associados.', benefit: 'Permite apresentar alternativas e acompanhar o que foi enviado, aceito ou precisa de revisão.', example: 'Crie uma proposta para o desejo de Maria, confira valores e validade e registre o resultado do contato. Conteúdo gerado deve ser revisado antes de compartilhar.', next: [{ label: 'Ofertas', to: '/offers' }, { label: 'Pescador', to: '/pescador' }, { label: 'Seguros', to: '/insurance' }, { label: 'Propostas', to: '/proposals' }] },
  { id: 'vendas', area: 'Vendas e reservas', title: 'Vendas, categorias e importação', purpose: 'Registrar o acordo comercial e acompanhar seus itens, valores, condições e situação.', data: 'A venda referencia cliente, vendedor e itens; custos e fornecedor alimentam contas a pagar; parcelas e baixas alimentam recebíveis e fluxo financeiro. Importações passam por mapeamento e revisão antes de concluir.', benefit: 'Mantém o vínculo entre o que foi vendido e os compromissos financeiros correspondentes.', example: 'Exemplo fictício: uma venda de R$ 2.400 para Maria, em duas parcelas de R$ 1.200. Confira cliente, itens, fornecedor, datas e totais antes de confirmar.', next: [{ label: 'Vendas', to: '/sales' }, { label: 'Nova venda', to: '/sales/new' }, { label: 'Categorias da venda', to: '/sale-categories' }, { label: 'Importar vendas', to: '/sales/import' }, { label: 'Reservas', to: '/bookings' }] },
  { id: 'operacao', area: 'Viagem e operação', title: 'Viagens, excursões, aéreo, terrestre e passageiros', purpose: 'Planejar e acompanhar os serviços necessários para a viagem e seus viajantes.', data: 'Viagens podem ser vinculadas a clientes e vendas; reservas e serviços detalham componentes operacionais; passageiros, documentos, ocorrências e pós-viagem dependem dos registros criados nas etapas anteriores.', benefit: 'Ajuda a equipe a conferir preparação, execução e acompanhamento após o retorno.', example: 'Após confirmar uma venda, confira se há viagem vinculada, complete os serviços e passageiros pertinentes e registre ocorrências durante a execução.', next: [{ label: 'Viagens', to: '/trips' }, { label: 'Excursões', to: '/excursions' }, { label: 'Aéreo', to: '/operations/air' }, { label: 'Terrestre', to: '/operations/land' }, { label: 'Passageiros', to: '/operations/passengers' }, { label: 'Documentos', to: '/operations/documents' }, { label: 'Ocorrências', to: '/operations/occurrences' }, { label: 'Pós-viagem', to: '/operations/post-trip' }] },
  { id: 'financeiro', area: 'Financeiro', title: 'Contas, caixa, conciliação e relatórios', purpose: 'Acompanhar valores a receber e pagar, movimentações registradas, categorias, centros de custo e demonstrativos.', data: 'Recebíveis e pagáveis podem nascer de vendas e custos; baixas registram liquidações; caixa e conciliação organizam movimentos lançados; DRE, relatórios e projeções resumem os registros conforme seus critérios.', benefit: 'Torna compromissos, liquidações e resultados rastreáveis até os lançamentos de origem.', example: 'Para uma parcela de R$ 1.200, consulte Contas a Receber; após identificar o crédito, registre a baixa na ação prevista pela tela e confira o reflexo no caixa. O lançamento no sistema não movimenta dinheiro no banco.', next: [{ label: 'Visão financeira', to: '/financial' }, { label: 'A receber', to: '/financial/receivables' }, { label: 'A pagar', to: '/financial/payables' }, { label: 'Fluxo de caixa', to: '/financial/cash-transactions' }, { label: 'Conciliação', to: '/financial/reconciliation' }, { label: 'DRE', to: '/financial/dre' }, { label: 'Relatórios', to: '/financial/reports' }, { label: 'Projeções', to: '/financial/projections' }] },
  { id: 'receita-agencia', area: 'Financeiro', title: 'Receita da agência, receitas e despesas', purpose: 'Separar a receita própria da agência do volume total vendido e registrar receitas e despesas conforme a tela correspondente.', data: 'A receita da agência depende das regras com fornecedores e das vendas/itens elegíveis; receitas e despesas avulsas dependem de lançamentos próprios.', benefit: 'Evita confundir o valor vendido ao cliente com a parcela que constitui receita da agência.', example: 'Uma venda de R$ 2.400 não significa receita de R$ 2.400 para a agência. Consulte a regra aplicável e confira previsão, condição de reconhecimento e recebimento.', next: [{ label: 'Receita da agência', to: '/financial/agency-revenue' }, { label: 'Receitas registradas', to: '/financial/revenues' }, { label: 'Despesas', to: '/financial/expenses' }, { label: 'Fornecedores', to: '/suppliers' }] },
  { id: 'equipe', area: 'Equipe e comissões', title: 'Funcionários, regras, liberação e folha', purpose: 'Configurar equipe e regras de comissão, acompanhar valores calculados e preparar pagamentos conforme as políticas da agência.', data: 'As comissões derivam de vendas e regras vigentes, podendo depender de atribuição e política de liberação; a folha reúne valores elegíveis segundo os estados exibidos.', benefit: 'Explica como o cálculo se relaciona com vendas e permite conferir pendências antes da folha.', example: 'Antes de aprovar ou pagar, confira a venda de origem, o funcionário comissionado, a regra vigente, a faixa aplicada e o critério de liberação apresentado.', next: [{ label: 'Funcionários', to: '/employees' }, { label: 'Regras de comissão', to: '/commission-rules' }, { label: 'Liberação', to: '/commission-release' }, { label: 'Folha', to: '/payroll' }, { label: 'Condições de pagamento', to: '/payment-conditions' }] },
  { id: 'marketing', area: 'Marketing', title: 'Mídia, comunicação, campanhas e cupons', purpose: 'Organizar ativos e ações de divulgação associadas à operação comercial.', data: 'A biblioteca guarda os ativos cadastrados; comunicações, campanhas e cupons têm seus próprios registros e status.', benefit: 'Facilita reutilizar materiais e acompanhar ações sem misturá-las com a confirmação de venda.', example: 'Revise imagem, texto, público, validade e condições do cupom antes de iniciar uma campanha.', next: [{ label: 'Biblioteca de mídia', to: '/media-library' }, { label: 'Comunicação', to: '/communications' }, { label: 'Campanhas', to: '/campaigns' }, { label: 'Cupons', to: '/coupons' }] },
  { id: 'configuracoes', area: 'Administração', title: 'Configurações, módulos, acessos e segurança', purpose: 'Administrar perfil da agência, usuários, permissões, módulos e preferências disponíveis.', data: 'As opções dependem do perfil autenticado, das permissões concedidas e dos módulos habilitados para a agência.', benefit: 'Mantém cada pessoa com acesso compatível com sua responsabilidade e permite adaptar a navegação.', example: 'Convide um usuário com o papel adequado e revise as permissões antes de pedir que execute uma ação administrativa.', next: [{ label: 'Configurações', to: '/settings' }, { label: 'Módulos', to: '/settings/modules' }, { label: 'Configurar painel', to: '/settings/dashboard' }, { label: 'Categorias financeiras', to: '/financial/categories' }, { label: 'Centros de custo', to: '/financial/cost-centers' }, { label: 'Configuração financeira', to: '/financial/settings' }] },
  { id: 'backup-exportacao', area: 'Administração e dados', title: 'Backup, recuperação e planilhas', purpose: 'Manter uma cópia criptografada para recuperação e gerar arquivos CSV para consulta ou operação manual fora do sistema.', data: 'O backup usa as tabelas incluídas no manifesto Full classificado; credenciais, sessões, tokens, MFA, arquivos binários e infraestrutura ficam fora. Agenda e tentativas aparecem no histórico. As planilhas vêm de vendas, clientes, contas a receber, contas a pagar, despesas operacionais e receitas da agência, usando o período, colunas e filtros permitidos para cada área.', benefit: 'Mantém uma saída de recuperação separada das planilhas e permite que a agência guarde arquivos próprios. Vendas e contas financeiras podem incluir cliente relacionado quando o vínculo existe. O CSV tem limite de 50 mil linhas e 10 MB e não substitui backup.', example: 'Escolha “Vendas”, informe o intervalo, marque Cliente, Total e Situação e baixe o CSV pelo navegador. Para recuperar, selecione um backup concluído, verifique a integridade e só restaure se o sistema confirmar a mesma agência e destino vazio. A cópia diária depende da configuração técnica do worker, storage privado e chave versionada; a agenda ativa, sozinha, não comprova execução.', next: [{ label: 'Configurações e Backup', to: '/settings' }, { label: 'Relatórios', to: '/reports' }] },
  { id: 'relatorios', area: 'Análise', title: 'Relatórios', purpose: 'Consultar visões agregadas para analisar vendas, operação e finanças.', data: 'Os resultados são derivados dos registros existentes e dos filtros disponíveis na tela; dados incompletos ou pendentes afetam os totais.', benefit: 'Ajuda a identificar tendências e pendências, mantendo a conferência final nas telas transacionais.', example: 'Defina o período e os filtros, confira se há registros no intervalo e abra os lançamentos de origem antes de tomar decisões financeiras.', next: [{ label: 'Relatórios gerais', to: '/reports' }, { label: 'Relatórios financeiros', to: '/financial/reports' }, { label: 'DRE', to: '/financial/dre' }] },
];

export function HelpPage() {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  const topics = useMemo(() => TOPICS.filter((topic) =>
    `${topic.area} ${topic.title} ${topic.purpose} ${topic.data} ${topic.benefit} ${topic.example}`
      .toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .includes(normalizedQuery.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))), [normalizedQuery]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="rounded-2xl bg-slate-900 p-6 text-white sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wider text-cyan-300">Central de ajuda · Travel Platform Full</p>
        <h1 className="mt-2 text-3xl font-bold">Aprenda o fluxo da sua agência</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">Entenda para que serve cada área, de onde vêm as informações e qual próximo passo seguir. Os exemplos desta página são fictícios; as telas e ações disponíveis dependem do seu perfil e dos módulos da agência.</p>
        <label className="mt-5 block max-w-2xl text-sm font-medium" htmlFor="help-search">Buscar por área, tarefa ou informação
          <input id="help-search" className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-cyan-400" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex.: comissão, passageiros, de onde vem o saldo…" />
        </label>
      </header>

      <section aria-labelledby="journey-title" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 id="journey-title" className="text-xl font-semibold">Roteiro sugerido para começar</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {([
            ['1. Prepare a agência', 'Revise perfil, equipe, permissões, fornecedores e configurações financeiras.', '/settings'],
            ['2. Organize o atendimento', 'Cadastre clientes e registre desejos, oportunidades e tarefas.', '/customers'],
            ['3. Apresente e registre', 'Prepare oferta ou proposta; registre a venda e confira seus itens e condições.', '/proposals'],
            ['4. Acompanhe a entrega', 'Consulte recebíveis, pagáveis e viagem; complete a operação e o pós-viagem.', '/financial/receivables'],
          ] as const).map(([title, description, to]) => <li key={title} className="rounded-lg bg-slate-50 p-4"><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm leading-5 text-slate-600">{description}</p><Link className="mt-3 inline-block text-sm font-semibold text-blue-700 underline" to={to}>Abrir tela</Link></li>)}
        </ol>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        {topics.map((topic) => <article id={topic.id} key={topic.id} className="scroll-mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{topic.area}</p>
          <h2 className="mt-1 text-xl font-semibold">{topic.title}</h2>
          <dl className="mt-4 space-y-3 text-sm leading-6">
            <div><dt className="font-semibold">Para que serve</dt><dd className="text-slate-700">{topic.purpose}</dd></div>
            <div><dt className="font-semibold">De onde vêm os dados</dt><dd className="text-slate-700">{topic.data}</dd></div>
            <div><dt className="font-semibold">Por que usar</dt><dd className="text-slate-700">{topic.benefit}</dd></div>
            <div><dt className="font-semibold">Exemplo</dt><dd className="text-slate-700">{topic.example}</dd></div>
          </dl>
          <nav className="mt-4 flex flex-wrap gap-2" aria-label={`Telas: ${topic.title}`}>
            {topic.next.map((link) => <Link key={link.to} className="rounded-full border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-800 hover:bg-blue-50" to={link.to}>{link.label}</Link>)}
          </nav>
        </article>)}
      </div>
      {topics.length === 0 && <p role="status" className="rounded-lg bg-white p-6 text-slate-700">Nenhum tópico corresponde à busca. Tente o nome da tela ou uma palavra mais geral.</p>}

      <aside className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
        <h2 className="font-semibold">Como interpretar os números</h2>
        <p>O painel e os relatórios resumem registros do sistema; confira o lançamento de origem quando um valor parecer diferente do esperado. Registrar uma baixa ou pagamento no sistema documenta a operação e não confirma uma transferência bancária. Menus podem variar por perfil, permissões e módulos habilitados. Use a busca acima ou os links de cada tópico para chegar à área correspondente.</p>
      </aside>
    </div>
  );
}
