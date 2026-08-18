# User Flows

## Flow 1: Onboarding da Agência

```
1. Owner acessa /register
2. Preenche: nome agência, CNPJ, email, senha
3. Confirma email (link)
4. Owner faz login
5. Preenche perfil da agência
6. Adiciona primeiros vendedores (convite por email)
7. Cadastro primeiro pacote de viagem
8. ✅ Agência pronta
```

## Flow 2: Cadastro de Cliente

```
1. Agent acessa /customers/new
2. Preenche: nome, email, telefone, CPF
3. Adiciona preferências (opcional)
4. Salva
5. Cliente aparece na lista
6. ✅ Cliente cadastrado
```

## Flow 3: Criação de Viagem

```
1. Manager acessa /trips/new
2. Preenche: nome, destino, datas, preço, capacidade
3. Adiciona descrição e fotos
4. Define status (ativo/inativo)
5. Salva
6. ✅ Viagem disponível
```

## Flow 4: Criar Oferta

```
1. Manager acessa /trips/{id}/offers
2. Clica "Nova Oferta"
3. Define: preço com desconto, validade
4. Salva
5. Oferta visível para agents
6. ✅ Oferta criada
```

## Flow 5: Registrar Venda

```
1. Agent seleciona cliente
2. Seleciona viagem/oferta
3. Confirma valor e desconto
4. Seleciona broker (opcional)
5. Confirma venda
6. Status: PENDENTE
7. ✅ Venda registrada
```

## Flow 6: Dashboard

```
1. User faz login
2. Redirect para /dashboard
3. Visualiza:
   - Vendas do mês
   - Clientes ativos
   - Viagens disponíveis
   - Ranking de brokers
4. Ações rápidas:
   - Nova venda
   - Novo cliente
   - Nova viagem
```

## Flow 7: Gestão de Brokers

```
1. Admin acessa /brokers
2. Lista brokers com comissões
3. Adiciona novo broker
4. Define comissão padrão (%)
5. Broker aparece nas vendas
6. ✅ Broker cadastrado
```
