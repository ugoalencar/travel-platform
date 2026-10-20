# Entrega Travel Lite — Gadotti (online): relatório parcial

Data/hora: 2026-10-13, 11:15 (America/Sao_Paulo)
Status: **código pronto e testado; execução online NÃO realizada (bloqueio de acesso).**
Nenhuma alteração foi feita no Render, no banco online ou no serviço `travel-platform`.

## 1. Estado real encontrado (somente leitura, via conector Render)

- Serviço `travel-lite` (`srv-davu7grtqb8s73dqqpt0`): Free, Docker, branch `main`, autoDeploy ligado, deploy `live` do commit `5a70db4`.
- Banco `travel-lite-db` (PostgreSQL 18, `travel_lite`, papel `travel_lite_runtime` sem BYPASSRLS). Migrations 001–007 aplicadas. **Expira em 2026-11-01** (plano Free).
- Tenant `gadotti` existe (criado 2026-09-30, nome correto, ACTIVE). Há também o tenant `demo`.
- **As cinco contas já existem** (Patricia MASTER; quatro SELLER), todas ativas e vinculadas a vendedores. Sem overrides de permissão, sem evento `USER_PASSWORD_RESET` (não há troca obrigatória hoje). Só a Patricia fez login (até 2026-10-02). Existem 6 sessões.
- Existe um 7º vendedor, "Morro De São Paulo Marcia", que **compartilha o e-mail de Andrielle** e não tem usuário.
- Dados da Gadotti: 57 vendas, 1 cliente.
- Portanto as senhas temporárias ainda **não estão configuradas**; as contas seguem com as senhas antigas.

## 2. Falhas do script preliminar (corrigidas)

1. Ignorava RLS forçado: sem `set_tenant_context` não enxergaria nem inseriria `users`, `sellers`, `user_permissions` nem `audit_logs`.
2. Auditoria com `entity_type = 'USER'` (a aplicação lê `'user'`): a troca obrigatória **nunca seria ativada**.
3. Buscava vendedor por e-mail e abortaria com o e-mail duplicado de Andrielle.
4. Não validava a identidade do banco; criava tenant; só reforçava restrições na criação.
5. Não substituía a senha de contas já existentes; reexecução reaplicaria restrições após edição da Patricia.
6. Imprimia `error.message` do banco (pode conter dados) e atribuía `granted_by` à Patricia.

## 3. O que foi implementado (branch `feat/gadotti-online-provision`, commit `1d1ec66`, enviada ao GitHub; `main` intacta)

- Provisionamento único, transacional, com contexto de tenant, verificação de banco/esquema/tenant/perfis, `dry-run`, marcador `GADOTTI_PROVISION_COMPLETED`, auditoria atômica sem usuário executor, revogação de sessões, permissões efetivas conferidas (exatamente as 6 para vendedoras) e saída sem senha/hash/e-mail/erro de banco.
- `Dockerfile.travel-lite` → `scripts/travel-lite-entrypoint.cjs` (inerte sem `TRAVEL_LITE_GADOTTI_PROVISION`; falha nunca impede a API de subir).
- Auditoria de vendas: eventos obrigatórios (se a auditoria falha, a operação é desfeita) com valores anteriores/novos por campo; `GET /sales/:id/history` (quem, quando, o quê).
- Dois defeitos reais corrigidos no caminho: editar só `gross_amount` zerava o custo e violava `sales_check` (500); cancelar venda com comissão `PENDING_RULE` violava `seller_commissions_check` (500).
- Runbook atualizado em `docs/travel-lite/GADOTTI-ONLINE-PROVISION.md`.

## 4. Testes (Postgres descartável real, Docker)

- Suíte api-lite: 185 aprovados / 2 falhas **preexistentes e alheias** (`catalog` e `customers`: regex em inglês vs. mensagem em pt-BR).
- Novos: 14 de provisionamento (dry-run sem efeito, rollback, reexecução, conflitos, isolamento de tenant, troca obrigatória de senha, login do vendedor com acesso só ao próprio, Patricia ampliando permissões, senha escolhida pelo usuário preservada, auditoria sem executor, sem vazamento) + 8 de auditoria de vendas + 3 unitários.
- Typecheck e eslint dos arquivos alterados: limpos.
- **Não testado**: build da imagem Docker (o build local foi negado pelo classificador de permissões); será validado pelo `dry-run` online.

## 5. Bloqueios e pendências

1. **RENDER_API_KEY** (arquivo `D:\travel-platform\.render-api-key.tmp` está vazio). O conector MCP não troca a branch do serviço e só define variáveis expondo os valores (as senhas passariam pela ferramenta). Com a chave, o operador local (`render-gadotti-ops.cjs`, no scratchpad da sessão) faz: trocar branch (autoDeploy desligado), definir os 3 segredos lendo o documento privado sem imprimir, deploy `dry-run`, ler logs, `apply`, remover segredos, validar logins.
2. **Incidente de sigilo**: por falha minha de máscara, três senhas temporárias (Patricia, Nykaya, Letícia) apareceram na saída de uma ferramenta nesta sessão. Recomendada rotação das três no Bitwarden/documento antes de aplicar.
3. Ao final, o serviço ficará na branch `feat/gadotti-online-provision` até a decisão de merge (a main não tem a auditoria de vendas nem o entrypoint).
4. Observação de produto: o detalhe da venda mostra custo, margem e comissão ao vendedor dono da venda; as seis permissões não bloqueiam isso. Decisão de negócio pendente.
5. Interface do histórico de vendas (tela) não implementada; só a API.
6. O documento privado de credenciais ganhou a seção "Estado do provisionamento online": todas **PENDENTE**.
