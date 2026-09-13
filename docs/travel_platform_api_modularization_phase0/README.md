# Travel Platform — API Modularization Phase 0 Pack

Objetivo: preparar e validar uma modularização segura da API sem alterar comportamento.

Esta fase NÃO modulariza a API inteira. Ela:
- congela comportamento com characterization tests;
- define contrato de módulo;
- escolhe 1 módulo leaf;
- executa 1 piloto;
- mede antes/depois;
- produz GO/NO-GO para a Fase 1.

Guardrails:
- zero mudança de rota pública;
- zero mudança de payload/status code;
- zero mudança de Auth/RBAC/RLS/Tenant;
- zero mudança financeira;
- zero migration;
- zero duplicação de helpers centrais.
