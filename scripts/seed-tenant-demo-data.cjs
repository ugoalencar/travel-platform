#!/usr/bin/env node
/**
 * Travel Platform — seed de dados de demonstração do tenant
 *
 * Popula uma agência (Alpha Viagens) com dados realistas de demonstração E2E:
 * - Clientes com documentos e dependentes
 * - Desejos e preferências de viagem
 * - Ofertas (catálogo)
 * - Propostas e vendas
 * - Viagens e operações
 * - Registros financeiros (receitas, despesas, recebíveis, contas a pagar)
 * - Campanhas e interações
 */

const { Pool } = require('pg');
const crypto = require('crypto');
const { URL } = require('node:url');
const { STORY_IDS, seedBusinessStories } = require('./demo-business-stories.cjs');

const databaseUrl = process.env.DATABASE_URL ||
  'postgresql://travel_test:travel_test_password@127.0.0.1:55432/travel_platform_test';
const localDevAgencyId = '10000000-0000-4000-8000-000000000001';

// Safety guards: refuse to run against non-dev/non-local DB
if (process.env.NODE_ENV === 'production') {
  console.error('❌ ERRO: Não é permitido executar seed no banco de produção.\n');
  process.exit(1);
}

try {
  const url = new URL(databaseUrl);
  const isLocal = ['127.0.0.1', 'localhost'].includes(url.hostname);
  const isDev = url.pathname.includes('test') || url.pathname.includes('dev');

  if (!isLocal || !isDev) {
    console.error('❌ ERRO: DATABASE_URL não aponta para um banco local de teste/dev.\n');
    console.error(`   URL: ${databaseUrl}\n`);
    process.exit(1);
  }
} catch {
  console.error('❌ ERRO: DATABASE_URL inválida.\n');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

function generateId() {
  return crypto.randomUUID();
}

function relationshipType(value) {
  if (value === 'CONJUGE') return 'SPOUSE';
  if (value === 'FILHO' || value === 'FILHA') return 'CHILD';
  return 'OTHER';
}

async function seedTenantData() {
  console.log('\n========================================');
  console.log('Populando dados de demonstração do tenant');
  console.log('========================================\n');

  try {
    // Busca a primeira agência (Alpha Viagens), que já deve existir pelo seed da plataforma.
    console.log('0. Buscando agência de demonstração...');
    const agency = await fetchDemoAgency();
    if (!agency) {
      throw new Error('Agência de demonstração não encontrada. Execute seed-platform-demo-data.cjs primeiro.');
    }
    console.log(`   ✓ Usando agência: ${agency.name} (${agency.id})\n`);

    // Busca o tenant assinante desta agência.
    console.log('1. Buscando tenant assinante...');
    const tenant = await fetchSubscriberTenant(agency.id);
    if (!tenant) {
      throw new Error('Tenant assinante não encontrado para a agência de demonstração.');
    }
    console.log(`   ✓ Tenant: ${tenant.id}\n`);

    console.log('2. Criando usuários da agência...');
    const agencyUsers = await seedAgencyUsers(agency.id);

    console.log('3. Criando clientes...');
    const customers = await seedCustomers(agency.id);

    console.log('3.1 Criando histórias de negócio determinísticas...');
    await seedBusinessStories(pool, { agencyId: agency.id, userId: agencyUsers[0].id });

    console.log('4. Criando desejos...');
    await seedWishes(agency.id, customers);

    console.log('5. Criando ofertas (catálogo)...');
    const offers = await seedOffers(agency.id);

    console.log('6. Criando capturas externas de ofertas (Pescador)...');
    await seedExternalCaptures(agency.id);

    console.log('7. Criando propostas...');
    const proposals = await seedProposals(agency.id, customers, offers, agencyUsers[0].id);

    console.log('8. Criando vendas...');
    const sales = await seedSales(agency.id, proposals, customers, agencyUsers[0].id);

    console.log('9. Criando viagens...');
    await seedTrips(agency.id, sales);

    console.log('9.5 Criando hierarquia de categorias financeiras e centros de custo...');
    await seedFinanceCategoryHierarchyAndCostCenters(agency.id);

    console.log('9.6 Criando planos de comissão e funcionários...');
    await seedCommissionPlansAndEmployees(agency.id, agencyUsers);

    console.log('9.7 Criando comissões geradas e folha de pagamento...');
    await seedCommissionsAndPayroll(agency.id, agencyUsers);

    console.log('10. Criando registros financeiros (receitas)...');
    await seedRevenues(agency.id, sales);

    console.log('11. Criando registros financeiros (despesas)...');
    await seedExpenses(agency.id);

    console.log('12. Criando registros financeiros (recebíveis)...');
    await seedReceivables(agency.id, sales);

    console.log('12.1 Criando fornecedores...');
    const suppliers = await seedSuppliers(agency.id);

    console.log('12.2 Criando segmentos aéreos...');
    await seedAirServices(agency.id, suppliers);

    console.log('12.3 Criando serviços terrestres...');
    await seedLandServices(agency.id, suppliers);

    console.log('13. Criando registros financeiros (contas a pagar)...');
    await seedPayables(agency.id, suppliers);

    console.log('13b. Habilitando permissões da plataforma...');
    await seedEntitlements(agency.id);

    console.log('14. Criando campanhas...');
    await seedCampaigns(agency.id, agencyUsers[0].id);

    console.log('15. Criando interações com clientes...');
    await seedInteractions(agency.id, customers, agencyUsers[0].id);

    console.log('16. Criando reservas...');
    await seedBookings(agency.id, customers);

    console.log('17. Criando movimentações de caixa...');
    await seedCashTransactions(agency.id);

    console.log('18. Criando conciliações...');
    await seedReconciliations(agency.id);

    console.log('19. Criando documentos de clientes...');
    await seedCustomerDocuments(agency.id, customers);

    console.log('\n20. Verificando dados do tenant...');
    await verifyTenantData(agency.id);

    console.log('\n✅ SEED DO TENANT CONCLUÍDO\n');
  } catch (error) {
    console.error('\n❌ Falha no seed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function fetchDemoAgency() {
  const result = await pool.query(
    `SELECT id, name, slug, email
       FROM agencies
      WHERE id = $1 OR name = 'Alpha Viagens'
      ORDER BY CASE WHEN id = $1 THEN 0 ELSE 1 END
      LIMIT 1`,
    [localDevAgencyId]
  );
  return result.rows[0] || null;
}

async function fetchSubscriberTenant(agencyId) {
  await pool.query(
    `INSERT INTO subscriber_tenants
       (id, agency_id, legal_name, contact_email, contact_name, billing_status, subscription_status, created_at, updated_at)
     VALUES ($1, $2, 'Agency A Demo Ltda', 'billing@agency-a-demo.example.test', 'Demo Admin', 'ACTIVE', 'ACTIVE', NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    ['30000000-0000-4000-8000-000000000001', agencyId]
  );

  const result = await pool.query(
    `SELECT id FROM subscriber_tenants WHERE agency_id = $1 LIMIT 1`,
    [agencyId]
  );
  return result.rows[0] || null;
}

async function seedAgencyUsers(agencyId) {
  const users = [
    { name: 'João Silva', email: 'joao@alpha.test', role: 'OWNER', active: true },
    { name: 'Maria Santos', email: 'maria@alpha.test', role: 'ADMIN', active: true },
    { name: 'Pedro Oliveira', email: 'pedro@alpha.test', role: 'AGENT', active: true },
    { name: 'Ana Costa', email: 'ana@alpha.test', role: 'AGENT', active: true },
    { name: 'Carlos Ferreira', email: 'carlos@alpha.test', role: 'AGENT', active: true },
  ];

  const result = [];
  for (const user of users) {
    const inserted = await pool.query(
      `INSERT INTO users (id, agency_id, name, email, role, password_hash, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'demo-only-hash', 'ACTIVE', NOW(), NOW())
       ON CONFLICT (agency_id, email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role
       RETURNING id`,
      [generateId(), agencyId, user.name, user.email, user.role]
    );
    result.push({ id: inserted.rows[0].id, name: user.name, role: user.role, email: user.email });
    console.log(`   ✓ ${user.name} (${user.role})`);
  }
  return result;
}

async function seedCustomers(agencyId) {
  const customers = [
    {
      name: 'Mariana Alves Silva',
      demoId: STORY_IDS.marianaCancun.customer,
      demoAddressId: STORY_IDS.marianaCancun.address,
      demoDependentId: STORY_IDS.marianaCancun.dependent,
      email: 'mariana.alves@email.com',
      phone: '11-98765-4321',
      city: 'Joinville',
      state: 'SC',
      rg: '123456789',
      cpf: '12345678901',
      dependents: [{ name: 'Lucas Alves Silva', relationship: 'FILHO', birthDate: '2015-05-10' }],
    },
    {
      name: 'Roberto Fernandes',
      email: 'roberto.f@email.com',
      phone: '21-99876-5432',
      city: 'Rio de Janeiro',
      state: 'RJ',
      rg: '987654321',
      cpf: '98765432109',
      dependents: [{ name: 'Beatriz Fernandes', relationship: 'CONJUGE', birthDate: '1985-03-22' }],
    },
    {
      name: 'Carla Mendes',
      email: 'carla.mendes@email.com',
      phone: '31-99123-4567',
      city: 'Belo Horizonte',
      state: 'MG',
      rg: '456789012',
      cpf: '45678901234',
      dependents: [],
    },
    {
      name: 'Fernando Costa Gomes',
      email: 'fernando.costa@email.com',
      phone: '85-98765-0123',
      city: 'Fortaleza',
      state: 'CE',
      rg: '789012345',
      cpf: '78901234567',
      dependents: [
        { name: 'Sofia Gomes', relationship: 'FILHA', birthDate: '2010-07-15' },
        { name: 'Matheus Gomes', relationship: 'FILHO', birthDate: '2012-11-20' }
      ],
    },
    {
      name: 'Juliana Santos Ribeiro',
      email: 'juliana.santos@email.com',
      phone: '41-99456-7890',
      city: 'Curitiba',
      state: 'PR',
      rg: '012345678',
      cpf: '01234567890',
      dependents: [],
    },
    {
      name: 'Gustavo Oliveira Lima',
      email: 'gustavo.lima@email.com',
      phone: '48-98901-2345',
      city: 'Florianópolis',
      state: 'SC',
      rg: '234567890',
      cpf: '23456789012',
      dependents: [{ name: 'Isabella Lima', relationship: 'CONJUGE', birthDate: '1988-01-30' }],
    },
    {
      name: 'Beatriz Martins',
      email: 'beatriz.martins@email.com',
      phone: '51-99234-5678',
      city: 'Porto Alegre',
      state: 'RS',
      rg: '345678901',
      cpf: '34567890123',
      dependents: [],
    },
    {
      name: 'Rodrigo Dias',
      email: 'rodrigo.dias@email.com',
      phone: '62-98567-8901',
      city: 'Goiânia',
      state: 'GO',
      rg: '567890123',
      cpf: '56789012345',
      dependents: [{ name: 'Camila Dias', relationship: 'FILHA', birthDate: '2014-09-12' }],
    },
    {
      name: 'Patrícia Rocha',
      email: 'patricia.rocha@email.com',
      phone: '71-99678-9012',
      city: 'Salvador',
      state: 'BA',
      rg: '678901234',
      cpf: '67890123456',
      dependents: [],
    },
    {
      name: 'Marcos Almeida Silva',
      email: 'marcos.almeida@email.com',
      phone: '67-98789-0123',
      city: 'Campo Grande',
      state: 'MS',
      rg: '789012345',
      cpf: '78901234567',
      dependents: [{ name: 'Luísa Silva', relationship: 'CONJUGE', birthDate: '1990-06-14' }],
    },
    {
      name: 'Cristina Santos',
      email: 'cristina.santos@email.com',
      phone: '11-99789-1234',
      city: 'São Paulo',
      state: 'SP',
      rg: '890123456',
      cpf: '89012345678',
      dependents: [],
    },
    {
      name: 'André Pereira',
      email: 'andre.pereira@email.com',
      phone: '84-98890-2345',
      city: 'Natal',
      state: 'RN',
      rg: '901234567',
      cpf: '90123456789',
      dependents: [{ name: 'Helena Pereira', relationship: 'FILHA', birthDate: '2016-04-08' }],
    },
    {
      name: 'Sabrina Oliveira',
      email: 'sabrina.oliveira@email.com',
      phone: '82-99901-3456',
      city: 'Maceió',
      state: 'AL',
      rg: '012345679',
      cpf: '01234567891',
      dependents: [],
    },
    {
      name: 'Vicente Gomes',
      email: 'vicente.gomes@email.com',
      phone: '11-98901-4567',
      city: 'Campinas',
      state: 'SP',
      rg: '123456780',
      cpf: '12345678902',
      dependents: [{ name: 'Fátima Gomes', relationship: 'CONJUGE', birthDate: '1992-08-25' }],
    },
    {
      name: 'Elisa Barbosa',
      email: 'elisa.barbosa@email.com',
      phone: '75-99012-5678',
      city: 'Ilhéus',
      state: 'BA',
      rg: '234567891',
      cpf: '23456789013',
      dependents: [],
    },
    {
      name: 'Thiago Mendes',
      email: 'thiago.mendes@email.com',
      phone: '47-98012-6789',
      city: 'Blumenau',
      state: 'SC',
      rg: '345678902',
      cpf: '34567890124',
      dependents: [
        { name: 'Breno Mendes', relationship: 'FILHO', birthDate: '2013-12-03' },
        { name: 'Amanda Mendes', relationship: 'FILHA', birthDate: '2017-02-14' }
      ],
    },
  ];

  const result = [];

  for (const customerData of customers) {
    let customerId = customerData.demoId || generateId();

    // Insert customer
    const insertedCustomer = await pool.query(
      `INSERT INTO customers (id, agency_id, name, email, phone, cpf, rg, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', NOW(), NOW())
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [customerId, agencyId, customerData.name, customerData.email, customerData.phone, customerData.cpf, customerData.rg]
    );
    if (insertedCustomer.rows[0]?.id) {
      customerId = insertedCustomer.rows[0].id;
    } else {
      const existingCustomer = await pool.query(
        'SELECT id FROM customers WHERE agency_id = $1 AND email = $2 LIMIT 1',
        [agencyId, customerData.email]
      );
      if (!existingCustomer.rows[0]?.id) {
        console.log(`   Seed de cliente duplicado ignorado: ${customerData.name}`);
        continue;
      }
      customerId = existingCustomer.rows[0].id;
    }

    // Insert address
    const addressId = customerData.demoAddressId || generateId();
    await pool.query(
      `INSERT INTO customer_addresses (id, agency_id, customer_id, street, number, district, city, state, cep, country, type, is_primary, created_at, updated_at)
       VALUES ($1, $2, $3, $4, '100', 'Centro', $5, $6, '00000-000', 'Brasil', 'RESIDENTIAL', true, NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [addressId, agencyId, customerId, `Rua ${customerData.name}`, customerData.city, customerData.state]
    );

    // Insert dependents
    for (const dependent of customerData.dependents) {
      const dependentId = customerData.demoDependentId || generateId();
      await pool.query(
        `INSERT INTO customer_dependents (id, agency_id, customer_id, name, relationship_type, birth_date, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) ON CONFLICT DO NOTHING`,
        [dependentId, agencyId, customerId, dependent.name, relationshipType(dependent.relationship), new Date(dependent.birthDate)]
      );
    }

    result.push({ id: customerId, name: customerData.name });
    console.log(`   ✓ ${customerData.name}`);
  }

  return result;
}

async function seedWishes(agencyId, customers) {
  const wishes = [
    { destination: 'Cancún', description: 'Férias no Caribe - praia, resort all-inclusive' },
    { destination: 'Paris', description: 'Lua de mel clássica - museus, gastronomia, romântico' },
    { destination: 'Orlando', description: 'Disney e parques temáticos - viagem familiar' },
    { destination: 'Maceió', description: 'Praia nordestina - águas calmas, pescaria' },
    { destination: 'Buenos Aires', description: 'Tango e cultura - viagem romântica, compras' },
    { destination: 'Santiago', description: 'Patagônia e vinhos - aventura e natureza' },
    { destination: 'Gramado', description: 'Montanhas e chocolates - inverno', },
    { destination: 'Punta Cana', description: 'Resort tudo incluído - casal com filhos' },
    { destination: 'Riviera Maya', description: 'Resort, snorkel, cenotes - roteiro aventura' },
    { destination: 'Portugal', description: 'Lisboa e Madeira - destino europeu acessível' },
    { destination: 'Nova York', description: 'Broadway, compras, gastronomia - sem crianças' },
    { destination: 'Madri', description: 'Museus, arquitetura, cultura - roteiro cultural' },
    { destination: 'Bali', description: 'Exótico asiático - piscina, templos, spa' },
    { destination: 'Cruzeiro', description: 'Caribe inteiro - 7 noites navegando' },
  ];

  const result = [];

  for (let i = 0; i < wishes.length; i++) {
    const customer = customers[i % customers.length];
    const wishId = generateId();
    const wish = wishes[i];

    await pool.query(
      `INSERT INTO wishes (id, agency_id, customer_id, destination, notes, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [wishId, agencyId, customer.id, wish.destination, wish.description]
    );

    result.push({ id: wishId, destination: wish.destination });
  }

  console.log(`   ✓ ${result.length} desejos criados`);
  return result;
}

async function seedOffers(agencyId) {
  const offers = [
    {
      title: 'Cancún All-Inclusive 7 Noites',
      destination: 'Cancún',
      description: 'Hotel 5 estrelas, refeições ilimitadas, bebidas, atividades',
      price: 4500,
      validFrom: new Date('2026-09-01'),
      validTo: new Date('2026-12-31'),
      inclusions: 'Voo, hotel 5*, transfers, refeições, bebidas, animação',
      exclusions: 'Passeios opcionais, compras extras, seguros',
      hotelName: 'Grand Palladium Cancún',
      transport: 'Voo direto São Paulo - Cancún',
    },
    {
      title: 'Paris Romântica 5 Dias',
      destination: 'Paris',
      description: 'Lua de mel em Paris com passeios ao Louvre e Torre Eiffel',
      price: 8900,
      validFrom: new Date('2026-10-01'),
      validTo: new Date('2027-02-28'),
      inclusions: 'Voo, hotel 4*, café da manhã, passeios guiados, show Moulin Rouge',
      exclusions: 'Refeições extras, ingressos adicionais',
      hotelName: 'Hotel Le Marais Paris',
      transport: 'Voo TAP Lisboa + conexão Paris',
    },
    {
      title: 'Orlando Magic: Parques 5 Dias',
      destination: 'Orlando',
      description: 'Ingressos ilimitados Disney, Universal e SeaWorld',
      price: 6200,
      validFrom: new Date('2026-12-15'),
      validTo: new Date('2027-01-31'),
      inclusions: 'Voo, hotel resort, ingressos parques, transfers',
      exclusions: 'Refeições, lojas temáticas, brinquedos',
      hotelName: 'Disney All Star Movies Resort',
      transport: 'Voo direto Rio de Janeiro - Orlando',
    },
    {
      title: 'Maceió Praia 4 Noites',
      destination: 'Maceió',
      description: 'Resort frente-mar com tudo incluído em Maceió',
      price: 2800,
      validFrom: new Date('2026-09-01'),
      validTo: new Date('2026-11-30'),
      inclusions: 'Voo, hotel tudo-incluído, bebidas, atividades praia',
      exclusions: 'Passeios adicionais, compras',
      hotelName: 'Praia Bonita Resort',
      transport: 'Voo direto Recife - Maceió',
    },
    {
      title: 'Buenos Aires Tango 4 Noites',
      destination: 'Buenos Aires',
      description: 'Cidade com show de tango, gastronomia, shopping',
      price: 3200,
      validFrom: new Date('2026-11-01'),
      validTo: new Date('2027-03-31'),
      inclusions: 'Voo, hotel 4*, café da manhã, show tango e jantar',
      exclusions: 'Almoços e jantares extras',
      hotelName: 'Fierro Hotel Buenos Aires',
      transport: 'Voo LATAM São Paulo - Buenos Aires',
    },
    {
      title: 'Gramado Inverno Romântico',
      destination: 'Gramado',
      description: 'Escapada romântica com chocolates e montanhas',
      price: 1500,
      validFrom: new Date('2026-06-01'),
      validTo: new Date('2026-09-30'),
      inclusions: 'Voo, pousada 3*, café da manhã, chocolateria',
      exclusions: 'Passeios específicos',
      hotelName: 'Pousada Monte Verde Gramado',
      transport: 'Voo São Paulo - Porto Alegre + ônibus',
    },
    {
      title: 'Punta Cana Resort Tudo Incluído',
      destination: 'Punta Cana',
      description: 'Resort all-inclusive República Dominicana - melhor preço/benefício',
      price: 3950,
      validFrom: new Date('2026-09-01'),
      validTo: new Date('2027-03-31'),
      inclusions: 'Voo, resort tudo-incluído, atividades aquáticas, transfers',
      exclusions: 'Tratamentos spa premium',
      hotelName: 'Barceló Bávaro Grand Resort',
      transport: 'Voo GOL Rio de Janeiro - Punta Cana',
    },
    {
      title: 'Portugal: Lisboa + Madeira 8 Dias',
      destination: 'Portugal',
      description: 'Conhecer Portugal: capital e ilha paradisíaca',
      price: 5800,
      validFrom: new Date('2026-10-01'),
      validTo: new Date('2027-04-30'),
      inclusions: 'Voo, 3 noites Lisboa + 4 Madeira, hotéis 4*, passeios',
      exclusions: 'Alguns passeios, refeições adicionais',
      hotelName: 'Memmo Alfama Hotel + Porto Moniz Madeira',
      transport: 'Voo TAP Lisboa, voo interno para Madeira',
    },
  ];

  const result = [];

  for (const offer of offers) {
    const offerId = generateId();

    await pool.query(
      `INSERT INTO offers (id, agency_id, name, description, price, valid_from, valid_until, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [offerId, agencyId, offer.title, `${offer.destination} - ${offer.description}`, offer.price, offer.validFrom, offer.validTo]
    );

    result.push({ id: offerId, title: offer.title, price: offer.price });
    console.log(`   ✓ ${offer.title}`);
  }

  return result;
}

async function seedExternalCaptures(agencyId) {
  const captures = [
    { url: 'https://booking.com/cancun-resort', source: 'Booking.com', title: 'Cancún Resort 3 stars', price: 3200 },
    { url: 'https://expedia.com/paris-hotel', source: 'Expedia', title: 'Paris 4-star central', price: 7500 },
    { url: 'https://trip.com/orlando', source: 'Trip.com', title: 'Orlando Park Packages', price: 5500 },
    { url: 'https://tripadvisor.com/maceio', source: 'TripAdvisor', title: 'Maceió Beachfront', price: 2100 },
  ];

  for (const capture of captures) {
    await pool.query(
      `INSERT INTO external_offer_captures (id, agency_id, source_url, source_name, raw_content, normalized_title, found_price, currency, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'BRL', 'CAPTURED', NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [generateId(), agencyId, capture.url, capture.source, JSON.stringify(capture), capture.title, capture.price]
    );
  }

  console.log(`   ✓ ${captures.length} capturas externas criadas`);
}

async function seedProposals(agencyId, customers, offers, userId) {
  const statuses = ['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED'];
  const result = [];

  // Create proposals: each 3 customers get 1 proposal for now
  for (let i = 0; i < 10; i++) {
    const customer = customers[i % customers.length];
    const offer = offers[i % offers.length];
    const status = statuses[i % statuses.length];
    const proposalId = generateId();

    const totalPassengers = 2 + (i % 3);
    const unitPrice = offer.price;
    const totalPrice = unitPrice * totalPassengers;

    await pool.query(
      `INSERT INTO proposals (id, agency_id, customer_id, offer_id, user_id, proposed_price, discount, total, valid_until, notes, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 0, $7, NOW() + INTERVAL '30 days', $8, $9, NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [proposalId, agencyId, customer.id, offer.id, userId, unitPrice, totalPrice, `${totalPassengers} passageiros`, status]
    );

    result.push({ id: proposalId, customerId: customer.id, status });
    console.log(`   ✓ Proposta para ${customer.name}: ${status}`);
  }

  return result;
}

async function seedSales(agencyId, proposals, customers, userId) {
  const result = [];

  // Convert accepted/viewed proposals to sales
  for (let i = 0; i < 8; i++) {
    const customer = customers[i % customers.length];
    const saleId = generateId();
    const totalPrice = 5000 + Math.random() * 15000;

    await pool.query(
      `INSERT INTO sales (id, agency_id, customer_id, proposal_id, user_id, amount, discount, total, status, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 0, $6, 'CONFIRMED', 'Venda demo', NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [saleId, agencyId, customer.id, proposals[i % proposals.length].id, userId, totalPrice]
    );

    result.push({ id: saleId, customerId: customer.id, amount: totalPrice });
    console.log(`   ✓ Venda: R$ ${totalPrice.toFixed(2)}`);
  }

  return result;
}

async function seedTrips(agencyId, sales) {
  const statuses = ['PLANNED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'];

  for (let i = 0; i < 6; i++) {
    const sale = sales[i % sales.length];
    const tripId = generateId();
    const status = statuses[i % statuses.length];
    const startDate = new Date(Date.now() + Math.random() * 180 * 24 * 60 * 60 * 1000);
    const endDate = new Date(startDate.getTime() + (5 + Math.random() * 9) * 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO trips (id, agency_id, customer_id, sale_id, name, destination, status, start_date, end_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'Destino Viagem', $6, $7, $8, NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [tripId, agencyId, sale.customerId, sale.id, `Viagem demo ${i + 1}`, status, startDate, endDate]
    );

    console.log(`   ✓ Viagem: ${status}`);
  }
}

async function seedRevenues(agencyId, sales) {
  const categoryId = await getOrCreateFinancialCategory(agencyId, 'Pacotes', 'REVENUE');
  const revenueCount = Math.max(15, sales.length);
  for (let i = 0; i < revenueCount; i++) {
    const sale = sales[i % sales.length];
    const saleId = i < sales.length ? sale.id : null;
    const revenueDate = new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000);
    const amount = sale.amount * 0.95; // 95% after commission

    await pool.query(
      `INSERT INTO revenues (id, agency_id, sale_id, customer_id, category_id, description, amount, currency, competency_date, due_date, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'Receita de pacote demo', $6, 'BRL', $7, $7, 'OPEN', NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [generateId(), agencyId, saleId, sale.customerId, categoryId, amount, revenueDate]
    );
  }

  console.log(`   ✓ ${revenueCount} registros de receita criados`);
}

async function seedExpenses(agencyId) {
  const categoryId = await getOrCreateFinancialCategory(agencyId, 'Operacional', 'EXPENSE');
  const categories = ['HOSPEDAGEM', 'PASSAGENS', 'OPERACIONAL', 'MARKETING', 'COMISSOES', 'IMPOSTOS'];
  for (let i = 0; i < 15; i++) {
    const category = categories[i % categories.length];
    const expenseDate = new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000);
    const amount = 500 + Math.random() * 3000;

    await pool.query(
      `INSERT INTO expenses (id, agency_id, category_id, description, amount, currency, incurred_at, due_date, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'BRL', $6, $6, 'OPEN', NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [generateId(), agencyId, categoryId, `Despesa de ${category}`, amount, expenseDate]
    );
  }

  console.log('   ✓ 15 registros de despesa criados');
}

async function seedReceivables(agencyId, sales) {
  // 80% of sales should have receivables
  for (let i = 0; i < Math.floor(sales.length * 0.8); i++) {
    const sale = sales[i];
    const statuses = ['OPEN', 'PARTIALLY_PAID', 'PAID'];
    const status = statuses[Math.floor(i / 3) % statuses.length];
    const amount = sale.amount;
    const dueDate = new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO receivables (id, agency_id, sale_id, customer_id, description, amount, due_at, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'Parcela demo', $5, $6, $7, NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [generateId(), agencyId, sale.id, sale.customerId, amount, dueDate, status]
    );
  }

  console.log(`   ✓ Recebíveis criados para ${Math.floor(sales.length * 0.8)} vendas`);
}

async function seedSuppliers(agencyId) {
  const suppliers = [
    {
      name: 'LATAM Airlines Brasil',
      tradeName: 'LATAM',
      document: '02.012.862/0001-60',
      supplierType: 'TRAVEL',
      categories: ['AIRLINE'],
      email: 'parcerias@latam-demo.com',
      phone: '+55 11 4000-1000',
      website: 'https://www.latamairlines.com',
      paymentTerms: '30 dias',
    },
    {
      name: 'Grand Cancún Resort & Spa',
      tradeName: 'Grand Cancún',
      document: '12.345.678/0001-90',
      supplierType: 'TRAVEL',
      categories: ['HOTEL', 'RESORT'],
      email: 'reservas@grandcancun-demo.com',
      phone: '+52 998 555-0100',
      paymentTerms: '15 dias',
    },
    {
      name: 'CVC Operadora de Turismo',
      tradeName: 'CVC',
      document: '10.760.260/0001-19',
      supplierType: 'TRAVEL',
      categories: ['TOUR_OPERATOR', 'CONSOLIDATOR'],
      email: 'comercial@cvc-demo.com',
      phone: '+55 11 4003-2222',
      paymentTerms: '45 dias',
    },
    {
      name: 'Contábil Prime Assessoria Ltda',
      tradeName: 'Contábil Prime',
      document: '20.456.789/0001-33',
      supplierType: 'OPERATIONAL',
      categories: ['ACCOUNTING', 'LEGAL'],
      email: 'contato@contabilprime-demo.com',
      phone: '+55 11 3000-4000',
      paymentTerms: 'Mensal, todo dia 10',
    },
    {
      name: 'CloudSoft Sistemas de Gestão',
      tradeName: 'CloudSoft',
      document: '30.987.654/0001-21',
      supplierType: 'OPERATIONAL',
      categories: ['SOFTWARE', 'INTERNET'],
      email: 'suporte@cloudsoft-demo.com',
      phone: '+55 11 3500-7000',
      website: 'https://cloudsoft-demo.com',
      paymentTerms: 'Assinatura mensal',
    },
    {
      name: 'Rivera Transfer & Receptivo',
      tradeName: 'Rivera Transfer',
      document: '15.222.333/0001-44',
      supplierType: 'TRAVEL',
      categories: ['TRANSFER', 'RECEPTIVE_OPERATOR'],
      email: 'reservas@riveratransfer-demo.com',
      phone: '+52 998 555-0200',
      paymentTerms: '15 dias',
    },
    {
      name: 'Global Assist Seguros de Viagem',
      tradeName: 'Global Assist',
      document: '18.777.888/0001-55',
      supplierType: 'TRAVEL',
      categories: ['TRAVEL_INSURANCE', 'INSURANCE'],
      email: 'comercial@globalassist-demo.com',
      phone: '+55 11 4004-3333',
      paymentTerms: '30 dias',
    },
  ];

  const created = [];
  for (const supplier of suppliers) {
    const id = generateId();
    await pool.query(
      `INSERT INTO suppliers (
         id, agency_id, name, trade_name, document, supplier_type, email, phone, website,
         payment_terms, active, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [
        id,
        agencyId,
        supplier.name,
        supplier.tradeName ?? null,
        supplier.document ?? null,
        supplier.supplierType,
        supplier.email ?? null,
        supplier.phone ?? null,
        supplier.website ?? null,
        supplier.paymentTerms ?? null,
      ]
    );

    for (const category of supplier.categories) {
      await pool.query(
        `INSERT INTO supplier_category_links (id, agency_id, supplier_id, category, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT DO NOTHING`,
        [generateId(), agencyId, id, category]
      );
    }

    created.push({ id, name: supplier.name });
  }

  console.log(`   ✓ ${created.length} fornecedores criados`);
  return created;
}

async function seedAirServices(agencyId, suppliers = []) {
  const latam = suppliers.find((s) => s.name === 'LATAM Airlines Brasil') ?? null;

  async function findCustomerId(name) {
    const result = await pool.query(
      `SELECT id FROM customers WHERE agency_id = $1 AND name = $2 LIMIT 1`,
      [agencyId, name],
    );
    return result.rows[0]?.id ?? null;
  }

  async function tripExists(tripId) {
    const result = await pool.query(
      `SELECT id FROM trips WHERE agency_id = $1 AND id = $2 LIMIT 1`,
      [agencyId, tripId],
    );
    return result.rows.length > 0;
  }

  async function insertSegment(seg) {
    if (!(await tripExists(seg.tripId))) return;
    await pool.query(
      `INSERT INTO air_services (
         id, agency_id, trip_id, supplier_id, customer_id, airline, direction, sequence,
         origin, destination, departure_date, departure_time, arrival_date, arrival_time,
         flight_number, cabin_class, booking_locator, fare, taxes, fees, commission, cost,
         sale_value, currency, supplier_due_date, supplier_payment_status, status, notes,
         created_at, updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
         $19, $20, $21, $22, $23, 'BRL', $24, $25, $26, $27, NOW(), NOW()
       )
       ON CONFLICT (id) DO NOTHING`,
      [
        seg.id, agencyId, seg.tripId, seg.supplierId, seg.customerId, seg.airline,
        seg.direction, seg.sequence, seg.origin, seg.destination, seg.departureDate,
        seg.departureTime, seg.arrivalDate, seg.arrivalTime, seg.flightNumber,
        seg.cabinClass, seg.bookingLocator, seg.fare, seg.taxes, seg.fees,
        seg.commission, seg.cost, seg.saleValue, seg.supplierDueDate,
        seg.supplierPaymentStatus, seg.status, seg.notes,
      ],
    );
  }

  // Mariana Alves Silva / Cancun -- canonical fixture. Air cost should total
  // ~R$5.000 across the round trip (matches the existing payableAereo demo
  // record "Aereo - Sao Paulo / Cancun" 5000, seeded in demo-business-stories.cjs).
  // This is a new, additive supporting record -- it does NOT touch the Sale/
  // Receivable/Margin numbers or the existing payable.
  const marianaCustomerId = await findCustomerId('Mariana Alves Silva');
  if (marianaCustomerId) {
    await insertSegment({
      id: 'd0d5a001-0000-4000-8000-000000000001',
      tripId: STORY_IDS.marianaCancun.trip,
      supplierId: latam?.id ?? null,
      customerId: marianaCustomerId,
      airline: 'LATAM Airlines',
      direction: 'OUTBOUND',
      sequence: 1,
      origin: 'JOI/GRU',
      destination: 'CUN',
      departureDate: '2027-05-01',
      departureTime: '06:40',
      arrivalDate: '2027-05-01',
      arrivalTime: '14:55',
      flightNumber: 'LA3344/LA0503',
      cabinClass: 'ECONOMY',
      bookingLocator: 'DEMO-MC-OUT',
      fare: 2200,
      taxes: 380,
      fees: 120,
      commission: 150,
      cost: 2700,
      saleValue: 3100,
      supplierDueDate: '2027-04-10',
      supplierPaymentStatus: 'OPEN',
      status: 'CONFIRMED',
      notes: 'Demo: trecho de ida Mariana / Cancun (familia).',
    });
    await insertSegment({
      id: 'd0d5a001-0000-4000-8000-000000000002',
      tripId: STORY_IDS.marianaCancun.trip,
      supplierId: latam?.id ?? null,
      customerId: marianaCustomerId,
      airline: 'LATAM Airlines',
      direction: 'RETURN',
      sequence: 1,
      origin: 'CUN',
      destination: 'GRU/JOI',
      departureDate: '2027-05-10',
      departureTime: '16:20',
      arrivalDate: '2027-05-11',
      arrivalTime: '08:10',
      flightNumber: 'LA0504/LA3345',
      cabinClass: 'ECONOMY',
      bookingLocator: 'DEMO-MC-RET',
      fare: 1900,
      taxes: 320,
      fees: 80,
      commission: 130,
      cost: 2300,
      saleValue: 2650,
      supplierDueDate: '2027-04-10',
      supplierPaymentStatus: 'OPEN',
      status: 'CONFIRMED',
      notes: 'Demo: trecho de volta Mariana / Cancun (familia).',
    });
  }

  // Fernando Costa Gomes / Orlando-Disney -- supporting story.
  const fernandoCustomerId = await findCustomerId('Fernando Costa Gomes');
  if (fernandoCustomerId) {
    await insertSegment({
      id: 'd0d5a002-0000-4000-8000-000000000001',
      tripId: STORY_IDS.disney.trip,
      supplierId: latam?.id ?? null,
      customerId: fernandoCustomerId,
      airline: 'Copa Airlines',
      direction: 'OUTBOUND',
      sequence: 1,
      origin: 'GRU',
      destination: 'MCO',
      departureDate: '2027-06-01',
      departureTime: '09:15',
      arrivalDate: '2027-06-01',
      arrivalTime: '19:40',
      flightNumber: 'CM0705/CM0201',
      cabinClass: 'ECONOMY',
      bookingLocator: 'DEMO-FD-OUT',
      fare: 3400,
      taxes: 520,
      fees: 140,
      commission: 210,
      cost: 4060,
      saleValue: 4600,
      supplierDueDate: '2027-05-05',
      supplierPaymentStatus: 'OPEN',
      status: 'CONFIRMED',
      notes: 'Demo: trecho de ida Fernando / Orlando (Disney).',
    });
    await insertSegment({
      id: 'd0d5a002-0000-4000-8000-000000000002',
      tripId: STORY_IDS.disney.trip,
      supplierId: latam?.id ?? null,
      customerId: fernandoCustomerId,
      airline: 'Copa Airlines',
      direction: 'RETURN',
      sequence: 1,
      origin: 'MCO',
      destination: 'GRU',
      departureDate: '2027-06-10',
      departureTime: '21:05',
      arrivalDate: '2027-06-11',
      arrivalTime: '09:50',
      flightNumber: 'CM0202/CM0704',
      cabinClass: 'ECONOMY',
      bookingLocator: 'DEMO-FD-RET',
      fare: 3200,
      taxes: 500,
      fees: 130,
      commission: 200,
      cost: 3830,
      saleValue: 4350,
      supplierDueDate: '2027-05-05',
      supplierPaymentStatus: 'OPEN',
      status: 'CONFIRMED',
      notes: 'Demo: trecho de volta Fernando / Orlando (Disney).',
    });
  }

  // Roberto Fernandes / Paris (honeymoon) -- one-way outbound only, kept
  // simple to demonstrate a single-segment trip (not every trip is round trip).
  const robertoCustomerId = await findCustomerId('Roberto Fernandes');
  if (robertoCustomerId) {
    await insertSegment({
      id: 'd0d5a003-0000-4000-8000-000000000001',
      tripId: STORY_IDS.honeymoon.trip,
      supplierId: latam?.id ?? null,
      customerId: robertoCustomerId,
      airline: 'Air France',
      direction: 'OUTBOUND',
      sequence: 1,
      origin: 'GRU',
      destination: 'CDG',
      departureDate: '2027-06-01',
      departureTime: '23:55',
      arrivalDate: '2027-06-02',
      arrivalTime: '15:10',
      flightNumber: 'AF0460',
      cabinClass: 'PREMIUM_ECONOMY',
      bookingLocator: 'DEMO-RF-OUT',
      fare: 4200,
      taxes: 650,
      fees: 150,
      commission: 260,
      cost: 5000,
      saleValue: 5700,
      supplierDueDate: '2027-05-01',
      supplierPaymentStatus: 'PARTIALLY_PAID',
      status: 'CONFIRMED',
      notes: 'Demo: trecho de ida Roberto / Paris (lua de mel).',
    });
  }

  console.log('   ✓ Segmentos aéreos criados (Mariana/Cancun, Fernando/Disney, Roberto/Paris)');
}

async function seedLandServices(agencyId, suppliers = []) {
  const grandCancun = suppliers.find((s) => s.name === 'Grand Cancún Resort & Spa') ?? null;
  const riveraTransfer = suppliers.find((s) => s.name === 'Rivera Transfer & Receptivo') ?? null;
  const globalAssist = suppliers.find((s) => s.name === 'Global Assist Seguros de Viagem') ?? null;
  const cvc = suppliers.find((s) => s.name === 'CVC Operadora de Turismo') ?? null;

  async function findCustomerId(name) {
    const result = await pool.query(
      `SELECT id FROM customers WHERE agency_id = $1 AND name = $2 LIMIT 1`,
      [agencyId, name],
    );
    return result.rows[0]?.id ?? null;
  }

  async function tripExists(tripId) {
    const result = await pool.query(
      `SELECT id FROM trips WHERE agency_id = $1 AND id = $2 LIMIT 1`,
      [agencyId, tripId],
    );
    return result.rows.length > 0;
  }

  async function insertService(svc) {
    if (!(await tripExists(svc.tripId))) return;
    await pool.query(
      `INSERT INTO land_services (
         id, agency_id, trip_id, supplier_id, customer_id, service_type, description,
         start_date, end_date, quantity, cost, sale_value, taxes, fees, commission,
         currency, supplier_due_date, supplier_payment_status, status, confirmation_number,
         notes, created_at, updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'BRL', $16, $17,
         $18, $19, $20, NOW(), NOW()
       )
       ON CONFLICT (id) DO NOTHING`,
      [
        svc.id, agencyId, svc.tripId, svc.supplierId, svc.customerId, svc.serviceType,
        svc.description, svc.startDate, svc.endDate, svc.quantity, svc.cost, svc.saleValue,
        svc.taxes, svc.fees, svc.commission, svc.supplierDueDate, svc.supplierPaymentStatus,
        svc.status, svc.confirmationNumber, svc.notes,
      ],
    );
  }

  // Mariana Alves Silva / Cancun -- canonical fixture. Land services total
  // ~R$8.300 across 3 rows (hotel 7000 + transfer 800 + insurance 500),
  // matching the existing payableHotel/payableTransfer/payableSeguro demo
  // records seeded in demo-business-stories.cjs. These are new, additive
  // supporting records -- they do NOT touch the Sale/Receivable/Margin
  // numbers or the existing payables.
  const marianaCustomerId = await findCustomerId('Mariana Alves Silva');
  if (marianaCustomerId) {
    await insertService({
      id: 'd0d5b001-0000-4000-8000-000000000001',
      tripId: STORY_IDS.marianaCancun.trip,
      supplierId: grandCancun?.id ?? null,
      customerId: marianaCustomerId,
      serviceType: 'ACCOMMODATION',
      description: 'Grand Palladium Cancun - 9 noites, all-inclusive',
      startDate: '2027-05-01',
      endDate: '2027-05-10',
      quantity: 9,
      cost: 7000,
      saleValue: 8200,
      taxes: 0,
      fees: 0,
      commission: 400,
      supplierDueDate: '2027-04-15',
      supplierPaymentStatus: 'OPEN',
      status: 'CONFIRMED',
      confirmationNumber: 'DEMO-MC-HTL',
      notes: 'Demo: hospedagem Mariana / Cancun (familia).',
    });
    await insertService({
      id: 'd0d5b001-0000-4000-8000-000000000002',
      tripId: STORY_IDS.marianaCancun.trip,
      supplierId: riveraTransfer?.id ?? null,
      customerId: marianaCustomerId,
      serviceType: 'TRANSFER',
      description: 'Transfer aeroporto / resort - ida e volta',
      startDate: '2027-05-01',
      endDate: '2027-05-10',
      quantity: 2,
      cost: 800,
      saleValue: 950,
      taxes: 0,
      fees: 0,
      commission: 50,
      supplierDueDate: '2027-04-20',
      supplierPaymentStatus: 'OPEN',
      status: 'CONFIRMED',
      confirmationNumber: 'DEMO-MC-TRF',
      notes: 'Demo: transfer Mariana / Cancun (familia).',
    });
    await insertService({
      id: 'd0d5b001-0000-4000-8000-000000000003',
      tripId: STORY_IDS.marianaCancun.trip,
      supplierId: globalAssist?.id ?? null,
      customerId: marianaCustomerId,
      serviceType: 'TRAVEL_INSURANCE',
      description: 'Seguro viagem família - cobertura internacional',
      startDate: '2027-05-01',
      endDate: '2027-05-10',
      quantity: 1,
      cost: 500,
      saleValue: 600,
      taxes: 0,
      fees: 0,
      commission: 30,
      supplierDueDate: '2027-04-20',
      supplierPaymentStatus: 'OPEN',
      status: 'CONFIRMED',
      confirmationNumber: 'DEMO-MC-INS',
      notes: 'Demo: seguro viagem Mariana / Cancun (familia).',
    });
  }

  // Fernando Costa Gomes / Orlando-Disney -- hotel + tickets.
  const fernandoCustomerId = await findCustomerId('Fernando Costa Gomes');
  if (fernandoCustomerId) {
    await insertService({
      id: 'd0d5b002-0000-4000-8000-000000000001',
      tripId: STORY_IDS.disney.trip,
      supplierId: cvc?.id ?? null,
      customerId: fernandoCustomerId,
      serviceType: 'ACCOMMODATION',
      description: 'Disney Grand Floridian Resort - 9 noites',
      startDate: '2027-06-01',
      endDate: '2027-06-10',
      quantity: 9,
      cost: 9500,
      saleValue: 11200,
      taxes: 0,
      fees: 0,
      commission: 550,
      supplierDueDate: '2027-05-10',
      supplierPaymentStatus: 'OPEN',
      status: 'CONFIRMED',
      confirmationNumber: 'DEMO-FD-HTL',
      notes: 'Demo: hospedagem Fernando / Orlando (Disney).',
    });
    await insertService({
      id: 'd0d5b002-0000-4000-8000-000000000002',
      tripId: STORY_IDS.disney.trip,
      supplierId: cvc?.id ?? null,
      customerId: fernandoCustomerId,
      serviceType: 'TICKET',
      description: 'Ingressos Disney Park Hopper - 6 dias (família)',
      startDate: '2027-06-02',
      endDate: '2027-06-08',
      quantity: 4,
      cost: 3200,
      saleValue: 3800,
      taxes: 0,
      fees: 0,
      commission: 180,
      supplierDueDate: '2027-05-10',
      supplierPaymentStatus: 'OPEN',
      status: 'CONFIRMED',
      confirmationNumber: 'DEMO-FD-TIX',
      notes: 'Demo: ingressos Fernando / Orlando (Disney).',
    });
  }

  // Roberto Fernandes / Paris (honeymoon) -- hotel.
  const robertoCustomerId = await findCustomerId('Roberto Fernandes');
  if (robertoCustomerId) {
    await insertService({
      id: 'd0d5b003-0000-4000-8000-000000000001',
      tripId: STORY_IDS.honeymoon.trip,
      supplierId: cvc?.id ?? null,
      customerId: robertoCustomerId,
      serviceType: 'ACCOMMODATION',
      description: 'Hotel Le Meurice Paris - 8 noites',
      startDate: '2027-06-02',
      endDate: '2027-06-10',
      quantity: 8,
      cost: 7500,
      saleValue: 8900,
      taxes: 0,
      fees: 0,
      commission: 420,
      supplierDueDate: '2027-05-01',
      supplierPaymentStatus: 'PARTIALLY_PAID',
      status: 'CONFIRMED',
      confirmationNumber: 'DEMO-RF-HTL',
      notes: 'Demo: hospedagem Roberto / Paris (lua de mel).',
    });
  }

  console.log('   ✓ Serviços terrestres criados (Mariana/Cancun, Fernando/Disney, Roberto/Paris)');
}

async function seedPayables(agencyId, suppliers = []) {
  const categories = ['HOSPEDAGEM', 'PASSAGENS', 'COMISSOES'];
  const statuses = ['OPEN', 'PARTIALLY_PAID', 'PAID'];

  for (let i = 0; i < 12; i++) {
    const category = categories[i % categories.length];
    const status = statuses[Math.floor(i / 4) % statuses.length];
    const amount = 1000 + Math.random() * 5000;
    const dueDate = new Date(Date.now() + (10 + Math.random() * 50) * 24 * 60 * 60 * 1000);
    const supplierId = suppliers.length > 0 ? suppliers[i % suppliers.length].id : null;

    await pool.query(
      `INSERT INTO payables (id, agency_id, supplier_id, description, amount, due_at, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [generateId(), agencyId, supplierId, `Conta a pagar demo - ${category}`, amount, dueDate, status]
    );
  }

  console.log('   ✓ 12 contas a pagar criadas');
}

async function seedCashTransactions(agencyId) {
  const types = ['ENTRY', 'EXIT', 'ENTRY', 'ENTRY', 'EXIT', 'ADJUSTMENT'];
  let balance = 15000;

  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    const amount = type === 'ADJUSTMENT' ? 50 + Math.random() * 200 : 500 + Math.random() * 3000;
    const signedDelta = type === 'EXIT' ? -amount : amount;
    balance += signedDelta;
    const occurringAt = new Date(Date.now() - (types.length - i) * 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO cash_transactions (id, agency_id, type, amount, occurring_at, origin, calculated_balance, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, 'MANUAL', $6, $7, NOW()) ON CONFLICT DO NOTHING`,
      [generateId(), agencyId, type, amount, occurringAt, balance, `Movimentação demo #${i + 1}`]
    );
  }

  console.log(`   ✓ ${types.length} movimentações de caixa criadas`);
}

async function seedReconciliations(agencyId) {
  const statuses = ['RECONCILED', 'RECONCILED', 'NOT_RECONCILED'];

  for (let i = 0; i < statuses.length; i++) {
    const status = statuses[i];
    const expected = 1000 + Math.random() * 4000;
    const actual = status === 'RECONCILED' ? expected : expected - (50 + Math.random() * 200);
    const reconciliationDate = new Date(Date.now() - (statuses.length - i) * 5 * 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO reconciliations (id, agency_id, reconciliation_date, expected_amount, actual_amount, status, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [generateId(), agencyId, reconciliationDate, expected, actual, status, `Conciliação demo #${i + 1}`]
    );
  }

  console.log(`   ✓ ${statuses.length} conciliações criadas`);
}

async function seedCustomerDocuments(agencyId, customers) {
  const docTypes = ['PASSAPORTE', 'RG', 'CPF'];
  let count = 0;

  for (let i = 0; i < Math.min(customers.length, 8); i++) {
    const customer = customers[i];
    const documentType = docTypes[i % docTypes.length];
    const verificationStatus = i % 4 === 0 ? 'PENDING' : 'VERIFIED';

    await pool.query(
      `INSERT INTO customer_documents
         (id, agency_id, customer_id, document_type, document_number, holder_name,
          issuing_country, issued_date, expiry_date, verification_status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'BR', $7, $8, $9, NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [
        generateId(),
        agencyId,
        customer.id,
        documentType,
        `DEMO-${String(1000 + i)}`,
        customer.name,
        new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000),
        new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000),
        verificationStatus,
      ]
    );
    count += 1;
  }

  console.log(`   ✓ ${count} documentos de clientes criados`);
}

async function seedEntitlements(agencyId) {
  const features = ['PESCADOR', 'CAMPAIGNS', 'CREATIVE_STUDIO', 'SOCIAL_PUBLISHING', 'SOCIAL_AUTOMATION'];

  for (const feature of features) {
    await pool.query(
      `INSERT INTO agency_entitlements (agency_id, feature, enabled, limits, updated_by)
       VALUES ($1, $2, true, '{}', 'demo-seed')
       ON CONFLICT (agency_id, feature) DO UPDATE SET enabled = true`,
      [agencyId, feature]
    );
  }

  console.log(`   ✓ Permissões habilitadas: ${features.join(', ')}`);
}

async function getOrCreateFinancialCategory(agencyId, name, type, parentCategoryId = null) {
  const result = await pool.query(
    `INSERT INTO financial_categories (id, agency_id, name, type, description, parent_category_id, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
     ON CONFLICT (agency_id, type, name) DO UPDATE SET is_active = true, parent_category_id = COALESCE(financial_categories.parent_category_id, EXCLUDED.parent_category_id)
     RETURNING id`,
    [generateId(), agencyId, name, type, `${name} demo`, parentCategoryId]
  );

  return result.rows[0].id;
}

async function getOrCreateCostCenter(agencyId, name, code) {
  const result = await pool.query(
    `INSERT INTO cost_centers (id, agency_id, name, code, description, active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
     ON CONFLICT (agency_id, name) DO UPDATE SET active = true
     RETURNING id`,
    [generateId(), agencyId, name, code, `${name} demo`]
  );

  return result.rows[0].id;
}

const EXPENSE_CATEGORY_TREE = {
  TRAVEL: ['AIR', 'ACCOMMODATION', 'TRANSFER', 'INSURANCE', 'TOURS', 'TICKETS', 'RENTAL', 'OTHER_TRAVEL'],
  PERSONNEL: ['SALARY', 'COMMISSION', 'BENEFITS', 'BONUS', 'REIMBURSEMENT', 'PAYROLL_ADJUSTMENT'],
  ADMINISTRATIVE: [
    'RENT', 'ELECTRICITY', 'WATER', 'INTERNET', 'PHONE', 'SOFTWARE', 'ACCOUNTING',
    'LEGAL', 'MARKETING', 'OFFICE', 'CLEANING', 'MAINTENANCE',
  ],
  FINANCIAL: ['BANK_FEE', 'CARD_FEE', 'INTEREST', 'TAX', 'OTHER'],
};

const COST_CENTERS = [
  ['ADMINISTRATION', 'ADM'],
  ['SALES', 'SLS'],
  ['MARKETING', 'MKT'],
  ['AIR_OPERATIONS', 'AIR'],
  ['LAND_OPERATIONS', 'LAND'],
  ['CUSTOMER_SERVICE', 'CS'],
  ['FINANCE', 'FIN'],
  ['GENERAL', 'GEN'],
];

async function seedFinanceCategoryHierarchyAndCostCenters(agencyId) {
  // Top-level EXPENSE branches, each with its subcategories as children.
  for (const [branchName, subNames] of Object.entries(EXPENSE_CATEGORY_TREE)) {
    const branchId = await getOrCreateFinancialCategory(agencyId, branchName, 'EXPENSE');
    for (const subName of subNames) {
      await getOrCreateFinancialCategory(agencyId, subName, 'EXPENSE', branchId);
    }
  }

  for (const [name, code] of COST_CENTERS) {
    await getOrCreateCostCenter(agencyId, name, code);
  }

  console.log(`   ✓ Hierarquia de categorias (EXPENSE) e ${COST_CENTERS.length} centros de custo criados`);
}

async function getCostCenterIdByName(agencyId, name) {
  const result = await pool.query(
    `SELECT id FROM cost_centers WHERE agency_id = $1 AND name = $2 LIMIT 1`,
    [agencyId, name]
  );
  return result.rows[0]?.id || null;
}

async function getOrCreateCommissionPlan(agencyId, plan) {
  const result = await pool.query(
    `INSERT INTO commission_plans (id, agency_id, name, calculation_type, percentage, fixed_amount, active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
     ON CONFLICT (agency_id, name) DO UPDATE SET active = true
     RETURNING id`,
    [generateId(), agencyId, plan.name, plan.calculationType, plan.percentage ?? null, plan.fixedAmount ?? null]
  );
  return result.rows[0].id;
}

async function getOrCreateEmployee(agencyId, employee) {
  const result = await pool.query(
    `INSERT INTO employees (
       id, agency_id, name, phone, email, hire_date, employment_type, role_title, department,
       cost_center_id, status, base_salary, user_id, default_commission_plan_id, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ACTIVE', $11, $12, $13, NOW(), NOW())
     ON CONFLICT (agency_id, user_id) WHERE user_id IS NOT NULL DO UPDATE SET
       role_title = EXCLUDED.role_title,
       department = EXCLUDED.department,
       cost_center_id = EXCLUDED.cost_center_id,
       base_salary = EXCLUDED.base_salary,
       default_commission_plan_id = EXCLUDED.default_commission_plan_id
     RETURNING id`,
    [
      generateId(),
      agencyId,
      employee.name,
      employee.phone,
      employee.email,
      employee.hireDate,
      employee.employmentType,
      employee.roleTitle,
      employee.department,
      employee.costCenterId,
      employee.baseSalary,
      employee.userId,
      employee.defaultCommissionPlanId,
    ]
  );
  return result.rows[0].id;
}

async function seedCommissionPlansAndEmployees(agencyId, agencyUsers) {
  const standardPlanId = await getOrCreateCommissionPlan(agencyId, {
    name: 'Comissão Padrão',
    calculationType: 'PERCENT_MARGIN',
    percentage: 10,
  });
  const seniorPlanId = await getOrCreateCommissionPlan(agencyId, {
    name: 'Comissão Sênior',
    calculationType: 'PERCENT_MARGIN',
    percentage: 12,
  });
  await getOrCreateCommissionPlan(agencyId, {
    name: 'Comissão Fixa Pacote Fechado',
    calculationType: 'FIXED',
    fixedAmount: 350,
  });
  console.log('   ✓ 3 planos de comissão criados (Padrão, Sênior, Fixa)');

  const adminCostCenterId = await getCostCenterIdByName(agencyId, 'ADMINISTRATION');
  const salesCostCenterId = await getCostCenterIdByName(agencyId, 'SALES');

  const byName = Object.fromEntries(agencyUsers.map((u) => [u.name, u]));

  const employeeSeeds = [
    {
      user: byName['João Silva'],
      phone: '11-91234-0001',
      hireDate: '2018-03-01',
      employmentType: 'EMPLOYEE',
      roleTitle: 'Diretor Geral',
      department: 'Administração',
      costCenterId: adminCostCenterId,
      baseSalary: 18000,
      defaultCommissionPlanId: null,
    },
    {
      user: byName['Maria Santos'],
      phone: '11-91234-0002',
      hireDate: '2019-06-15',
      employmentType: 'EMPLOYEE',
      roleTitle: 'Gerente Administrativa',
      department: 'Administração',
      costCenterId: adminCostCenterId,
      baseSalary: 9500,
      defaultCommissionPlanId: null,
    },
    {
      user: byName['Pedro Oliveira'],
      phone: '11-91234-0003',
      hireDate: '2020-02-10',
      employmentType: 'EMPLOYEE',
      roleTitle: 'Consultor de Viagens Sênior',
      department: 'Vendas',
      costCenterId: salesCostCenterId,
      baseSalary: 4200,
      defaultCommissionPlanId: seniorPlanId,
    },
    {
      user: byName['Ana Costa'],
      phone: '11-91234-0004',
      hireDate: '2021-08-20',
      employmentType: 'EMPLOYEE',
      roleTitle: 'Consultora de Viagens',
      department: 'Vendas',
      costCenterId: salesCostCenterId,
      baseSalary: 3200,
      defaultCommissionPlanId: standardPlanId,
    },
    {
      user: byName['Carlos Ferreira'],
      phone: '11-91234-0005',
      hireDate: '2022-01-05',
      employmentType: 'EMPLOYEE',
      roleTitle: 'Consultor de Viagens',
      department: 'Vendas',
      costCenterId: salesCostCenterId,
      baseSalary: 3200,
      defaultCommissionPlanId: standardPlanId,
    },
  ];

  for (const seed of employeeSeeds) {
    if (!seed.user) continue;
    await getOrCreateEmployee(agencyId, {
      name: seed.user.name,
      phone: seed.phone,
      email: seed.user.email,
      hireDate: seed.hireDate,
      employmentType: seed.employmentType,
      roleTitle: seed.roleTitle,
      department: seed.department,
      costCenterId: seed.costCenterId,
      baseSalary: seed.baseSalary,
      userId: seed.user.id,
      defaultCommissionPlanId: seed.defaultCommissionPlanId,
    });
    console.log(`   ✓ Funcionário: ${seed.user.name} (${seed.roleTitle})`);
  }
}

async function getSaleMarginForSeed(agencyId, saleId) {
  const saleResult = await pool.query(`SELECT total FROM sales WHERE agency_id = $1 AND id = $2`, [
    agencyId,
    saleId,
  ]);
  const total = Number(saleResult.rows[0]?.total ?? 0);
  const payablesResult = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payables WHERE agency_id = $1 AND sale_id = $2`,
    [agencyId, saleId]
  );
  const supplierCosts = Number(payablesResult.rows[0]?.total ?? 0);
  const opCostsResult = await pool.query(
    `SELECT COALESCE(SUM(COALESCE(actual_amount, expected_amount, 0)), 0) AS total
     FROM operational_costs WHERE agency_id = $1 AND sale_id = $2`,
    [agencyId, saleId]
  );
  const operationalCosts = Number(opCostsResult.rows[0]?.total ?? 0);
  const legacyCommissionResult = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM commissions WHERE agency_id = $1 AND sale_id = $2`,
    [agencyId, saleId]
  );
  const legacyCommission = Number(legacyCommissionResult.rows[0]?.total ?? 0);
  return Math.round((total - supplierCosts - operationalCosts - legacyCommission) * 100) / 100;
}

async function getOrCreateCommissionEntry(agencyId, { employeeId, saleId, tripId, planId, calculationBase, rate, amount }) {
  const existing = await pool.query(
    `SELECT id, status FROM commission_entries
     WHERE agency_id = $1 AND employee_id = $2 AND sale_id = $3 AND commission_plan_id = $4`,
    [agencyId, employeeId, saleId, planId]
  );
  if (existing.rows[0]) {
    return existing.rows[0];
  }
  const result = await pool.query(
    `INSERT INTO commission_entries
       (id, agency_id, employee_id, sale_id, trip_id, commission_plan_id, calculation_base, rate, amount, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING', NOW(), NOW())
     RETURNING id, status`,
    [generateId(), agencyId, employeeId, saleId, tripId, planId, calculationBase, rate, amount]
  );
  return result.rows[0];
}

async function approveCommissionEntrySeed(agencyId, id, approvedBy) {
  await pool.query(
    `UPDATE commission_entries SET status = 'APPROVED', approved_at = NOW(), approved_by = $3, updated_at = NOW()
     WHERE agency_id = $1 AND id = $2 AND status = 'PENDING'`,
    [agencyId, id, approvedBy]
  );
}

async function createPayableFromCommissionSeed(agencyId, commissionEntryId) {
  const commission = await pool.query(
    `SELECT ce.id, ce.employee_id, ce.amount, e.name AS employee_name
     FROM commission_entries ce JOIN employees e ON e.agency_id = ce.agency_id AND e.id = ce.employee_id
     WHERE ce.agency_id = $1 AND ce.id = $2 AND ce.status = 'APPROVED'`,
    [agencyId, commissionEntryId]
  );
  const row = commission.rows[0];
  if (!row) return null;

  const existingPayable = await pool.query(
    `SELECT id FROM payables WHERE agency_id = $1 AND commission_entry_id = $2`,
    [agencyId, commissionEntryId]
  );
  if (existingPayable.rows[0]) return existingPayable.rows[0].id;

  const categoryResult = await pool.query(
    `SELECT id FROM financial_categories WHERE agency_id = $1 AND type = 'EXPENSE' AND name = 'COMMISSION' LIMIT 1`,
    [agencyId]
  );
  const categoryId = categoryResult.rows[0]?.id || null;

  const payableResult = await pool.query(
    `INSERT INTO payables (id, agency_id, description, amount, due_at, status, beneficiary_type, employee_id, commission_entry_id, category_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), 'OPEN', 'EMPLOYEE', $5, $6, $7, NOW(), NOW())
     RETURNING id`,
    [generateId(), agencyId, `Comissão - ${row.employee_name}`, row.amount, row.employee_id, commissionEntryId, categoryId]
  );

  await pool.query(
    `UPDATE commission_entries SET status = 'PAYABLE', updated_at = NOW() WHERE agency_id = $1 AND id = $2`,
    [agencyId, commissionEntryId]
  );

  return payableResult.rows[0].id;
}

async function seedCommissionsAndPayroll(agencyId, agencyUsers) {
  const byName = Object.fromEntries(agencyUsers.map((u) => [u.name, u]));

  const employeeRows = await pool.query(
    `SELECT id, name, user_id, base_salary FROM employees WHERE agency_id = $1`,
    [agencyId]
  );
  const employeesByName = Object.fromEntries(employeeRows.rows.map((e) => [e.name, e]));

  const planRows = await pool.query(
    `SELECT id, name, calculation_type, percentage, fixed_amount FROM commission_plans WHERE agency_id = $1`,
    [agencyId]
  );
  const plansByName = Object.fromEntries(planRows.rows.map((p) => [p.name, p]));

  const joao = employeesByName['João Silva'];
  const pedro = employeesByName['Pedro Oliveira'];
  const ana = employeesByName['Ana Costa'];
  const carlos = employeesByName['Carlos Ferreira'];
  const seniorPlan = plansByName['Comissão Sênior'];
  const standardPlan = plansByName['Comissão Padrão'];

  if (!joao || !seniorPlan) {
    console.log('   ⚠ Funcionário João Silva ou plano Sênior ausente — pulando comissões demo');
    return;
  }

  const adminUserId = byName['João Silva']?.id || null;

  // 1) Canonical fixture: Mariana Alves Silva / Cancun -> João Silva, 12% margin.
  //    Margin is preserved at R$4.000 (gross 18.000 - 14.000 supplier payables),
  //    so commission = 480. Approved and converted to a payable.
  const marianaSaleId = STORY_IDS.marianaCancun.sale;
  const marianaMargin = await getSaleMarginForSeed(agencyId, marianaSaleId);
  const marianaCommission = await getOrCreateCommissionEntry(agencyId, {
    employeeId: joao.id,
    saleId: marianaSaleId,
    tripId: STORY_IDS.marianaCancun.trip,
    planId: seniorPlan.id,
    calculationBase: marianaMargin,
    rate: Number(seniorPlan.percentage),
    amount: Math.round(marianaMargin * (Number(seniorPlan.percentage) / 100) * 100) / 100,
  });
  await approveCommissionEntrySeed(agencyId, marianaCommission.id, adminUserId);
  await createPayableFromCommissionSeed(agencyId, marianaCommission.id);
  console.log('   ✓ Comissão João Silva / Mariana Cancun: aprovada e convertida em conta a pagar');

  // 2) Fernando Costa Gomes / Disney -> Pedro Oliveira, Sênior plan (approved + payable).
  if (pedro && seniorPlan) {
    const disneySaleId = STORY_IDS.disney.sale;
    const disneyMargin = await getSaleMarginForSeed(agencyId, disneySaleId);
    const disneyCommission = await getOrCreateCommissionEntry(agencyId, {
      employeeId: pedro.id,
      saleId: disneySaleId,
      tripId: STORY_IDS.disney.trip,
      planId: seniorPlan.id,
      calculationBase: disneyMargin,
      rate: Number(seniorPlan.percentage),
      amount: Math.round(disneyMargin * (Number(seniorPlan.percentage) / 100) * 100) / 100,
    });
    await approveCommissionEntrySeed(agencyId, disneyCommission.id, adminUserId);
    await createPayableFromCommissionSeed(agencyId, disneyCommission.id);
    console.log('   ✓ Comissão Pedro Oliveira / Fernando Disney: aprovada e convertida em conta a pagar');
  }

  // 3) Roberto Fernandes / Paris (honeymoon) -> Ana Costa, Padrão plan (left PENDING for workflow demo).
  if (ana && standardPlan) {
    const honeymoonSaleId = STORY_IDS.honeymoon.sale;
    const honeymoonMargin = await getSaleMarginForSeed(agencyId, honeymoonSaleId);
    await getOrCreateCommissionEntry(agencyId, {
      employeeId: ana.id,
      saleId: honeymoonSaleId,
      tripId: STORY_IDS.honeymoon.trip,
      planId: standardPlan.id,
      calculationBase: honeymoonMargin,
      rate: Number(standardPlan.percentage),
      amount: Math.round(honeymoonMargin * (Number(standardPlan.percentage) / 100) * 100) / 100,
    });
    console.log('   ✓ Comissão Ana Costa / Roberto Paris: gerada (PENDING, aguardando aprovação)');
  }

  // Employee deductions: one ADVANCE for Carlos Ferreira this month.
  const competenceMonth = new Date();
  competenceMonth.setUTCDate(1);
  if (carlos) {
    const existingDeduction = await pool.query(
      `SELECT id FROM employee_deductions
       WHERE agency_id = $1 AND employee_id = $2 AND date_trunc('month', competence) = date_trunc('month', $3::date)`,
      [agencyId, carlos.id, competenceMonth]
    );
    if (!existingDeduction.rows[0]) {
      await pool.query(
        `INSERT INTO employee_deductions (id, agency_id, employee_id, competence, type, description, amount, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'ADVANCE', 'Adiantamento salarial', 500, 'Demo: adiantamento solicitado pelo funcionário', NOW(), NOW())`,
        [generateId(), agencyId, carlos.id, competenceMonth]
      );
      console.log('   ✓ Desconto (ADVANCE) criado para Carlos Ferreira: R$ 500');
    }
  }

  // Payroll entries for João, Pedro, Ana for the current competence month,
  // rolling up approved commissions and deductions.
  const payrollTargets = [joao, pedro, carlos].filter(Boolean);
  for (const employee of payrollTargets) {
    const existingPayroll = await pool.query(
      `SELECT id, status FROM payroll_entries
       WHERE agency_id = $1 AND employee_id = $2 AND date_trunc('month', competence) = date_trunc('month', $3::date)`,
      [agencyId, employee.id, competenceMonth]
    );
    if (existingPayroll.rows[0]) continue;

    const commissionsResult = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM commission_entries
       WHERE agency_id = $1 AND employee_id = $2 AND status IN ('APPROVED', 'PAYABLE', 'PAID')
         AND date_trunc('month', created_at) = date_trunc('month', $3::date)`,
      [agencyId, employee.id, competenceMonth]
    );
    const commissionsTotal = Number(commissionsResult.rows[0]?.total ?? 0);

    const deductionsResult = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM employee_deductions
       WHERE agency_id = $1 AND employee_id = $2
         AND date_trunc('month', competence) = date_trunc('month', $3::date)`,
      [agencyId, employee.id, competenceMonth]
    );
    const discountsTotal = Number(deductionsResult.rows[0]?.total ?? 0);

    const baseSalary = Number(employee.base_salary ?? 0);
    const netAmount = Math.round((baseSalary + commissionsTotal - discountsTotal) * 100) / 100;

    const payrollId = generateId();
    await pool.query(
      `INSERT INTO payroll_entries
         (id, agency_id, employee_id, competence, base_salary, benefits, bonuses, commissions_total,
          reimbursements, additions, discounts_total, net_amount, status, due_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 0, 0, $6, 0, 0, $7, $8, 'OPEN', $4, NOW(), NOW())`,
      [payrollId, agencyId, employee.id, competenceMonth, baseSalary, commissionsTotal, discountsTotal, netAmount]
    );

    // Take João's payroll all the way to PAID (creates the settling payable) to
    // demonstrate full convergence; leave others OPEN for the workflow demo.
    if (employee.id === joao.id) {
      await pool.query(`UPDATE payroll_entries SET status = 'APPROVED', updated_at = NOW() WHERE id = $1`, [payrollId]);

      const categoryResult = await pool.query(
        `SELECT id FROM financial_categories WHERE agency_id = $1 AND type = 'EXPENSE' AND name = 'SALARY' LIMIT 1`,
        [agencyId]
      );
      const categoryId = categoryResult.rows[0]?.id || null;
      await pool.query(
        `INSERT INTO payables (id, agency_id, description, amount, due_at, status, beneficiary_type, employee_id, payroll_entry_id, category_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), 'OPEN', 'EMPLOYEE', $5, $6, $7, NOW(), NOW())`,
        [generateId(), agencyId, `Folha de pagamento - ${employee.name} (${competenceMonth.toISOString().slice(0, 7)})`, netAmount, employee.id, payrollId, categoryId]
      );
      await pool.query(`UPDATE payroll_entries SET status = 'PAID', paid_at = NOW(), updated_at = NOW() WHERE id = $1`, [payrollId]);
      console.log(`   ✓ Folha de pagamento João Silva (${competenceMonth.toISOString().slice(0, 7)}): PAGA, R$ ${netAmount.toFixed(2)}`);
    } else {
      console.log(`   ✓ Folha de pagamento ${employee.name} (${competenceMonth.toISOString().slice(0, 7)}): OPEN, R$ ${netAmount.toFixed(2)}`);
    }
  }
}

async function seedCampaigns(agencyId, userId) {
  const campaigns = [
    { name: 'Férias no Caribe', status: 'ACTIVE', offers: 2 },
    { name: 'Descobrindo Europa', status: 'ACTIVE', offers: 2 },
    { name: 'Fim de Semana Praia', status: 'ACTIVE', offers: 1 },
    { name: 'Viagem em Família', status: 'DRAFT', offers: 3 },
    { name: 'Lua de Mel Premium', status: 'ACTIVE', offers: 2 },
  ];

  for (const campaign of campaigns) {
    const campaignId = generateId();

    await pool.query(
      `INSERT INTO campaigns (id, agency_id, name, status, starts_at, ends_at, created_by_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW() + INTERVAL '90 days', $5, NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [campaignId, agencyId, campaign.name, campaign.status, userId]
    );

    console.log(`   ✓ Campanha: ${campaign.name}`);
  }
}

async function seedInteractions(agencyId, customers, userId) {
  const channels = ['EMAIL', 'PHONE', 'WHATSAPP', 'IN_PERSON'];
  const directions = ['INBOUND', 'OUTBOUND'];
  const types = ['INQUIRY', 'FOLLOW_UP', 'PROPOSAL_SENT', 'NEGOTIATION', 'CONFIRMATION'];

  for (let i = 0; i < 20; i++) {
    const customer = customers[i % customers.length];
    const channel = channels[i % channels.length];
    const direction = directions[i % directions.length];
    const type = types[Math.floor(Math.random() * types.length)];
    const notes = `Interação ${type} via ${channel}`;

    await pool.query(
      `INSERT INTO customer_interactions (id, agency_id, customer_id, user_id, channel, direction, occurred_at, summary, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, NOW()) ON CONFLICT DO NOTHING`,
      [generateId(), agencyId, customer.id, userId, channel, direction, notes]
    );
  }

  console.log('   ✓ 20 interações com clientes criadas');
}

async function seedBookings(agencyId, customers) {
  const departures = await pool.query(
    `SELECT id FROM scheduled_departures
     WHERE agency_id = $1 AND cancelled = false
     ORDER BY departure_at ASC
     LIMIT 8`,
    [agencyId]
  );

  if (departures.rows.length === 0) {
    console.log('   Nenhuma saída programada encontrada; reservas ignoradas');
    return;
  }

  for (let i = 0; i < 8; i++) {
    const customer = customers[i % customers.length];
    const departure = departures.rows[i % departures.rows.length];
    const bookingId = generateId();
    await pool.query(
      `INSERT INTO bookings (id, agency_id, booker_customer_id, trip_type, outbound_departure_id, notes, created_at, updated_at)
       VALUES ($1, $2, $3, 'ONE_WAY', $4, 'Reserva demo tenant', NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [bookingId, agencyId, customer.id, departure.id]
    );

    console.log('   ✓ Reserva: ida');
  }
}

async function verifyTenantData(agencyId) {
  const queries = [
    ['Clientes', 'SELECT COUNT(*) as count FROM customers WHERE agency_id = $1'],
    ['Desejos', 'SELECT COUNT(*) as count FROM wishes WHERE agency_id = $1'],
    ['Ofertas', 'SELECT COUNT(*) as count FROM offers WHERE agency_id = $1'],
    ['Propostas', 'SELECT COUNT(*) as count FROM proposals WHERE agency_id = $1'],
    ['Vendas', 'SELECT COUNT(*) as count FROM sales WHERE agency_id = $1'],
    ['Viagens', 'SELECT COUNT(*) as count FROM trips WHERE agency_id = $1'],
    ['Campanhas', 'SELECT COUNT(*) as count FROM campaigns WHERE agency_id = $1'],
    ['Reservas', 'SELECT COUNT(*) as count FROM bookings WHERE agency_id = $1'],
  ];

  for (const [label, sql] of queries) {
    const result = await pool.query(sql, [agencyId]);
    console.log(`   ✓ ${label}: ${result.rows[0].count}`);
  }
}

seedTenantData();
