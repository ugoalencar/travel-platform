# DEC-007: Full primeiro e Lite como subconjunto funcional

**Data:** 2026-10-23
**Status:** Aceito
**Decisor:** Responsavel pelo produto, por instrucao direta nesta conversa

## Contexto

Full e Lite possuem implementacoes separadas. O responsavel pelo produto
determinou que o Lite nao pode oferecer funcionalidades ausentes no Full.
A existencia de duas implementacoes nao demonstra equivalencia funcional.

## Decisao

1. O Travel Platform Full e a referencia funcional do produto.
2. Toda nova funcionalidade ou evolucao funcional deve ser implementada e
   validada primeiro no Full; depois, disponibilizada no recorte Lite aprovado.
3. O Lite pode omitir capacidades do Full, mas nao oferecer capacidades
   exclusivas. Declaracoes, menus, mocks ou planos futuros nao comprovam
   existencia de uma funcionalidade no Full.
4. Antes de trabalhar no Lite, o agente deve identificar o equivalente no
   Full, seus contratos, regras e testes. Quando faltar equivalencia, incluir
   o trabalho correspondente no Full antes da entrega no Lite.
5. Reutilizar dominio e contratos existentes quando apropriado; nao duplicar
   motores desnecessariamente. Esta decisao nao obriga uma fusao de bancos,
   interfaces ou servicos. Mudancas arquiteturais continuam exigindo ADR.
6. Preservar controles de acesso, isolamento, dados e calculos historicos.
   Nenhum agente pode remover funcionalidades do Lite para simular paridade.
7. Excecoes precisam de autorizacao humana explicita e decisao registrada.

## Tratamento do legado

A regra e obrigatoria para as proximas entregas, mas nao declara o legado
conforme. A [vistoria inicial](../travel-lite/FULL-LITE-PARITY-AUDIT-2026-10-23.md)
registra diferencas constatadas no codigo local. Sua correcao depende de
escopo de implementacao aprovado; esta decisao nao autoriza migracoes,
deploy, acesso a producao, alteracao de credenciais ou recalculos retroativos.

## Criterios de aceite

- Evidencias da implementacao funcional e dos testes relevantes no Full.
- Evidencias da adaptacao e dos testes relevantes no Lite, depois do Full.
- Regras de negocio e limites do recorte explicitados, sem ampliar privilegios.
- Documentacao atualizada, incluindo eventuais diferencas ainda pendentes.
- Falta de equivalencia impede declarar a entrega Lite conforme esta regra.

## Referencias

- [Instrucoes globais](../../AGENTS.md).
- [Escopo do produto](../00-product/scope.md).
