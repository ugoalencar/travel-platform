# Travel Plataforma (atualizado em 2026-10-30)

- O que é: SaaS de gestão para agências de viagem no Brasil — CRM/pipeline, operação de viagens, financeiro, equipe/papéis, portal do cliente final. Há também o "Travel Lite", versão mais leve e separada, já usada por uma agência real (Gadotti).
- Para quem é: agências de viagem pequenas/médias no Brasil.
- O que vende, a que preço (planos publicados): Inicial R$ 99/mês (10 usuários), Profissional R$ 299/mês (50 usuários), Empresarial sob consulta. Preço de fundador R$ 79 nos 12 primeiros meses já decidido em `founder/pricing.md` (rodada de 12/10).
- Onde e como: 100% online; landing em travelplataforma.com.br, app em app.travelplataforma.com.br, painel de plataforma em admin.travelplataforma.com.br. Cobrança recorrente (Asaas) e NFS-e continuam só em ADR, sem código em produção (conforme docs; não reverificado hoje).
- Orçamento/restrições: fundador solo, sem pró-labore; custo fixo declarado ~R$ 1.000/mês (ver `founder/cfo.md`).

## Estado novo (fatos de 30/10/2026)

- O Full está no ar em produção (API + 4 frontends na Vercel, banco Supabase na versão 118 de migrations, e-mail transacional via Resend).
- Primeiro cliente real: Gadotti (B&B Gadotti Viagens LTDA, Joinville/SC), tenant criado hoje, 1 OWNER + 4 AGENT, status cortesia/tester, sem cobrança até aprovar. Já usava o Lite em produção.
- Existe um tenant Demo vazio para demonstração (login público com senha conhecida).
- Ainda não existe cobrança, plano atribuído nem nota fiscal automática no Full.

## As duas ideias novas do fundador, a analisar

1. **Programa de 4 fundadores**: 4 usuários/agências fundadoras testam por 6 meses e depois viram usuários vitalícios (acesso para sempre). Só depois o produto parte para assinaturas.
2. **Modalidade "venda do sistema + suporte"**: em vez de (ou além de) assinatura, vender o sistema ao cliente e oferecer suporte como serviço.

Perguntas: o sistema, como negócio, se sustenta? Qual versão dessas ideias é mais forte? "Vitalício" é uma boa ideia ou um risco? Como estruturar para não se arrepender?
