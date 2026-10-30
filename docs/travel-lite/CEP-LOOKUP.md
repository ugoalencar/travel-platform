# Consulta de CEP no cadastro de clientes

## Uso

Em Clientes, abrir Novo cliente ou editar um existente. No celular, abrir
Mais campos. Ao digitar oito digitos do CEP, aguardar a consulta. Rua, bairro,
cidade e UF sao preenchidos quando vazios. Se o CEP mudar no mesmo formulario,
os campos anteriormente preenchidos pelo ViaCEP sao atualizados para o novo
endereco. Numero e complemento nao mudam. Campos existentes ou alterados
manualmente sao preservados. Uma resposta
antiga nao substitui o endereco de outro CEP. Ao editar cliente existente,
consulta so acontece quando o usuario altera o CEP.

CEP inexistente, provedor indisponivel ou limite de consulta mostram aviso e
permitem continuar manualmente. CEP com endereco generico pode preencher
apenas cidade/UF. Tentar novamente repete a consulta depois de uma falha.
Salvar nao depende de sucesso da consulta; CEP novo informado deve ser valido.

## Operacao

Frontend consulta GET /api/cep/lookup?cep=01001000. API exige autenticacao e
permissao para criar ou editar clientes. Nao recebe identificador de cliente.
Respostas: 200 endereco/resultado parcial, 400 formato invalido, 401 sem
sessao, 403 sem permissao, 404 nao encontrado, 429 limite (Retry-After: 60),
502 resposta/rede invalida, 503 desabilitado, 504 timeout.

Em desenvolvimento o ViaCEP esta habilitado. Para desabilitar, definir
TRAVEL_LITE_CEP_PROVIDER=disabled no processo da API. Em producao somente
TRAVEL_LITE_CEP_PROVIDER=viacep habilita a consulta explicitamente; esta entrega
nao modifica variaveis de ambientes existentes nem publica codigo.

Cache e limites sao por instancia e nao substituem protecao distribuida.
Nao usar esse endpoint para validacao em massa/importacao. Ver decisao em
docs/adr/ADR-CEP-001-travel-lite-viacep.md.

## Validacao local

Testes de backend sem Postgres em tests/cep.test.ts, cep-routes.test.ts e
customer-cep.test.ts cobrem provider, cache, erro, timeout, autenticacao,
permissao, limites e validacao de persistencia com cliente SQL simulado.
CustomerCepField.test.tsx cobre preenchimento, abertura sem consulta,
preservacao manual, resposta atrasada e falha com retry.

Sucesso nesses testes nao valida migracoes ou o banco real. Nenhuma migracao
foi criada/aplicada. Na validacao manual automatizada, nao foi salvo cliente;
so login demo, consulta real e preenchimento do formulario desktop/mobile.

Resultado em 2026-10-22: 51 testes selecionados da API (incluindo branding)
e 102 testes da interface passaram apos a correcao da troca consecutiva de CEP.
O navegador validou duas consultas seguidas sem zerar o cadastro e preservacao
de rua editada manualmente, numero e complemento. Nenhum cliente foi salvo.
Typechecks e builds dos dois workspaces
passaram; lint sem erros, com quatro avisos preexistentes de Fast Refresh no
frontend. Build frontend mantem aviso de tamanho de chunk. Suite completa de
integracao com banco nao executada. Browser Chrome headless validou consulta
real, alinhamento desktop, mobile sem overflow e campos manuais preservados.

Instancia de validacao desta rodada: http://127.0.0.1:5181/demo, proxy para
API local em 127.0.0.1:4011. Portas anteriores 5180/4010 foram preservadas.
Esses processos sao locais e nao representam servico persistente instalado.
