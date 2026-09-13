# Arquitetura Alvo

## Ambientes

### Platform Admin
Agências, planos, assinaturas, entitlements, billing, suporte, incidentes, feature flags, monitoring.

### Agency Owner/Admin
Empresa, branding, usuários, funcionários, permissões, departamentos, portal, contratos, fornecedores, parceiros, financeiro, templates.

### Staff
CRM, comercial, booking, operações, documentos, vendas e financeiro conforme permissão.

### Customer Portal
Viagens, propostas, reservas, documentos, contratos, assinaturas, pagamentos, opcionais.

### Partner Portal
Leads próprios, vendas atribuídas, comissões, contratos, materiais e links rastreáveis.

## Entradas comerciais
1. staff cadastra;
2. agência envia link remoto;
3. parceiro envia link rastreável.

Todos convergem:
Cliente → Wish → Proposal → Booking → Sale → Finance.

## Providers abstratos
- `DocumentOCRProvider`
- `SignatureProvider`
- `BillingProvider`
- `NotificationProvider`

Não acoplar domínio a fornecedor externo específico.
