/**
 * Static in-app help. Content only — no API calls, permission-free for any
 * authenticated user (opened from the topbar "Ajuda" link).
 */
export function HelpPage() {
  return (
    <div className="lite-help">
      <h1>Ajuda</h1>
      <p className="lite-muted">Dúvidas rápidas sobre vendas, comissões, financeiro e permissões.</p>

      <section className="lite-card">
        <h2>Status das vendas</h2>
        <ul>
          <li>
            <strong>Rascunho</strong> — venda ainda editável; é aqui que você lança os custos diretos.
          </li>
          <li>
            <strong>Confirmada</strong> — gera as parcelas a receber e a comissão do vendedor.
          </li>
          <li>
            <strong>Parcial</strong> — alguma parcela já foi recebida, mas ainda falta valor.
          </li>
          <li>
            <strong>Pago</strong> — todas as parcelas foram recebidas.
          </li>
          <li>
            <strong>Cancelada</strong> — não pode ser desfeita; exige permissão para editar todas as vendas (administrador ou gerente).
          </li>
        </ul>
      </section>

      <section className="lite-card">
        <h2>Status das comissões</h2>
        <ul>
          <li>
            <strong>Sem regra</strong> — a venda foi confirmada sem regra de comissão no vendedor. Um
            administrador define a regra em Vendedores e o valor é recalculado.
          </li>
          <li>
            <strong>Pendente</strong> — valor calculado, aguardando aprovação.
          </li>
          <li>
            <strong>Aprovada</strong> — virou conta a pagar; o pagamento depende da permissão
            financeira.
          </li>
          <li>
            <strong>Pago</strong> — conta quitada.
          </li>
        </ul>
      </section>

      <section className="lite-card">
        <h2>Perfis e permissões</h2>
        <ul>
          <li>
            Perfis: <strong>MASTER</strong>, <strong>ADMIN</strong>, <strong>MANAGER</strong>,{' '}
            <strong>SELLER</strong> e <strong>VIEWER</strong>. Cada perfil tem permissões padrão, que
            um MASTER pode ajustar por usuário em Configurações.
          </li>
          <li>
            Se um menu não aparece, seu perfil não tem a permissão correspondente — fale com um
            administrador da agência.
          </li>
          <li>Você não tem acesso a uma área por link direto? O sistema explica e mantém o endereço.</li>
        </ul>
      </section>

      <section className="lite-card">
        <h2>Importação de planilhas</h2>
        <ul>
          <li>1. Envie o arquivo CSV ou XLSX.</li>
          <li>2. Associe as colunas aos campos.</li>
          <li>3. Valide com o dry-run — nada é gravado ainda.</li>
          <li>4. Resolva as pendências linha a linha (vincular cliente ou ignorar).</li>
          <li>5. Confirme para gravar.</li>
        </ul>
      </section>

      <section className="lite-card">
        <h2>Financeiro</h2>
        <ul>
          <li>
            <strong>Receber</strong> — dê baixa nas parcelas em Financeiro › A receber (exige
            permissão financeira).
          </li>
          <li>
            <strong>Pagar</strong> — despesas e comissões aprovadas aparecem em A pagar.
          </li>
          <li>
            <strong>Estornar</strong> — o lançamento original é mantido e um movimento inverso é
            registrado com motivo obrigatório.
          </li>
        </ul>
      </section>

      <section className="lite-card">
        <h2>Primeiros passos</h2>
        <ul>
          <li>
            Ao entrar com a base vazia, o Dashboard mostra o checklist <strong>Prepare sua agência</strong>{' '}
            com o que falta cadastrar.
          </li>
          <li>Ordem recomendada: conta financeira → categorias → vendedores → clientes → primeira venda.</li>
        </ul>
      </section>
    </div>
  );
}
