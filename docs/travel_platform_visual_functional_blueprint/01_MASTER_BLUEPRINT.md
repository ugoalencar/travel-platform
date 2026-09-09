# 01 — Master Blueprint

## Visão do produto

O Travel Platform deve se apresentar como um ERP/CRM vertical para agências de viagens.

Não deve parecer um conjunto de telas isoladas. Deve parecer um sistema único com setores claros, fluxo previsível e identidade visual consistente.

## Estrutura macro

### 1. CRM
- Clientes
- Leads
- Desejos
- Dependentes
- Documentos
- Histórico

### 2. Comercial
- Pescador
- Ofertas
- Campanhas
- Propostas
- Reservas
- Vendas

### 3. Operação
- Viagens
- Booking
- Aéreo
- Terrestre
- Passageiros
- Documentos
- Ocorrências
- Pós-viagem

### 4. Financeiro
- Visão Geral
- Receitas
- Despesas
- Contas a Receber
- Contas a Pagar
- Caixa
- Conciliação
- Margens
- DRE Gerencial
- Relatórios

### 5. Cadastros
- Fornecedores
- Categorias de fornecedores
- Produtos e destinos
- Centros de custo
- Categorias financeiras

### 6. Pessoal
- Funcionários
- Planos de comissão
- Comissões
- Salários e benefícios
- Descontos e adiantamentos
- Pagamentos

### 7. Marketing
- Ofertas
- Campanhas
- Assets
- Publicações
- Automações

### 8. Configurações
- Usuários
- Papéis
- Integrações
- Parâmetros
- Logs/Auditoria

## Ambientes

### Admin da Plataforma
Control plane do SaaS.

Foco:
- agências
- planos
- assinaturas
- faturamento SaaS
- suporte
- incidentes
- feature flags
- saúde do sistema

### Agência / CRM
Ambiente de gestão.

Foco:
- cliente
- comercial
- operação
- financeiro
- pessoal
- fornecedores
- relatórios

### Staff Operacional
Ambiente simplificado.

Foco:
- tarefas do dia
- passageiros
- check-ins
- transfers
- operações
- ocorrências
- documentos

### Portal do Cliente
Ambiente de viajante.

Foco:
- viagens
- propostas
- pagamentos
- documentos
- itinerário
- suporte

## Design principles

1. Menus por setor, não lista infinita.
2. Linguagem 100% pt-BR.
3. Dashboard diferente por papel.
4. Formulários em etapas/abas.
5. Cada tela deve ter:
   - título
   - contexto
   - KPIs
   - filtros
   - ação principal
   - conteúdo
6. Não mostrar UUID cru.
7. Usar nomes humanos e labels claros.
8. Financeiro deve sempre mostrar origem e impacto.
9. Aéreo e Terrestre correm separados e convergem no financeiro.
10. Dados do cliente devem ser completos e reutilizáveis no Booking.
