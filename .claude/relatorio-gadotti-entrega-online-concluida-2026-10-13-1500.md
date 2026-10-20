# Entrega Travel Lite — Gadotti: relatório final (online)

Data/hora: 2026-10-13, ~11:50 (America/Sao_Paulo)
Status: **provisionamento aplicado e validado online.**

## Executado
- Serviço `travel-lite` apontado para a branch `feat/gadotti-online-provision` (commit `5906c69`), autoDeploy desligado. `travel-platform` e `main` intactos.
- Deploy `dry-run` (live): Patricia MASTER com 32 permissões; 4 vendedoras com exatamente 6; nenhuma conta criada; sem dado sensível no log.
- Deploy `apply` (live): 5 senhas temporárias aplicadas, 5 `USER_PASSWORD_RESET`, 4 `USER_PERMISSIONS_CHANGED`, marcador `GADOTTI_PROVISION_COMPLETED`; todos com `user_id` nulo (nada atribuído a funcionárias nem à Patricia); `granted_by` nulo.
- Deploy final: os 3 segredos temporários e a flag removidos (`envKeys` vazio); `/health` = 200.
- Banco: 8 overrides (4 vendedoras × revogar `commissions.read_own` e `reports.sales_own`); 5 vendedores vinculados; 57 vendas intactas.
- Login online das 5 contas: HTTP 200 com `passwordChangeRequired=true` e sem sessão emitida. Nenhuma senha foi trocada.
- Senhas de Patricia, Nykaya e Letícia rotacionadas antes da aplicação (exposição na sessão).

## Pendências
- Atualizar no Bitwarden as 3 entradas rotacionadas.
- Serviço segue na branch da feature até o merge (a `main` não tem auditoria de vendas nem o entrypoint). O PR não foi aberto (permissão negada ao `gh`).
- Não testado online: fluxo completo de troca de senha + navegação de vendedora (coberto por testes locais).
- Decisão de produto: venda própria exibe custo/margem/comissão ao vendedor. Sem tela para o histórico de vendas (só API).
- Banco Free expira em 2026-11-01.
- Recomendado revogar/rotacionar a chave de API do Render usada.
