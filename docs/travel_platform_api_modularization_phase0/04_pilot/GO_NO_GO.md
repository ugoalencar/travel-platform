# GO / NO-GO

GO se:
- characterization tests passam antes/depois;
- URLs/status/payload iguais;
- zero mudança Auth/RBAC/RLS/Tenant;
- zero mudança financeira;
- zero migrations;
- build/lint/typecheck verdes;
- app.ts simplifica;
- sem helper duplicado.

NO-GO se:
- precisa mudar comportamento;
- cria MegaDeps;
- exige Finance/Auth/Tenant/RLS;
- tests precisam ser relaxados;
- ganho estrutural irrelevante.
