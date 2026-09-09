BRANCH: feature/visual-reconstruction
HEAD: f39936c fix(ui): correct hardcoded customer name and currency formatting gaps

REFERENCIAS COMPARADAS:
- 01_role_separation.png
- 02_customer_360.png
- 03_finance_operations.png

LACUNAS ENCONTRADAS:
- Customer 360 (app customer, Customer360.tsx): campo "Nome completo" no painel "Dados pessoais" exibia o texto fixo "Titular" em vez do nome real do cliente (`customer.name`). Severidade: ALTA (dado incorreto visivel na tela mais comparada com a referencia 02_customer_360.png).
- Paginas Aereo e Terrestre (agency, AirServicesPage.tsx / LandServicesPage.tsx): coluna "Custo/Venda" da tabela usava `valor.toFixed(2)` em vez do formatador BRL compartilhado, exibindo "R$ 4450.00" em vez de "R$ 4.450,00" (sem separador de milhar, ponto em vez de virgula decimal). Severidade: MEDIA (inconsistente com os KPIs da mesma tela, que ja usavam o formatador correto).
- Planos de comissao (agency, CommissionPlansPage.tsx): valor fixo do plano tinha o mesmo problema de formatacao (`toFixed(2)` sem formatador BRL). Severidade: BAIXA (tela pouco visitada, mas mesmo padrao de bug).
- Estrutura da Customer 360 (agency e customer) usa abas (Dados pessoais / Enderecos / Dependentes / Documentos / Preferencias / Historico / Financeiro) em vez do layout "tudo em uma tela" mostrado na referencia 02_customer_360.png (secoes de Enderecos, Dependentes e Documentos sempre visiveis lado a lado). Severidade: BAIXA/estrutural — decisao de design ja consolidada em commits anteriores desta branch; refazer o layout envolve risco maior que o escopo de um ajuste rapido de CSS, entao nao foi alterado agora.
- Sidebar do Staff operacional usa a mesma cor de acento (navy escuro) do sidebar da Agencia, enquanto a referencia 01_role_separation.png usa 3 cores distintas por papel (azul admin / teal agencia / laranja staff). A diferenciacao de papel hoje e feita via banner "AMBIENTE OPERACIONAL" em laranja e badges, nao pela cor do proprio sidebar. Severidade: BAIXA — mudar a paleta do sidebar por papel é uma decisao de tema já estabelecida nesta branch; alterá-la agora é um risco desnecessário para o ganho visual.

CORRECOES APLICADAS:
- apps/customer/src/components/commercial/Customer360.tsx: `value="Titular"` -> `value={customer.name}` no campo "Nome completo".
- apps/agency/src/pages/AirServicesPage.tsx: `Custo: R$ {airService.cost.toFixed(2)}` / `Venda: R$ {airService.saleValue.toFixed(2)}` -> `formatBRL(...)`.
- apps/agency/src/pages/LandServicesPage.tsx: mesma correcao para `landService.cost` / `landService.saleValue`.
- apps/agency/src/pages/CommissionPlansPage.tsx: importa `formatBRL` e usa no valor fixo do plano em vez de `toFixed(2)`.
- apps/customer/src/pages/CustomerDetailsPage.test.tsx: ajustadas 3 asserções (`findByText`/`getByText` -> `findAllByText`/`getAllByText`) porque, com a correção do nome, o valor passou a aparecer legitimamente em dois lugares na tela (lista de campos da própria página + painel Customer 360 embutido); os testes agora toleram essa duplicação em vez de exigir ocorrência única.
- docs/visual-reconstruction-delivery/visual_final_qa.py, visual_customer_qa.py, visual_responsive_qa.py: URLs trocadas de `127.0.0.1` para `localhost` (os dev servers Vite neste ambiente sobem apenas em IPv6 `::1`, tornando `127.0.0.1` inalcançável) para que os scripts de evidência voltassem a funcionar; screenshots regenerados (customer-360.png, final/air.png, final/bookings.png, final/ground.png) refletindo as correções.

LACUNAS NAO CORRIGIDAS (fora de escopo ou dependem de dado real):
- Layout de abas vs. "tudo em uma tela" na Customer 360 — mudança estrutural de composição, risco maior que ajuste rápido; decisão de design já tomada em commits anteriores da branch.
- Cor de acento do sidebar por papel (staff = mesma cor da agência) — mudança de tema já estabelecida; alterar agora arrisca inconsistência com outras telas que dependem da mesma paleta.
- Fotos de perfil reais (referência mostra foto de rosto; app usa iniciais em avatar) — depende de dado real (upload de foto), não é possível simular sem inventar dado falso.
- Seção "Confronto OCR" na referência aparece com mais detalhe/altura; no app fica cortada no fim da viewport em full-page screenshot — não é um bug, é apenas a página sendo mais longa; não requer ação.

FIDELIDADE VISUAL ESTIMADA: ~83%
(usuario ja confirmou que ~80% e aceitavel; nao e necessario perseguir 100%)

GATES APOS AJUSTES:
TESTES: PASS (agency: 116/116; customer: 537/537)
TYPECHECK: PASS (agency e customer, tsc --noEmit)
LINT: PASS (eslint nos arquivos alterados, 0 erros/avisos novos)
BUILD: PASS (agency e customer, vite build; warning pré-existente de chunk >500kB, não introduzido por este trabalho)
ERROS DE CONSOLE: 0
FALHAS DE REDE: 0
403/500 INESPERADOS: 0

COMMITS CRIADOS:
- f39936c fix(ui): correct hardcoded customer name and currency formatting gaps

STATUS DO WORKTREE:
 M apps/agency/vite.config.ts
 M apps/customer/vite.config.ts
 M apps/marketing/vite.config.ts
 M apps/platform-admin/vite.config.ts
 M infrastructure/docker-compose.local-postgres.yml
 M services/api/scripts/bootstrap-local-db.cjs
(apenas os 6 arquivos de override local pré-existentes, fora de escopo, permanecem modificados e não foram tocados nem commitados)

VEREDITO FINAL: PRONTO PARA REVISAO
