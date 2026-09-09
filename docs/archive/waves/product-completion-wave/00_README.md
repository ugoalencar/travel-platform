# Travel Platform — Product Completion Wave

Objetivo: fechar lacunas funcionais descobertas no teste manual antes do acabamento gráfico final.

Executar em paralelo:
1. Customer 360 + dependentes + documentos/OCR-ready
2. Ofertas & Marketing totalmente editável
3. Financeiro completo

Depois executar:
4. Integrador + QA humano de ponta a ponta

Princípios:
- preservar Auth/Tenant/RBAC/RLS
- não enfraquecer produção
- criar migrations novas e aditivas
- nunca reescrever migration histórica aplicada
- manter dados tenant-scoped
- uploads/documentos com controle de acesso
- não implementar OCR definitivo ainda; preparar arquitetura e fluxo de confronto documental
