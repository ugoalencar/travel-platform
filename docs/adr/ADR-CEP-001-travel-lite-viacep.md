# ADR CEP 001 Consulta de endereco do Travel Lite por ViaCEP

Data: 2026-10-22. Decisao de provedor aceita pelo usuario para implementacao
e teste local. Nao autoriza deploy ou ativacao em producao.

## Contexto

O cadastro Lite ja armazena CEP e endereco, mas exigia preenchimento manual.
O usuario autorizou ViaCEP depois da revisao dos relatorios de CEP e folha.
ViaCEP e terceiro, nao a API oficial dos Correios. Nao ha contrato Correios
confirmado nem necessidade de contratar servicos para este teste local.

## Decisao

- GET /cep/lookup?cep=01001000 (tambem /api/cep/lookup) autenticado e com uma
  das permissoes customers.create, customers.update_all, customers.update_own.
- Apenas backend consulta https://viacep.com.br/ws/{8-digitos}/json/.
  URL fixa, redirects recusados, timeout de 3 segundos, resposta ate 16 KiB.
- Validar CEP retornado, UF, tipos e comprimentos. Nao repassar corpo bruto.
- Cache publico de endereco por CEP: 24h, ate 500 entradas por instancia;
  consultas simultaneas iguais compartilham uma chamada. Falhas nao em cache.
- Limites por instancia: 10 consultas/minuto por tenant+usuario, 60 chamadas
  externas/minuto e 10 CEPs externos simultaneos. Limitar memoria de contadores.
- Nao enviar nomes, documentos ou contato ao provedor. Nao registrar corpo
  de resposta ou CEP nos logs da rota (logLevel silent). Sem persistencia de
  consulta no cadastro e sem migracao.
- Local habilitado por padrao. Em NODE_ENV=production, fica desabilitado
  salvo TRAVEL_LITE_CEP_PROVIDER=viacep explicitamente. Qualquer valor de
  provedor diferente de viacep desabilita; nenhum fallback silencioso.
- Frontend usa somente API propria; debounce de 400ms, mascara, estados,
  retry e AbortSignal. Nao consulta ao abrir cliente existente. Preenche
  campos vazios ou ainda pertencentes ao preenchimento automatico da mesma
  sessao do formulario; CEP novo substitui os anteriores campos automaticos.
  Edicao manual remove essa propriedade; nao substitui valores modificados
  durante a chamada. Respostas antigas
  nao preenchem um formulario com outro CEP.
- Numero/complemento manuais; consulta nao comprova endereco nem bloqueia
  cadastro manual quando indisponivel. CEP ausente continua permitido.
- CEP novo/alterado valido e normalizado na persistencia; CEP legado
  inalterado e preservado. Importacao em massa fora deste escopo.

## Consequencias

Nao requer dependencia nova nem mudanca do modelo de dados. O endereco pode
estar incompleto; o usuario continua responsavel por conferir e completar.
Cache e limites em memoria nao sao distribuidos nem persistentes. Antes de
publicar em multiplas instancias, rever protecao compartilhada/limites do
provedor. Nenhuma disponibilidade contratual e presumida para o ViaCEP.

Fonte do contrato de consulta: https://viacep.com.br/.
