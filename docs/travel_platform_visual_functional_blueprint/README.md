# Travel Platform — Visual + Functional Blueprint

Este pacote organiza a próxima fase do Travel Platform: transformar a base funcional atual em um SaaS/CRM moderno, setorizado, amigável e pronto para validação real de negócio.

## Objetivo

Separar claramente:
- Admin da Plataforma
- Agência / CRM
- Staff Operacional
- Portal do Cliente

E reorganizar toda a experiência por setores:
- CRM
- Comercial
- Operação
- Financeiro
- Cadastros
- Pessoal
- Marketing
- Configurações

## Regra principal

Não reconstruir o backend que já funciona apenas por estética.

A nova fase deve:
1. preservar dados e regras de negócio já validados;
2. reorganizar UX e navegação;
3. aprofundar cadastros;
4. conectar áreas por fluxo;
5. manter pt-BR em toda a interface;
6. diferenciar ambientes e papéis;
7. melhorar visual e gestão sem quebrar segurança.

## Ordem sugerida de execução

1. `01_MASTER_BLUEPRINT.md`
2. `02_AGENCY_INFORMATION_ARCHITECTURE.md`
3. `03_CUSTOMER_PORTAL_UX.md`
4. `04_PLATFORM_ADMIN_SEPARATION.md`
5. `05_CUSTOMER_360_AND_DOCUMENTS.md`
6. `06_SUPPLIERS_AIR_GROUND_FINANCE.md`
7. `07_EMPLOYEES_SALARIES_COMMISSIONS.md`
8. `08_FINANCIAL_REBUILD.md`
9. `09_PESCADOR_REDESIGN.md`
10. `10_DEMO_DATA_AND_FULL_CYCLE.md`
11. `11_HUMAN_UAT_CHECKLIST.md`
12. `12_VISUAL_POLISH_EXECUTION.md`

## Modo de trabalho recomendado

Executar em ondas funcionais grandes, não em micro-refactors:
- Wave UX Base
- Wave Cadastros
- Wave Financeiro
- Wave Operação
- Wave Portal/Admin
- Wave UAT/Polish

P0/P1 devem ser corrigidos durante a implementação.
P2/P3 podem ficar para acabamento posterior.
