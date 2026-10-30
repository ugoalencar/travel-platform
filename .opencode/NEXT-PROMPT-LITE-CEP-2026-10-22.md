# OpenCode Consulta de CEP no cadastro de clientes Lite

Leia D:/travel-platform/AGENTS.md, docs/AI_CONTEXT.md, QUALITY-GATES.md e
.claude/COORDENACAO-LITE-FINANCEIRO-2026-10-22.md antes de explorar.

## Missao desta rodada

Especificar a consulta de CEP do cadastro de clientes do Travel Lite, com
preenchimento de rua, bairro, cidade e UF. Usuario citou a base brasileira
dos Correios. Verificar condicoes reais da fonte oficial sem presumir
contrato nem chaves disponiveis. Esta rodada e documental: nao implementar
sem consolidacao do desenho e aprovacao.

## Escrita exclusiva

Somente D:/travel-platform/.opencode/RELATORIO-LITE-CEP-2026-10-22.md.
Nao editar este prompt, coordenacao, arquivos Claude, codigo, testes,
migracoes, lockfiles, dependencias, .env ou arquivos globais. Verificar
cwd/branch/status sem alterar branch ou reverter trabalho alheio.
Branch observada: wip/organizacao-2026-10-20, checkout D:/travel-platform.
HOLDs PX1 antigos permanecem: esta e nova autorizacao apenas documental.

## Leitura inicial

- apps/travel-lite/src/pages/CustomersPage.tsx e seus testes.
- apps/travel-lite/src/lib: cliente HTTP, validacao e tipos existentes.
- services/api-lite/src/routes/customers.ts, autorizacao e validacoes.
- Configuracao de rede/PWA e testes existentes relevantes.
- Referencias em outros apps apenas para avaliar reuso, sem edita-los.

## Entrega obrigatoria

1. Diagnostico atual com arquivos/linhas verificadas; nao confundir o CEP
   armazenado com consulta de endereco implementada.
2. Fonte oficial: consultar a documentacao atual dos Correios e indicar URLs,
   data, exigencias de contrato/servico/API e autenticacao. Base inicial:
   https://www.correios.com.br/atendimento/developers/manuais/manual-api-busca-cep
   Nao raspar o Busca CEP interativo nem burlar contrato/autenticacao.
3. Se acesso oficial depender de contrato nao disponivel, registrar bloqueio
   e apresentar alternativas gratuitas apenas como opcoes para decisao do
   humano; nao assumir que provedor de terceiros e oficial ou foi aprovado.
4. Desenho do adaptador no backend para proteger eventuais credenciais, com
   URL fixa autorizada, timeout, limite de chamadas, validacao da resposta e
   sem SSRF. Frontend nunca recebe chaves. Sem dados pessoais na consulta:
   somente CEP; nao enviar nome, CPF ou endereco completo do cliente.
5. UX: normalizar 8 digitos, mascara, disparo quando completo, carregamento,
   nao encontrado, CEP generico, erro e tentativa novamente. Numero e
   complemento manuais. Rua/bairro/cidade/UF sempre editaveis. Nao bloquear
   cadastro manual se sem internet ou provedor indisponivel.
6. Cancelar/ignorar respostas atrasadas de CEP anterior; respeitar mudancas
   manuais feitas durante a consulta. Nao apagar endereco existente ao
   apenas abrir edicao nem sobrescrever silenciosamente dados preenchidos.
7. Validacao backend de persistencia; CEP consultado nao equivale a endereco
   comprovado. Registrar fonte quando adequado sem logar dados pessoais.
8. Contrato de endpoint e mapa de arquivos propostos para a implementacao
   futura; qualquer mudanca de app.ts, permissoes ou dependencias deve ser
   listada como ponto de integracao do Codex, nao executada.
9. Testes propostos com mocks: CEP valido, invalido, inexistente, generico,
   timeout, offline, resposta malformada, resposta fora de ordem, edicao
   manual durante consulta e preservacao de numero/complemento. Nada de
   clientes reais ou credenciais em fixtures.

## Encerramento

Salvar resumo, evidencias, proposta, criterios de aceite, lista de arquivos,
riscos, bloqueios e decisoes pendentes. Nao instalar, implementar, acessar
provedores autenticados, ler .env, migrar, alterar banco, reiniciar o servidor
em uso, fazer commit/push/deploy ou comprar servico. Nao rodar suites Docker
compartilhadas em paralelo. Terminar em HOLD para implementacao.
Nao enviar mensagens a outros agentes: o humano encaminhara os relatorios.
