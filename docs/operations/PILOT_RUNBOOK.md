# Runbook de Operação do Piloto — Travel Platform

Guia objetivo para quem opera o piloto no dia a dia. Não descreve automação que não existe — cada procedimento aqui reflete exatamente o que o sistema real faz hoje.

## Antes do piloto

1. Confirmar que o ambiente de piloto **não é** o staging local desta máquina — precisa ser um ambiente real (ver `docs/release/RELEASE_CANDIDATE_VALIDATION.md`, GAP OPERACIONAL de staging remoto).
2. Resolver o bloqueio de e-mail (Fase 4 do relatório de validação) antes de convidar qualquer pessoa externa à agência piloto — sem isso, todo convite/reset de senha exige envio manual do link pelo operador.
3. Configurar as variáveis de versão (`GIT_SHA`/`BUILD_SHA`, etc.) no ambiente real, para que `/version` reporte o commit correto.
4. Gerar e guardar um backup do banco recém-provisionado, antes de qualquer dado real entrar (ver seção "Como restaurar banco" abaixo para o comando exato).
5. Definir a agência piloto: nome real, responsável (futuro OWNER), e-mail de contato real.

## Durante o onboarding da agência piloto

1. Criar a conta via Signup real (`/signup` em `apps/agency`, ou `TrialSignup` em `apps/marketing` — ambos chamam o mesmo endpoint real `POST /api/agencies/signup`).
2. O primeiro login do OWNER dispara o redirecionamento automático para `/onboarding` (checado via `agencies.onboarding_completed_at`).
3. Seguir o wizard real: Perfil → Marca → Equipe → Concluído.
4. **Convite de funcionário:** enquanto o e-mail real não estiver configurado, o link de ativação aparece diretamente na tela do wizard ("Link de ativação — copie e envie manualmente"). Copiar e enviar esse link por um canal confiável (não é um problema de segurança do link em si — o token é real e de uso único — o problema é a ausência de um canal automático de entrega).
5. Confirmar que o funcionário convidado consegue aceitar o convite e logar.

## Durante a operação

- **Cadastro de clientes, viagens, ofertas, pipeline, financeiro:** seguir o fluxo real da agência, sem atalhos. Qualquer dado inserido é real e permanece no banco de produção do piloto.
- **Customer Portal:** o cliente final loga com a conta criada pela agência (`customer_accounts`), não com a conta de staff.
- Verificar periodicamente `/health` e `/readiness` do ambiente real do piloto (não apenas confiar que "está no ar").

## Como escalar um incidente

1. Registrar o horário exato e o que foi observado (tela, ação, erro exibido).
2. Verificar `GET /health` e `GET /readiness` do ambiente do piloto.
3. Verificar os logs da API (estruturados em JSON via `pino`) por `correlationId`/`requestId` da requisição afetada, se conhecido.
4. Se for um erro `500`: verificar se é um problema de banco (`errorCode` no log, ex. `42501` já visto e corrigido nesta rodada) ou de código.
5. Se for um erro de dados cruzados entre agências (vazamento de tenant): **tratar como P0 imediatamente**, suspender o acesso afetado (ver "Como suspender usuário" abaixo) e escalar para engenharia antes de qualquer outra ação.

## Como recuperar uma conta

- **Esqueci minha senha (staff):** fluxo real em `/forgot-password` → `/reset-password?token=...`. Sem e-mail real configurado, o token não chega automaticamente — hoje não há endpoint de "gerar link e mostrar na tela" para reset de senha (diferente do convite de funcionário). **Enquanto o e-mail real não existir, um reset de senha de piloto real exige acesso direto ao banco de staging para gerar/consultar o token — não é um fluxo self-service until o e-mail for resolvido.**
- **Esqueci minha senha (cliente do portal):** mesmo princípio, via `/customer-auth/forgot-password`.

## Como restaurar o banco

Testado e validado nesta rodada (`docs/operations/BACKUP_RESTORE_VALIDATION.md` tem a evidência completa). Comando real:

```bash
# Gerar backup
docker exec <container-postgres> pg_dump -U <usuario> -d <banco> -Fc -f /tmp/backup.dump
docker cp <container-postgres>:/tmp/backup.dump ./backup.dump

# Restaurar (em banco novo/descartável primeiro, nunca direto em produção sem testar)
docker exec <container-postgres> psql -U <usuario> -d postgres -c "CREATE DATABASE restore_test;"
docker cp ./backup.dump <container-postgres>:/tmp/backup.dump
docker exec <container-postgres> pg_restore -U <usuario> -d restore_test /tmp/backup.dump
```

Depois de restaurar, sempre validar (não assumir que funcionou só porque não deu erro):
```sql
SELECT count(*) FROM pg_tables WHERE schemaname='public';  -- deve bater com o original
SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname='customers';  -- deve ser t, t
```

## Como suspender um usuário

- Staff: `status`/`role` do usuário via rota administrativa existente (`services/api/src/routes/settings-expanded.ts` e afins) — não inventar um mecanismo novo. Suspender revoga sessões ativas (confirmado pelo padrão de `auth_sessions.invalidated_at`, já coberto pelos testes de segurança).
- Cliente do portal: mesmo princípio via `customer_accounts.status`.

## Como resetar MFA

- Não existe endpoint de "reset de MFA por um administrador" nesta rodada — o backend expõe `enroll`/`enroll/confirm`/`disable` (`services/api/src/routes/auth.ts`), mas nenhuma UI de administrador para forçar isso em nome de outro usuário foi encontrada nesta sessão. Se um piloto perder acesso ao MFA, hoje isso exige intervenção direta no banco (desabilitar `mfa_requirements`/remover `mfa_totp_secrets` da conta afetada) até que uma UI administrativa exista. **Não inventar um fluxo de reset que não existe — documentar isso ao operador do piloto antes de começar.**

## Como registrar um bug encontrado durante o piloto

1. Classificar imediatamente: P0 (vazamento de dados, bypass de auth, perda de dados, sistema fora do ar, falha grave financeira), P1 (fluxo principal quebrado), P2 (UX relevante com workaround), P3 (polimento).
2. P0/P1: escalar imediatamente, não esperar o próximo ciclo de release.
3. Registrar: tela, ação exata, dado esperado vs. real, se reproduzível, screenshot se possível.

## Como encerrar o piloto

1. Gerar um backup final do banco do piloto (mesmo procedimento acima).
2. Coletar feedback estruturado da agência piloto.
3. Classificar todo pedido de mudança pós-piloto como `PILOT BLOCKER` (nenhum deveria restar, se o piloto foi bem-sucedido), `POST-PILOT` (planejado para depois) ou `BACKLOG` (sem compromisso de data) — nunca aceitar feature nova "no meio" do piloto sem essa classificação.
4. Decidir, com o dono do produto, se os dados do piloto continuam (agência real vira cliente) ou são arquivados/removidos.
