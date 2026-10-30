# Implementação CEP-01 no Full — relatório local

Data: 2026-10-23
Workspace: `D:\travel-platform`
Branch: `wip/organizacao-2026-10-20`
Escopo: CEP-01 no produto Full, somente local. CSV-01, DASH-01, Gadotti/Lite,
schema, financeiro, folha, comissões e `errors.ts` não foram alterados por
esta tarefa; alterações preexistentes do working tree foram preservadas.

## Resultado

CEP-01 foi implementado no Full com testes escritos antes do código:

- Proxy server-side autenticado para ViaCEP, com URL fixa, CEP normalizado,
  timeout, teto de resposta, cache limitado, deduplicação, limites por principal
  e limite global.
- Flag `TRAVEL_API_CEP_PROVIDER` fail-closed em produção.
- Rota `GET /cep/lookup` com `AGENT+`, contexto derivado do tenant autenticado,
  `no-store` inclusive em respostas de hooks de autenticação, e tradução
  explícita dos erros do provider.
- Cliente Full `lookupCep(cep, signal?)` reutilizando o `request` existente.
- Campo CEP controlado no modal Novo endereço, com mapeamento
  `neighborhood -> district`, debounce, cancelamento, descarte de resposta
  atrasada, preservação de edição manual, reconsulta e retry.
- CEP com rua seguido de CEP genérico limpa a rua automática antiga, sem apagar
  campos manuais.

Nenhuma chamada real ao ViaCEP foi feita. Nenhum banco, migration, `.env`,
dependência, acesso remoto, deploy, commit ou push foi executado.

## Arquivos novos

- `services/api/src/cep.ts`
- `services/api/src/routes/cep.ts`
- `services/api/tests/cep.test.ts`
- `services/api/tests/cep-routes.test.ts`
- `apps/agency/src/components/customer/CustomerCepField.tsx`
- `apps/agency/src/components/customer/CustomerCepField.test.tsx`
- `.opencode/RELATORIO-IMPLEMENTACAO-CEP-FULL-2026-10-23.md`

## Arquivos adaptados

- `services/api/src/app.ts`
  - `BuildAppOptions.cepLookup`
  - registro de `registerCepRoutes`
  - `cache-control: no-store` para `/cep/*` no hook global `onSend`, cobrindo
    também falhas dos hooks de autenticação
- `services/api/src/server.ts`
  - instancia `CepLookup` com `resolveCepProviderEnabled(process.env)`
- `apps/agency/src/lib/api.ts`
  - `CepLookupResult`
  - `lookupCep(cep, signal?)`
- `apps/agency/src/pages/CustomerDetailPage.tsx`
  - estado controlado do rascunho de endereço
  - integração de `CustomerCepField`
  - aplicação condicional dos campos do CEP
  - payload de criação lendo o rascunho controlado
- `apps/agency/src/pages/CustomerDetailPage.test.tsx`
  - mocks de `lookupCep` e `createCustomerAddress`
  - teste de integração do modal com CEP, número/complemento manuais e payload

## Contrato implementado

### Backend

- Papel mínimo: `UserRole.AGENT`, igual à criação/edição de endereços do Full.
- Principal: `agencyId:userId` do contexto autenticado; `agencyId` de query é
  ignorado.
- URL fixa: `https://viacep.com.br/ws/{cep}/json/`, `redirect: 'error'`.
- Timeout: 3 s; teto de resposta: 16 KiB; validação de content-type, CEP
  retornado, UF e campos.
- Cache: 24 h, 500 entradas por instância.
- Limites: 10 consultas/min por principal, 60 consultas/min globais, 10
  concorrentes, 1.000 principals na janela.
- Erros tipados `CepError`: 404, 429, 502, 503 e 504, traduzidos na rota.
- `retry-after: 60` apenas em 429.
- `cache-control: no-store` em sucesso e erro.
- `logLevel: 'silent'` na rota; erros do provider não carregam payload de
  cliente nem detalhes do upstream.
- Produção: só habilita com `TRAVEL_API_CEP_PROVIDER=viacep`.
- `disabled`: desabilita. Valor desconhecido: desabilita.
- Dev/test sem variável: habilita como o Lite; testes usam `fetcher` falso.
- Persistência de CEP não foi endurecida e o schema não foi alterado.

### Frontend

- Reutiliza `request` (Bearer/session/erros existentes), sem segundo cliente.
- `AbortController` ao trocar CEP ou fechar o modal.
- Debounce de 400 ms e descarte de resposta antiga.
- Mapeamento explícito de `neighborhood` para `district`.
- Preserva campos editados manualmente, inclusive número e complemento.
- Retry após falha; salvamento manual continua possível.
- Rua automática é limpa quando o novo CEP é genérico; edição manual de rua é
  preservada.

## Testes

### Contagem final

- `services/api/tests/cep.test.ts`: 15 testes
- `services/api/tests/cep-routes.test.ts`: 15 testes
- `apps/agency/src/components/customer/CustomerCepField.test.tsx`: 9 testes
- `apps/agency/src/pages/CustomerDetailPage.test.tsx`: 8 testes (1 novo)
- Total CEP direto: 47 testes
- Regressão adicional executada: 50 testes de API + 15 de `CustomersPage`

### Cobertura relevante

- Normalização de CEP com zeros à esquerda.
- Flag de produção/dev/test e valores desconhecidos.
- URL fixa, cache, deduplicação, sem dados de cliente no request.
- CEP inexistente, genérico, JSON malformado, resposta inválida, resposta
  grande, timeout.
- Limite por principal, janela, expiração de cache e tamanho do cache.
- Erro sanitizado sem vazar texto do upstream.
- 401/403 antes do lookup; AGENT/MANAGER/OWNER/ADMIN permitidos.
- Tenant autenticado prevalece sobre `agencyId` de query.
- `no-store` em sucesso, validação, 401, 403, 404, 429, 502, 503, 504 e 500.
- `retry-after` somente em 429.
- Erro inesperado não expõe mensagem interna.
- Componente: debounce, preenchimento, sem consulta ao abrir com endereço,
  edição manual em voo, descarte de resposta atrasada, genérico após rua,
  retry, abort no unmount e ausência de fetch direto ao ViaCEP.
- Página: preenchimento pelo CEP, número/complemento preservados e payload de
  criação correto.

## Comandos executados

Todos os comandos abaixo foram executados em `D:\travel-platform`.

| Comando | Resultado |
| --- | --- |
| `npm run test -w services/api -- tests/cep.test.ts tests/cep-routes.test.ts` (primeira execução, código ainda ausente) | exit 1; falha esperada de importação; 0 testes |
| `npm run test -w apps/agency -- src/components/customer/CustomerCepField.test.tsx` (primeira execução, componente ainda ausente) | exit 1; falha esperada de importação; 0 testes |
| `npm run test -w services/api -- tests/cep.test.ts tests/cep-routes.test.ts` | exit 0; 30 testes |
| `npm run test -w apps/agency -- src/components/customer/CustomerCepField.test.tsx src/pages/CustomerDetailPage.test.tsx` | exit 0; 17 testes |
| `npm run test -w apps/agency -- src/pages/CustomersPage.test.tsx` | exit 0; 15 testes |
| `npm run test -w services/api -- tests/api-foundation.test.ts tests/security-headers.test.ts tests/request-body-errors.test.ts` | exit 0; 50 testes |
| `npm run typecheck -w services/api` | exit 0 |
| `npm run typecheck -w apps/agency` | exit 0 |
| `npm run lint -w services/api` | exit 0; 13 warnings preexistentes, 0 erros |
| `npm run lint -w apps/agency` | exit 0; 1 warning preexistente, 0 erros |
| `npm run build -w services/api` | exit 0 |
| `npm run build -w apps/agency` | exit 0; aviso de chunk > 500 kB |
| `git diff --check` nos arquivos da tarefa | sem erros de whitespace; apenas avisos de LF/CRLF |

## Verificações não realizadas

- `npm run test:db` e qualquer teste com banco real ou fixtures de banco.
- Chamada real ao ViaCEP ou teste online.
- Aceite visual/browser do modal.
- Teste de migração, schema ou persistência de CEP legado.
- Teste de integração com SEC-01 (RBAC por usuário), ainda não implementado.
- Validação em ambiente remoto, staging ou produção.
- Commit, push, PR ou deploy.

## Observações para revisão

- O `no-store` de erros de autenticação é garantido pelo hook global de
  `onSend` em `app.ts`; o teste HTTP replica esse hook para cobrir 401/403 sem
  banco.
- `CustomerDetailPage` usa um rascunho controlado; os campos de endereço não são
  mais lidos de `FormData`, exceto `type` e `isPrimary`.
- O teste de componente usa um harness que renderiza os campos de endereço,
  porque `CustomerCepField` é responsável apenas pelo CEP.
- A alteração preexistente `payableId?: string` em `apps/agency/src/lib/api.ts`
  não faz parte desta tarefa e foi preservada.
- O working tree contém muitas alterações preexistentes; nenhuma foi revertida.
