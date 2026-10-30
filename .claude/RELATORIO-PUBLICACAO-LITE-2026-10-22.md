# Publicacao Travel Lite - 2026-10-22

Autorizacao: usuario informou que verificou a interface e autorizou testar e subir.

## Destino

- Projeto Vercel existente: `travel-lite-gadotti`.
- Deployment final: `dpl_HzVdNUQhb2QYCQvZHin9RjBoCqRo`, estado `READY` confirmado pela API Vercel.
- URL: https://travel-lite-gadotti-f1y74mrx1-ugoalencars-projects.vercel.app/gadotti
- Target: preview, com Vercel Authentication. Acesso anonimo confirmado HTTP 302.
- Conta continua Hobby. Dominio publico/DNS/Render nao alterados; nenhuma assinatura contratada.
- Nenhum commit, push ou alteracao de main. Alteracoes do Full nao foram empacotadas.

## Validacao local

- API Lite final: 232/232 testes, 28 arquivos, exit 0.
- Frontend Lite final: 132/132 testes, 12 arquivos, exit 0.
- Typecheck, lint e build dos dois workspaces: exit 0. Quatro avisos Fast Refresh e aviso de bundle permanecem.
- Adaptador Vercel: 2/2 testes, exit 0; inicializacao concorrente, encaminhamento e recuperacao de falha.
- Auditoria independente HTTP/PostgreSQL/Chrome: 7 passaram, 1 diagnostico antigo de concorrencia excluido.
  Esse diagnostico segurava uma barreira ate o estorno terminar; com o lock correto, ambos aguardariam entre si.
  A cobertura foi substituida pelos tres testes atuais de `commission-concurrency.test.ts`, incluidos nos 232.
- Chrome real: regra progressiva, criacao/confirmacao da venda, aprovacao, recebimento e pagamento parcial.
  Sem erro JavaScript ou overflow mobile. HTTP/PostgreSQL tambem validaram quitacao, duplicidade, estorno e RLS.

## Banco e backup

- Supabase dedicado `bseoafxmqgcxjdpzvwzn`, estado ACTIVE_HEALTHY.
- Backup consistente de 31 tabelas e 498 linhas, criptografado por Windows DPAPI para o usuario atual:
  `C:/Users/Ugo Alencar/Documents/Travel-Gadotti/backups/travel-lite-pre-release-2026-10-22.dpapi`.
- Roundtrip de criptografia e restauracao completa em banco local descartavel passaram.
- Migracoes 008-011 ensaiadas contra essa copia; banco de ensaio removido depois.
- Migracoes 008-011 aplicadas em uma transacao no Supabase, com limites de espera/execucao e lock de publicacao.
- Registradas tambem no controle `public.migrations` (11 entradas).
- 34/34 tabelas publicas com RLS habilitado e forcado; tabelas novas sem grants para anon/authenticated/service_role.
- Gadotti conferida apos migracao: 57 vendas, total R$ 402.288,08. Nenhum pagamento, venda ou senha real alterado.
- Advisor de seguranca: somente INFO sobre `migrations` sem policies, intencionalmente inacessivel ao runtime.

## Integracao entre checkouts

O checkout principal tinha politica antiga de oito caracteres; o ambiente anterior ja exigia doze.
A politica existente foi integrada ao checkout principal em password.ts, auth/users, formularios e ajuda.
Teste de fronteira importado do checkout online reproduziu a diferenca antes da correcao e passou depois.
Nao houve rotacao de senha ou acesso com credencial real. O primeiro deployment intermediario foi removido.

O artefato usa o codigo atual do Lite e o adaptador Vercel existente, recompilado e testado.
Dependencias fixadas do pacote anterior foram reutilizadas, com versoes conferidas; nenhuma dependencia instalada.
59 arquivos proprios no output; sem .env, credenciais, tokens ou backups. Manifesto ignorado:
`.tmp/lite-release-manifest-20261022.json`. Bundle final: `index-DrcCJEpr.js`.
CEP habilitado somente em Preview com `TRAVEL_LITE_CEP_PROVIDER=viacep`.

## Estado da verificacao online

Verificacao autenticada final: exit 0, deployment final confirmado.

- Health, frontend e bundle atual: 200.
- Login MASTER e VIEWER temporarios: 200.
- MASTER: regras, comissoes, vendas, dashboard e consulta real de CEP: 200.
- VIEWER: escrita de regra bloqueada com 403.
- Sem sessao: usuarios, vendas, regras e comissoes bloqueados com 401.
- Logout POST sem corpo: 200 nos dois perfis.
- Nova senha de onze caracteres: 400, com mensagem exigindo doze.
- Tenant sintetico e dois usuarios de teste removidos apos logout; nenhum tenant de teste restante.
- Gadotti final: cinco usuarios, 57 vendas e R$ 402.288,08. Credencial temporaria de teste removida do disco.
- Resumo sem segredos: `.tmp/lite-release-online-smoke-result.json`.

Resultado: publicacao e verificacao da **previa protegida concluidas**. Nao equivale a cutover do dominio publico.

## Escopo funcional

Publicadas as atualizacoes implementadas de CEP e comissoes. Folha Lite, fila de aprovacao de venda,
retroatividade, bonus/teto e recuperacao negativa continuam fora desta entrega, conforme a especificacao.

## Registro operacional

O worker claude-mem passou a recusar `work_state_write` durante esta execucao (`Worker API: fetch failed`).
Este relatorio preserva o resultado e os identificadores caso a lista persistente continue com estado anterior.
