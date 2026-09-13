# Gates + UAT

## Por branch
- lint
- typecheck
- unit
- targeted integration
- targeted security
- build
- browser smoke
- console errors = 0
- network failures = 0
- unexpected 403/500 = 0
- worktree clean

## Se DB mudou
- migrations validate
- fresh DB apply
- RLS tests
- FORCE RLS
- cross-tenant isolation

## Se public link mudou
- entropy
- expiry
- revoke
- rate limit
- invalid token
- tenant leakage test

## Stories finais

### Agência nova
Assina → tenant → owner → onboarding → branding → equipe → financeiro → portal.

### Cliente remoto
Link → cadastro → dependente → passaporte → upload → OCR opcional → revisão → Customer 360.

### Contrato
Venda → contrato → signatários → link seguro → assinatura → evidência → arquivo.

### Parceiro
Parceiro → contrato → link → lead → venda → comissão → AP → pagamento.

### Internacional
Passaporte/visto → requisitos do destino → alertas → Booking.

### Turbine
Produto → campanha → sugestão → opcional → SaleItem → total/margem → Finance → portal.

### Seguro
Plano → passageiros → apólice → SaleItem → comissão → documento → portal.

Em TODAS:
Tenant B não vê.
Sem tenant context falha fechado.
Customer e Partner ficam self-scoped.
