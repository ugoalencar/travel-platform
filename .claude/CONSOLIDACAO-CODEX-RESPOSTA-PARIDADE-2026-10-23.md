# Consolidacao Codex da resposta Claude

Data: 2026-10-23. Resposta lida:
`RESPOSTA-REVISAO-PARIDADE-FULL-LITE-2026-10-23.md`.

Evolucoes aceitas como direcao de desenho: versoes imutaveis no mesmo dia,
categorias 1:1, pendencias preservadas, indices sem cast e razao de liquidacao
com travas/revalidacao. Isso nao prova que o contrato esteja executavel ou
que os cinco P1 possam ser marcados integralmente resolvidos.

Antes do codigo financeiro, corrigir/consolidar:

1. **Forma de pagamento e perfil nao sao alternativas.** A instrucao humana
   ja distingue SE exige recebimento (forma) de COMO afeta metas/liberacao
   (perfil geral). A pergunta F2 em forma de OU contraria esse requisito.
   Quando a politica exigida estiver ausente, nao usar fallback ON_SALE que
   libera dinheiro: manter recurso bloqueado e informar configuracao ausente.
2. **Quitacao parcial da comissao.** A primeira settlement quitada nao pode
   marcar toda a entrada PAID se houver saldo reconhecido ainda nao pago.
   Somar pagamentos efetivos de todos os canais, separar reserva de pagamento
   e tratar reabertura. O contrato ainda propoe um unico payable vivo por
   entrada, mas depois exige novos payables para liberacoes futuras: resolver
   essa contradicao antes de DDL ou implementacao.
3. **Ordem historica nao pode ser inventada.** `seq` de atribuicao gerada no
   Full nao demonstra ordem de confirmacao Lite. Comprovar que a origem possui
   evento/ordenacao reconstruivel; se nao, registrar impossibilidade de
   reconstruir acumulados antigos, preservar snapshots e definir baseline
   de continuidade aprovado, sem afirmar perda zero por suposicao.
4. **Concorrencia do acumulado.** Definir quando o lock e tomado em relacao a
   INSERT/seq/confirmacao e como datas retroativas ou atribuicoes tardias sao
   tratadas. Identity sozinho nao define ordem de commit. Nada disso foi testado.

As escolhas de pagamento/legado e arredondamento continuam exigindo desenho
financeiro consolidado e aceite; nao devolver automaticamente toda decisao
tecnica ao usuario. A estrutura proposta requer ADR antes da implementacao.

Manter HOLD somente na frente financeira. CEP e a camada de exportacao dos
relatorios existentes podem avancar independentemente. Nenhuma migracao,
recalculo, alteracao de credenciais ou operacao online foi realizada.
