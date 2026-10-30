# Travel Platform Full - demo local de apresentacao

Preparado e verificado em 23/10/2026. Nenhuma alteracao online/Lite.

## Acesso

- Agencia Full: http://127.0.0.1:5173
- Administrador da plataforma: http://127.0.0.1:5174
- Site de apresentacao: http://127.0.0.1:5175
- Portal do cliente: http://127.0.0.1:5176/customer-portal
- API: http://127.0.0.1:4000/health

Credenciais ficticias geradas exclusivamente para este banco local:
C:/Users/Ugo Alencar/Documents/Travel-Full-Demo/Acesso-local-Full.md.
Pasta protegida por ACL para o usuario Windows atual e SYSTEM.
Nenhuma senha impressa no chat ou neste relatorio.

## Isolamento

- Container novo: travel-full-presentation-20261023, imagem postgres:15 existente.
- Banco novo: travel_platform_presentation_test, porta somente loopback 55438.
- Volume proprio persistente; nenhum banco/schema anterior apagado.
- 99 migrations Full aplicadas no banco novo; tres seeds oficiais executados.
- Roles de runtime e plataforma separadas, sem superuser/BYPASSRLS;
  credencial administrativa e usada somente na preparacao deste banco local.
- API compilada e executada diretamente, sem carregar o .env.local real.
- API e quatro frontends em processos de background com bind em 127.0.0.1.
- Modo local development e ALLOW_DEV_AUTH=true conforme suporte oficial do
  demo. Logins reais por senha/session token tambem testados nos tres perfis.
- Nenhum pacote instalado, commit, push, deploy ou mudanca nas contas reais.
- Senhas de usuarios ficticios dos seeds foram inicializadas somente neste
  banco isolado; nao houve qualquer alteracao na Gadotti/demo online.

## Verificacao executada

- Build API Full: exit 0.
- API e apps 4000, 5173, 5174, 5175, 5176: HTTP 200.
- Login de agencia, plataforma e cliente: HTTP 200.
- Chrome real com login por formulario: agencia, plataforma e portal cliente.
- Agencia: painel, clientes, desejos, vendas, financeiro, funcionarios e folha
  abriram com dados/estrutura de demo. Nenhum erro JS ou resposta API >=400
  nas navegacoes exercitadas. Financeiro possui conteudo mas nao um heading
  h1/h2 no estado carregado; isso nao foi tratado como pagina em branco.
- Admin plataforma e portal cliente abriram apos login, sem erros observados.
- Nao e validacao exaustiva de todas as funcionalidades do Full nem envio
  de e-mail, emissao fiscal, cobranca ou integracoes externas reais.

Evidencias ignoradas pelo Git:
.tmp/full-demo-check-result.json e screenshots full-demo-dashboard.png,
full-demo-platform.png, full-demo-customer.png.

## Operacao local

Os servicos foram deixados ativos. Logs em .tmp/full-demo-<servico>.log.
PIDs desta inicializacao em .tmp/full-demo-pids.json.
Configuracao gerada em .tmp/full-demo-local-config.dpapi, cifrada por Windows.
Nao compartilhar essa configuracao nem usar essas contas fora do demo.

Depois de encerrar os cinco processos, iniciar novamente sem apagar dados:

```powershell
node D:/travel-platform/.tmp/full-demo-start.cjs
```

O container precisa estar ativo; se o computador reiniciar, iniciar primeiro:

```powershell
docker start travel-full-presentation-20261023
```

Nao executar npm run demo ou demo:reset para este ambiente: os orquestradores
existentes resetam outro banco local compartilhado. Nenhum reset e necessario
para repetir a apresentacao. Os helpers .tmp sao locais/ignorados, nao uma
distribuicao de instalacao formal versionada.
