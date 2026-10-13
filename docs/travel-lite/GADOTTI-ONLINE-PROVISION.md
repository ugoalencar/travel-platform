# Provisionamento Online da Gadotti

Rotina única que entrega as cinco contas da B&B GADOTTI VIAGENS LTDA no
ambiente online do Travel Lite (serviço Render `travel-lite`, plano Free, sem
Shell/SSH). Ela roda **dentro do container**, na inicialização, porque o
`DATABASE_URL` só resolve na rede interna do Render.

## Como funciona

- `Dockerfile.travel-lite` inicia `scripts/travel-lite-entrypoint.cjs`. Sem
  `TRAVEL_LITE_GADOTTI_PROVISION` ele apenas inicia a API (comportamento
  idêntico ao anterior). Com a variável, executa a rotina antes de subir a API;
  qualquer falha é registrada sem dados e **não impede** a API de iniciar.
- Nenhum endpoint público é criado.
- Tudo ocorre em **uma transação** com contexto de tenant (`set_tenant_context`),
  pois `users`, `sellers`, `user_permissions` e `audit_logs` têm RLS forçado.
  `dry-run` executa todos os passos e termina com `ROLLBACK`.

## Garantias verificadas antes de qualquer escrita

| Verificação | Recusa quando |
| --- | --- |
| Banco | `current_database()` ≠ `travel_lite` ou o papel contorna RLS |
| Esquema | faltam as migrations 001–007 |
| Tenant | slug `gadotti` ausente, nome diferente de B&B GADOTTI VIAGENS LTDA ou inativo (a rotina nunca cria tenant) |
| Usuários | nome, perfil ou status divergentes; outro MASTER no tenant |
| Vendedores | vínculo com outro usuário; ambiguidade (o vendedor sem vínculo que compartilha o e-mail de Andrielle é ignorado, pois o nome difere) |

## O que é aplicado

1. Senha temporária (hash scrypt compatível com a aplicação) para as cinco
   contas, **exceto** quem já escolheu a própria senha
   (`USER_REQUIRED_PASSWORD_CHANGED`). Sessões ativas dessas contas são revogadas.
2. Evento `USER_PASSWORD_RESET` (`entity_type = 'user'`), que ativa a troca
   obrigatória no primeiro login.
3. Funcionárias (SELLER): overrides para que as permissões efetivas sejam
   exatamente `customers.create`, `customers.read_own`, `customers.update_own`,
   `sales.create`, `sales.read_own`, `sales.update_own`. Isso remove também
   `commissions.read_own` e `reports.sales_own`, que o perfil traz por padrão
   (sem elas o dashboard fica vazio). A rotina confere o resultado com a mesma
   consulta de permissões efetivas da aplicação antes de confirmar.
4. Patricia segue MASTER e pode ampliar/restringir as permissões pela aplicação.
5. Auditoria **atômica** na mesma transação, sem usuário executor
   (`user_id` nulo, `metadata.source = travel-lite-gadotti-online`): nada é
   atribuído a uma funcionária nem à Patricia. `granted_by` também fica nulo.
6. Marcador `GADOTTI_PROVISION_COMPLETED`: a rotina é **executada uma única
   vez**. Reinícios não reaplicam restrições depois que Patricia alterar
   permissões.

## Operação (Render Free)

Segredos (nunca em código, comando ou chat): `TRAVEL_LITE_GADOTTI_PASSWORDS_JSON`
(objeto e-mail → senha, 12–200 caracteres, todas distintas), além de
`TRAVEL_LITE_ONLINE_PROVISION_CONFIRM=gadotti`.

1. Definir `TRAVEL_LITE_GADOTTI_PROVISION=dry-run` e os dois segredos; fazer o
   deploy da revisão. Ler a linha `[gadotti-provision] {...}` nos logs: deve
   trazer `mode: "dry-run"`, cinco usuários e nenhuma senha, e-mail ou hash.
2. Trocar para `apply`; redeploy. Conferir `password: "temporary-set"`.
3. **Remover** `TRAVEL_LITE_GADOTTI_PROVISION`, `TRAVEL_LITE_ONLINE_PROVISION_CONFIRM`
   e `TRAVEL_LITE_GADOTTI_PASSWORDS_JSON` e redeploy. Se uma variável sobrar, o
   marcador impede nova aplicação (`alreadyProvisioned: true`).
4. Validar o login de cada conta (deve responder `passwordChangeRequired`).

O documento privado de credenciais só deve marcar uma senha como efetiva após
o passo 2 e a validação do passo 4.

## Histórico de vendas

`PATCH /sales/:id` registra `SALE_UPDATED` com `changed_fields` e pares
`old_<campo>`/`new_<campo>`; `SALE_CREATED`, `SALE_CONFIRMED` e `SALE_CANCELLED`
registram valores iniciais e transição de status. Esses eventos são
**obrigatórios**: se a auditoria falhar, a operação inteira é desfeita.
`GET /sales/:id/history` devolve quem (nome do usuário), quando e os campos
alterados, respeitando o escopo de leitura do usuário.

Textos acima de 500 caracteres são truncados no histórico (`<campo>_truncated`).
