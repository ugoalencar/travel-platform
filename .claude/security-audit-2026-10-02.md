# Auditoria de segurança — Travel Platform / Travel Lite

- **Data:** 2026-10-02
- **Autorização:** teste de ataque controlado, autorizado pelo dono do sistema, para produzir relatório de vulnerabilidades antes de publicação online (ambientes `gadotti` e `demo`).
- **Escopo:** revisão de código-fonte e configuração do repositório local (`services/api`, `services/api-lite`, `apps/agency`, `apps/platform-admin`, `apps/travel-lite`, rotas de autenticação do `apps/customer`). Nenhum ambiente de produção, staging real, domínio público, DNS ou credencial real foi tocado. Nenhum `.env` real foi lido.
- **Método:** revisão estática de código, leitura de rotas HTTP, revisão de configuração (CORS/CSP/rate-limit), varredura de segredos (`scripts/check-secrets.cjs`), e checagem cruzada entre documentação e implementação real. **Não foram feitas chamadas HTTP contra servidores locais nesta rodada** (nenhum servidor foi levantado) — a verificação foi por leitura de código, não por exploração dinâmica. Isso está registrado como limitação de método na seção 5.
- **Estado do repositório:** branch `main`, com alterações não commitadas no momento da auditoria (tradução de mensagens de erro do `api-lite` para pt-BR, sem relação com os achados abaixo). A auditoria cobre o estado atual da árvore de trabalho.

---

## 1. Resumo executivo

O backend Full (`services/api`) tem uma base de segurança sólida: hashing de senha com scrypt, anti-enumeração de contas, revogação de sessão no reset de senha, auditoria estruturada, CORS com allowlist, CSP e HSTS reais. O Travel Lite (`services/api-lite`) está **bem atrás** nesse mesmo padrão e tem lacunas que impedem a publicação segura hoje.

**Os três achados mais importantes:**

1. **A verificação do código MFA (TOTP) não tem proteção de força bruta dedicada**, nem no Full nem no Platform Admin. Isso vale tanto para `/auth/mfa/verify` quanto para `/platform-auth/mfa/verify`.
2. **O login do Travel Lite não tem nenhum limite de tentativas.** Diferente do Full e do Platform Admin, que têm bloqueio por conta+IP, o Lite aceita tentativas ilimitadas.
3. **O Travel Lite não tem recuperação de senha nem CSP**, e guarda o token de sessão em `localStorage` — justamente o armazenamento que o Full decidiu explicitamente não usar.

Nenhum desses achados expõe segredo real nem exige acesso a produção para ser confirmado; todos foram verificados lendo o código-fonte que roda hoje.

## 2. Matriz de severidade

| Severidade | Quantidade |
|---|---|
| Crítico | 1 |
| Alto | 3 |
| Médio | 2 |
| Baixo | 2 |
| Informativo | 2 |

---

## 3. Achados

### [CRÍTICO-01] Login do Travel Lite sem nenhum limite de tentativas

- **Componente:** `services/api-lite`
- **Arquivo:** `services/api-lite/src/app.ts` (nenhum hook de rate limit registrado); `services/api-lite/src/routes/auth.ts` (`POST /auth/login`)
- **Rota afetada:** `POST /auth/login` (e por extensão todas as rotas do Lite, nenhuma tem limite)
- **Pré-condição:** nenhuma. Qualquer pessoa com acesso de rede ao Lite.
- **Passos para reproduzir (ambiente local):**
  1. Suba o `api-lite` localmente.
  2. Envie `POST /auth/login` repetidamente com a mesma agência e e-mail, variando a senha.
  3. Confirme no código: `services/api-lite/src/app.ts` registra `helmet` e `cors`, mas **nenhum** `addHook('onRequest', ...)` de limite de taxa, e `grep -rn "rate.*limit" services/api-lite/src` não retorna nada.
- **Impacto:** força bruta de senha sem nenhuma barreira automática. Combinado com a ausência de MFA no Lite (ponto 5 abaixo), uma senha comprometida ou fraca vira acesso total à agência sem segundo fator e sem limite de tentativas.
- **Recomendação:** antes do go-live, portar para o `api-lite` o mesmo padrão de `LoginAbuseProtector` (bloqueio por conta+IP) e um limite básico por IP para todas as rotas, nos mesmos moldes do `services/api/src/rate-limit.ts`.
- **Sugestão de teste automatizado:** teste de integração que envia N tentativas de login com senha errada e espera 429 a partir de um limite definido, hoje inexistente no `api-lite`.

---

### [ALTO-01] Verificação de código MFA sem proteção de força bruta dedicada (Full e Platform Admin)

- **Componente:** `services/api`
- **Arquivo:** `services/api/src/rate-limit.ts:397-414` (função `classifyRateLimitRequest`)
- **Rota afetada:** `POST /auth/mfa/verify` e `POST /platform-auth/mfa/verify`
- **Pré-condição:** o atacante já tem usuário e senha válidos (ou os descobriu) de uma conta com MFA ativado, e está na etapa `MFA_REQUIRED`.
- **Passos para reproduzir (análise estática, confirmável em ambiente local):**
  1. Em `rate-limit.ts`, a classificação de rota é: `/auth/login` e `/platform-auth/login` → `AUTH_LOGIN` (10/15min); rotas que batem no regex `/^\/(auth|customer-auth|platform-auth)\/(forgot|recover|reset)/` ou `/platform-auth/mfa/reset` → `AUTH_RECOVERY` (5/15min).
  2. `/auth/mfa/verify` e `/platform-auth/mfa/verify` **não batem em nenhuma das duas regras** (o path não começa com `forgot`, `recover` nem `reset`).
  3. O código cai no `return isWrite ? RateLimitClass.STAFF_WRITE : RateLimitClass.STAFF_READ;` final — `STAFF_WRITE` permite **300 requisições por minuto por IP** (`rate-limit.ts:187`), e esse limite é só por IP, não por conta (diferente do `LoginAbuseProtector`, que só envolve `/auth/login` e `/platform-auth/login`, não o `/mfa/verify`).
  4. O próprio código comenta, na rota de reset de MFA (`routes/platform-auth.ts:163`), "Rate-limited as AUTH_RECOVERY" — evidência de que a intenção era proteger as rotas de MFA com esse nível, mas o `mfa/verify` ficou de fora da regex.
- **Impacto:** um código TOTP tem 6 dígitos (1.000.000 de combinações). A 300 tentativas por minuto por IP, um único IP consegue ~450 tentativas dentro da janela de validade de um código (±1 passo, ~90s). Não é instantâneo, mas é uma escala muito maior que o esperado para esse tipo de endpoint, e nada impede o uso de múltiplos IPs para paralelizar. Um acerto autentica totalmente a conta — tipicamente OWNER/ADMIN, já que o MFA é obrigatório por padrão para esses perfis (`local-auth.ts:248`).
- **Recomendação:** incluir `/auth/mfa/verify`, `/platform-auth/mfa/verify` e `/customer-auth/mfa/verify` (se existir) na classe `AUTH_RECOVERY`, e idealmente envolver a verificação de MFA no mesmo `LoginAbuseProtector` por conta, não só por IP.
- **Sugestão de teste automatizado:** teste unitário de `classifyRateLimitRequest('POST', '/auth/mfa/verify')` esperando `RateLimitClass.AUTH_RECOVERY`, hoje falharia retornando `STAFF_WRITE`.

---

### [ALTO-02] Travel Lite sem recuperação de senha

- **Componente:** `services/api-lite`
- **Arquivo:** `services/api-lite/src/routes/auth.ts` (nenhuma rota `forgot`/`reset`)
- **Rota afetada:** nenhuma — é uma ausência de rota.
- **Pré-condição:** uma pessoa com perfil MASTER esquece a senha, ou a agência tem só um MASTER e ele é desligado/perde acesso.
- **Passos para reproduzir:** `grep -n "forgot\|reset.*password" services/api-lite/src/routes/auth.ts` não retorna nada; comparado a `services/api/src/routes/auth.ts`, que tem `/auth/forgot-password` e `/auth/reset-password` completos.
- **Impacto:** sem um segundo MASTER, a agência fica sem forma de recuperar acesso administrativo sem intervenção manual no banco. Isso também já está documentado como limitação conhecida no manual do usuário (PX7), então não é surpresa, mas é um bloqueador real para um go-live sem suporte humano constante.
- **Recomendação:** decidir, antes de publicar `gadotti`/`demo` online, se (a) implementa-se um fluxo mínimo de reset por e-mail no Lite antes do go-live, ou (b) se aceita o risco documentando um procedimento operacional de recuperação manual e garantindo pelo menos 2 MASTERs por agência.
- **Sugestão de teste automatizado:** não aplicável até a funcionalidade existir; quando implementada, replicar a bateria de testes do Full (anti-enumeração, expiração, revogação de sessões).

---

### [ALTO-03] Travel Lite sem CSP e com token de sessão em `localStorage`

- **Componente:** `services/api-lite` e `apps/travel-lite`
- **Arquivo:** `services/api-lite/src/app.ts:45` (`helmet(..., { contentSecurityPolicy: false })`); `apps/travel-lite/src/api.ts` (token lido de `localStorage`, confirmado em sessões anteriores desta auditoria/trabalho: `travel_lite_token`)
- **Pré-condição:** existência de qualquer vulnerabilidade de XSS no Travel Lite (refletido, persistente ou via dependência de terceiros).
- **Passos para reproduzir (análise estática):**
  1. `services/api-lite/src/app.ts` desativa explicitamente a CSP (`contentSecurityPolicy: false`), enquanto `services/api/src/app.ts:216-229` define uma CSP real e HSTS condicional a produção.
  2. O token de sessão do Lite é lido de `localStorage` (`readSession()` em `apps/travel-lite/src/api.ts`).
  3. Compare com `apps/agency/src/lib/session.ts:1-12` e `apps/platform-admin/src/lib/platformSession.ts`, que usam **`sessionStorage`** de propósito, com o comentário explícito: "sessionStorage... is the storage explicitly ruled out for this token" (ou seja, `localStorage` foi avaliado e rejeitado para os outros dois apps, mas o Lite não seguiu a mesma decisão).
- **Impacto:** sem CSP, uma falha de XSS (por exemplo, via uma dependência futura, ou um campo mal sanitizado) tem muito mais liberdade para executar script arbitrário. Combinado com o token em `localStorage` (que sobrevive ao fechamento da aba/navegador, diferente de `sessionStorage`), um XSS no Lite resulta em **tomada de conta persistente**, não limitada à sessão do navegador.
- **Recomendação:** antes do go-live: (1) ativar uma CSP real no `api-lite`, no mesmo padrão do Full; (2) migrar o armazenamento do token do Lite de `localStorage` para `sessionStorage`, seguindo a decisão já tomada e documentada para os outros dois apps.
- **Sugestão de teste automatizado:** teste de integração verificando o header `content-security-policy` presente nas respostas do `api-lite`; teste de frontend confirmando que o token não é gravado em `localStorage`.

---

### [MÉDIO-01] CORS do Travel Lite sem lista de origens permitidas

- **Componente:** `services/api-lite`
- **Arquivo:** `services/api-lite/src/app.ts` (`cors, { origin: true, credentials: false }`)
- **Pré-condição:** nenhuma — afeta qualquer requisição cross-origin.
- **Passos para reproduzir:** comparar com `services/api/src/app.ts:178-186`, que resolve uma `corsPolicy` com `isOriginAllowed(origin, corsPolicy)` explícita.
- **Impacto:** `origin: true` reflete qualquer `Origin` enviado pelo navegador. O risco prático é reduzido porque a autenticação é por Bearer token (não cookie) e `credentials: false`, então um site atacante não consegue automaticamente anexar o token de outra aba — ele precisaria primeiro roubar o token via XSS (achado ALTO-03). Ainda assim, não é configuração de menor privilégio e destoa do padrão já aplicado no Full.
- **Recomendação:** restringir a origens conhecidas (o próprio domínio da agência e, se necessário, `localhost` em desenvolvimento), replicando o padrão do Full.
- **Sugestão de teste automatizado:** teste de integração enviando `Origin: https://atacante.example` e verificando que o header `access-control-allow-origin` não reflete uma origem fora da lista.

---

### [MÉDIO-02] Sem troca de senha autenticada (self-service) no Full

- **Componente:** `services/api`
- **Arquivo:** `services/api/src/routes/auth.ts` (rotas públicas e autenticadas listadas no cabeçalho do arquivo, linhas 7-13)
- **Pré-condição:** usuário já logado quer trocar a própria senha sem passar pelo fluxo de e-mail.
- **Passos para reproduzir:** não existe nenhuma rota `PATCH`/`POST` de "trocar minha senha" para usuário autenticado; a única forma de trocar senha é `forgot-password` → e-mail → `reset-password`.
- **Impacto:** baixo/médio. Não é uma vulnerabilidade de invasão, mas é uma lacuna de usabilidade e de resposta a incidente: se um usuário desconfia que a própria senha foi vista por alguém, ele não consegue trocá-la na hora sem depender do e-mail. Isso também responde parcialmente a uma das perguntas do foco especial do prompt ("existe troca de senha pelo próprio usuário logado?") — a resposta é não, nem no Full nem no Lite.
- **Recomendação:** considerar endpoint autenticado de troca de senha (exige senha atual, re-hash, e idealmente revogação das demais sessões), reaproveitando a lógica já existente em `resetPassword`.
- **Sugestão de teste automatizado:** quando implementado, testar que a senha atual incorreta é rejeitada e que as demais sessões são revogadas após a troca.

---

### [BAIXO-01] Mensagens de erro em inglês na interface do Travel Lite (correção em andamento)

- **Componente:** `apps/travel-lite`, `services/api-lite`
- **Observação:** no momento da auditoria havia uma alteração **não commitada** em `services/api-lite/src/errors.ts` traduzindo essas mensagens para pt-BR, já em andamento por outra frente de trabalho. Mensagens como "Invalid credentials" e "Only CSV or XLSX uploads are allowed" não vazam nenhum dado sensível, mas destoam da identidade visual/idioma do produto.
- **Impacto:** nenhum, do ponto de vista de segurança. Registrado por completude, já que havia sido citado no manual do usuário como pendência.
- **Recomendação:** nenhuma ação de segurança necessária; seguir a tradução já em andamento.

---

### [BAIXO-02] `/auth/mfa/verify` e `/platform-auth/mfa/verify` aceitam tentativas sem o par conta+IP do `LoginAbuseProtector`

- Mesma causa-raiz do ALTO-01, listado separadamente porque é uma falha distinta: mesmo se a classificação de rate-limit for corrigida (300 → 5 por 15 min), essas rotas ainda não passam pelo `LoginAbuseProtector` que dá bloqueio progressivo e CAPTCHA (`captchaRequired`) como o login tem. Um limite de IP sozinho não impede um atacante com poucos IPs de tentar indefinidamente ao longo do tempo (sem bloqueio permanente de conta).
- **Recomendação:** ao corrigir o ALTO-01, avaliar se vale estender o `LoginAbuseProtector` (ou uma variante) para a etapa de verificação de MFA.

---

### [INFORMATIVO-01] Hashing de senha consistente e adequado

`services/api/src/password-hashing.ts` e `services/api-lite/src/password.ts` usam scrypt (RFC 7914), N=16384, com `timingSafeEqual` na comparação. Formato de hash auto-descritivo (`scrypt$N$r$p$salt$hash`), o que permite evoluir os parâmetros de custo sem quebrar hashes antigos. **Sem problema encontrado.**

### [INFORMATIVO-02] Anti-enumeração de conta bem implementada no Full

`login()`, `forgotPassword()` e o roteamento em `routes/auth.ts`/`routes/platform-auth.ts` sempre respondem de forma genérica para agência/e-mail inexistente, com `verifyPassword` contra um hash "inutilizável" para igualar o tempo de resposta mesmo quando o usuário não existe. **Sem problema encontrado.**

---

## 4. Itens testados e considerados OK

- **Hashing de senha** (Full e Lite): scrypt, parâmetros adequados, comparação em tempo constante.
- **Anti-enumeração de login e forgot-password** (Full e Platform Admin): resposta genérica e timing equalizado, confirmado por leitura de `local-auth.ts`.
- **Revogação de sessão no reset de senha**: `resetPassword()` chama `revokeAllSessionsForUser` antes de concluir.
- **MFA do Platform Admin**: fluxo de enrollment em duas etapas (grava `mfa_enabled=false`, só ativa após confirmar um código válido), segredo armazenado criptografado (AES-256-GCM) com fallback de leitura para segredos legados em texto puro.
- **Isolamento entre tenants (Travel Lite)**: amostragem em `customers.ts` e `sales.ts` confirma que toda consulta, atualização e verificação de unicidade inclui `tenant_id = $1` explícito; nenhuma consulta amostrada usa `id` sozinho.
- **Isolamento entre tenants (Full)**: já documentado e testado em rodadas anteriores desta mesma auditoria contínua (RLS forçado, `withTenantTransaction`/`runAsTenant` sempre derivando o tenant do contexto do servidor, nunca do cliente).
- **Auditoria e logs**: `audit-log.ts` trunca mensagens de erro (500 caracteres) e não grava segredos; erros internos (500) nunca ecoam a mensagem crua ao cliente, tanto no Full quanto no Lite (confirmado em rodadas anteriores desta auditoria para o Lite, e no cabeçalho do `errors.ts` do Full).
- **CORS/CSP/HSTS do Full**: allowlist de origem, CSP real e HSTS condicional à produção — padrão adequado.
- **Upload de logo/branding (Lite)**: valida tipo MIME, confere os bytes mágicos do arquivo contra o tipo declarado, recusa SVG e limita a 150 KB (confirmado em rodada anterior desta auditoria).
- **Tamanho de importação (Lite)**: limite de 5 MB por arquivo (`MAX_IMPORT_BYTES`).
- **Varredura de segredos**: `scripts/check-secrets.cjs` não encontrou nenhum segredo real; os 2 alertas de "possível token" são fixtures de teste (`'a'.repeat(64)`), confirmados como falso positivo.
- **XSS via React**: nenhuma ocorrência de `dangerouslySetInnerHTML` em nenhum dos apps frontend.

## 5. Lacunas que exigem decisão de produto

1. **Recuperação de senha no Lite**: implementar antes do go-live, ou aceitar o risco operacional com pelo menos 2 MASTERs por agência e um procedimento manual documentado.
2. **Nível de proteção desejado para o Lite vs o Full**: hoje o Lite está deliberadamente mais simples (sem MFA, sem rate limit, sem CSP). Antes de publicar `gadotti`/`demo` online, decidir qual o piso mínimo aceitável de segurança para um ambiente público, mesmo que seja "pilot".
3. **Troca de senha autenticada (self-service)**: ausente em ambos os produtos; decidir se entra no escopo antes do go-live ou fica como melhoria pós-lançamento.

## 6. Limitações desta rodada (transparência de método)

- Não foram levantados servidores locais nem feitas chamadas HTTP reais desta vez; a verificação foi inteiramente por leitura de código-fonte e configuração. Os achados de rate-limit (CRÍTICO-01, ALTO-01, BAIXO-02) são de alta confiança porque decorrem diretamente da ausência/presença de código, não de comportamento observado em runtime — mas uma confirmação dinâmica (rodar e de fato medir os 429) é recomendada antes de fechar os itens como corrigidos.
- Não foi feita fuzzing de entrada (SQL injection, XSS refletido) nos campos de formulário; a amostragem de tenant isolation e validação de entrada se apoiou em revisão de código já feita em rodadas anteriores desta mesma sessão de trabalho (PX1 a PX5), não repetida linha a linha agora.
- Não foi revisada a documentação de prontidão de deploy (`ONLINE-DEPLOY-RUNBOOK.md`, `PILOT-READINESS-CHECKLIST.md`) em profundidade; ambas tinham alterações não commitadas no momento da auditoria, de outra frente de trabalho.
- `apps/customer` foi revisado apenas quanto à existência de rotas de autenticação/portal (confirmada no backend: `services/api/src/routes/customer-auth.ts` tem forgot/reset); não houve revisão aprofundada do app cliente em si.

## 7. Ordem recomendada de correção

1. **CRÍTICO-01** — adicionar rate limit básico ao login do Travel Lite (bloqueia o risco mais explorável e mais barato de corrigir).
2. **ALTO-01 / BAIXO-02** — corrigir a classificação de `/auth/mfa/verify` e `/platform-auth/mfa/verify` para `AUTH_RECOVERY` e envolver no `LoginAbuseProtector` (mudança pequena e localizada em `rate-limit.ts`).
3. **ALTO-03** — ativar CSP no `api-lite` e migrar o token do Lite para `sessionStorage` (duas mudanças pequenas, risco alto que mitigam).
4. **MÉDIO-01** — restringir CORS do Lite a uma allowlist.
5. **ALTO-02** — decisão de produto sobre recuperação de senha no Lite antes de decidir a data do go-live.
6. **MÉDIO-02** — troca de senha autenticada, como melhoria pós-lançamento se não bloquear o go-live.
