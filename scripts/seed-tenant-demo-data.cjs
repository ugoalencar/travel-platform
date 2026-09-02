#!/usr/bin/env node
/**
 * Travel Platform — Tenant-Level Demo Data Seeder
 *
 * Populates a single agency (Alpha Viagens) with realistic end-to-end demo data:
 * - Customers with documents and dependents
 * - Travel wishes and desires
 * - Offers (catalog)
 * - Proposals and sales
 * - Trips and operations
 * - Financial records (revenues, expenses, receivables, payables)
 * - Campaigns and interactions
 */

const { Pool } = require('pg');
const crypto = require('crypto');
const { URL } = require('node:url');

const databaseUrl = process.env.DATABASE_URL ||
  'postgresql://travel_test:travel_test_password@127.0.0.1:55432/travel_platform_test';
const localDevAgencyId = '10000000-0000-4000-8000-000000000001';

// Safety guards: refuse to run against non-dev/non-local DB
if (process.env.NODE_ENV === 'production') {
  console.error('❌ ERROR: Cannot seed production database.\n');
  process.exit(1);
}

try {
  const url = new URL(databaseUrl);
  const isLocal = ['127.0.0.1', 'localhost'].includes(url.hostname);
  const isDev = url.pathname.includes('test') || url.pathname.includes('dev');

  if (!isLocal || !isDev) {
    console.error('❌ ERROR: Database URL is not a local test/dev database.\n');
    console.error(`   URL: ${databaseUrl}\n`);
    process.exit(1);
  }
} catch {
  console.error('❌ ERROR: Invalid DATABASE_URL.\n');
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
  console.log('Seeding Tenant-Level Demo Data');
  console.log('========================================\n');

  try {
    // Get the first agency (Alpha Viagens) - should already exist from platform seed
    console.log('0. Fetching demo agency...');
    const agency = await fetchDemoAgency();
    if (!agency) {
      throw new Error('Demo agency not found. Run seed-platform-demo-data.cjs first.');
    }
    console.log(`   ✓ Using agency: ${agency.name} (${agency.id})\n`);

    // Get subscriber tenant for this agency
    console.log('1. Fetching subscriber tenant...');
    const tenant = await fetchSubscriberTenant(agency.id);
    if (!tenant) {
      throw new Error('Subscriber tenant not found for demo agency.');
    }
    console.log(`   ✓ Tenant: ${tenant.id}\n`);

    console.log('2. Creating Agency Users...');
    const agencyUsers = await seedAgencyUsers(agency.id);

    console.log('3. Creating Customers...');
    const customers = await seedCustomers(agency.id);

    console.log('4. Creating Wishes...');
    await seedWishes(agency.id, customers);

    console.log('5. Creating Offers (Catalog)...');
    const offers = await seedOffers(agency.id);

    console.log('6. Creating External Offer Captures (Pescador)...');
    await seedExternalCaptures(agency.id);

    console.log('7. Creating Proposals...');
    const proposals = await seedProposals(agency.id, customers, offers, agencyUsers[0].id);

    console.log('8. Creating Sales...');
    const sales = await seedSales(agency.id, proposals, customers, agencyUsers[0].id);

    console.log('9. Creating Trips...');
    await seedTrips(agency.id, sales);

    console.log('10. Creating Financial Records (Revenues)...');
    await seedRevenues(agency.id, sales);

    console.log('11. Creating Financial Records (Expenses)...');
    await seedExpenses(agency.id);

    console.log('12. Creating Financial Records (Receivables)...');
    await seedReceivables(agency.id, sales);

    console.log('13. Creating Financial Records (Payables)...');
    await seedPayables(agency.id);

    console.log('14. Creating Campaigns...');
    await seedCampaigns(agency.id, agencyUsers[0].id);

    console.log('15. Creating Customer Interactions...');
    await seedInteractions(agency.id, customers, agencyUsers[0].id);

    console.log('16. Creating Bookings...');
    await seedBookings(agency.id, customers);

    console.log('\n17. Verifying tenant data...');
    await verifyTenantData(agency.id);

    console.log('\n✅ TENANT SEEDING COMPLETE\n');
  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
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
    result.push({ id: inserted.rows[0].id, name: user.name, role: user.role });
    console.log(`   ✓ ${user.name} (${user.role})`);
  }
  return result;
}

async function seedCustomers(agencyId) {
  const customers = [
    {
      name: 'Mariana Alves Silva',
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
    let customerId = generateId();

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
        console.log(`   Skipped duplicate customer seed: ${customerData.name}`);
        continue;
      }
      customerId = existingCustomer.rows[0].id;
    }

    // Insert address
    const addressId = generateId();
    await pool.query(
      `INSERT INTO customer_addresses (id, agency_id, customer_id, street, number, district, city, state, cep, country, type, is_primary, created_at, updated_at)
       VALUES ($1, $2, $3, $4, '100', 'Centro', $5, $6, '00000-000', 'Brasil', 'RESIDENTIAL', true, NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [addressId, agencyId, customerId, `Rua ${customerData.name}`, customerData.city, customerData.state]
    );

    // Insert dependents
    for (const dependent of customerData.dependents) {
      const dependentId = generateId();
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

  console.log(`   ✓ Created ${result.length} wishes`);
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

  console.log(`   ✓ Created ${captures.length} external captures`);
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

  console.log(`   ✓ Created ${revenueCount} revenue records`);
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

  console.log(`   ✓ Created 15 expense records`);
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

  console.log(`   ✓ Created receivables for ${Math.floor(sales.length * 0.8)} sales`);
}

async function seedPayables(agencyId) {
  const categories = ['HOSPEDAGEM', 'PASSAGENS', 'COMISSOES'];
  const statuses = ['OPEN', 'PARTIALLY_PAID', 'PAID'];

  for (let i = 0; i < 12; i++) {
    const category = categories[i % categories.length];
    const status = statuses[Math.floor(i / 4) % statuses.length];
    const amount = 1000 + Math.random() * 5000;
    const dueDate = new Date(Date.now() + (10 + Math.random() * 50) * 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO payables (id, agency_id, description, amount, due_at, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [generateId(), agencyId, `Conta a pagar demo - ${category}`, amount, dueDate, status]
    );
  }

  console.log(`   ✓ Created 12 payable records`);
}

async function getOrCreateFinancialCategory(agencyId, name, type) {
  const result = await pool.query(
    `INSERT INTO financial_categories (id, agency_id, name, type, description, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
     ON CONFLICT (agency_id, type, name) DO UPDATE SET is_active = true
     RETURNING id`,
    [generateId(), agencyId, name, type, `${name} demo`]
  );

  return result.rows[0].id;
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

  console.log(`   ✓ Created 20 customer interactions`);
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
    console.log('   No scheduled departures found; skipped bookings');
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

    console.log('   ✓ Booking: ONE_WAY');
  }
}

async function verifyTenantData(agencyId) {
  const queries = [
    ['Customers', 'SELECT COUNT(*) as count FROM customers WHERE agency_id = $1'],
    ['Wishes', 'SELECT COUNT(*) as count FROM wishes WHERE agency_id = $1'],
    ['Offers', 'SELECT COUNT(*) as count FROM offers WHERE agency_id = $1'],
    ['Proposals', 'SELECT COUNT(*) as count FROM proposals WHERE agency_id = $1'],
    ['Sales', 'SELECT COUNT(*) as count FROM sales WHERE agency_id = $1'],
    ['Trips', 'SELECT COUNT(*) as count FROM trips WHERE agency_id = $1'],
    ['Campaigns', 'SELECT COUNT(*) as count FROM campaigns WHERE agency_id = $1'],
    ['Bookings', 'SELECT COUNT(*) as count FROM bookings WHERE agency_id = $1'],
  ];

  for (const [label, sql] of queries) {
    const result = await pool.query(sql, [agencyId]);
    console.log(`   ✓ ${label}: ${result.rows[0].count}`);
  }
}

seedTenantData();
