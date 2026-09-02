#!/usr/bin/env node
/**
 * Complete Local Demo Data Seeder
 * Populates existing schema with realistic demo data
 * for immediate product demonstration
 */

const { Pool } = require('pg');
const crypto = require('crypto');

const databaseUrl = process.env.DATABASE_URL ||
  'postgresql://travel_test:travel_test_password@127.0.0.1:55432/travel_platform_test';

const pool = new Pool({ connectionString: databaseUrl });

function generateId() {
  return crypto.randomUUID();
}

async function seedDemo() {
  console.log('\n========================================');
  console.log('Seeding Complete Demo Data');
  console.log('========================================\n');

  try {
    // Get or create agency
    console.log('1. Setting up demo agency...');
    const agencyId = await getOrCreateAgency();

    console.log('2. Creating demo users...');
    await seedUsers(agencyId);

    console.log('3. Creating demo customers...');
    const customers = await seedCustomers(agencyId);

    console.log('4. Creating demo wishes...');
    await seedWishes(agencyId, customers);

    console.log('5. Creating demo offers...');
    const offers = await seedOffers(agencyId);

    console.log('6. Creating demo proposals...');
    await seedProposals(agencyId, customers, offers);

    console.log('7. Creating demo bookings...');
    await seedBookings(agencyId, customers, offers);

    console.log('8. Creating demo sales...');
    await seedSales(agencyId, customers);

    console.log('9. Creating demo trips...');
    await seedTrips();

    console.log('\n10. Verifying demo data...');
    await verifyData(agencyId);

    console.log('\n✅ DEMO SEEDING COMPLETE\n');
  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function getOrCreateAgency() {
  // Check if agency exists
  let result = await pool.query(
    `SELECT id FROM agencies WHERE name = 'Alpha Viagens' LIMIT 1`
  );

  if (result.rows.length > 0) {
    console.log('   ✓ Agency exists: Alpha Viagens');
    return result.rows[0].id;
  }

  // Create new agency
  const id = generateId();
  const slug = 'alpha-viagens';
  const email = 'contato@alpha-viagens.test';

  await pool.query(
    `INSERT INTO agencies (id, name, slug, email, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())`,
    [id, 'Alpha Viagens', slug, email]
  );

  console.log('   ✓ Agency created: Alpha Viagens');
  return id;
}

async function seedUsers(agencyId) {
  const users = [
    { name: 'João Silva', email: 'joao@alpha.test', role: 'OWNER' },
    { name: 'Maria Santos', email: 'maria@alpha.test', role: 'ADMIN' },
    { name: 'Pedro Oliveira', email: 'pedro@alpha.test', role: 'AGENT' },
    { name: 'Ana Costa', email: 'ana@alpha.test', role: 'AGENT' },
  ];

  let count = 0;
  for (const user of users) {
    const result = await pool.query(
      `SELECT 1 FROM users WHERE email = $1 AND agency_id = $2`,
      [user.email, agencyId]
    );

    if (result.rows.length === 0) {
      await pool.query(
        `INSERT INTO users (id, agency_id, name, email, role, password_hash, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'demo-password-hash', 'ACTIVE', NOW(), NOW())`,
        [generateId(), agencyId, user.name, user.email, user.role]
      );
      count++;
    }
  }
  console.log(`   ✓ Created/found ${users.length} users (${count} new)`);
}

async function seedCustomers(agencyId) {
  const customers = [
    { name: 'Mariana Alves Silva', email: 'mariana@email.com', phone: '11-98765-4321', cpf: '12345678901' },
    { name: 'Roberto Fernandes', email: 'roberto@email.com', phone: '21-99876-5432', cpf: '98765432109' },
    { name: 'Carla Mendes', email: 'carla@email.com', phone: '31-99123-4567', cpf: '45678901234' },
    { name: 'Fernando Costa', email: 'fernando@email.com', phone: '85-98765-0123', cpf: '78901234567' },
    { name: 'Juliana Santos', email: 'juliana@email.com', phone: '41-99456-7890', cpf: '01234567890' },
    { name: 'Gustavo Lima', email: 'gustavo@email.com', phone: '48-98901-2345', cpf: '23456789012' },
    { name: 'Beatriz Martins', email: 'beatriz@email.com', phone: '51-99234-5678', cpf: '34567890123' },
    { name: 'Rodrigo Dias', email: 'rodrigo@email.com', phone: '62-98567-8901', cpf: '56789012345' },
    { name: 'Patrícia Rocha', email: 'patricia@email.com', phone: '71-99678-9012', cpf: '67890123456' },
    { name: 'Marcos Almeida', email: 'marcos@email.com', phone: '67-98789-0123', cpf: '78901234567' },
    { name: 'Cristina Santos', email: 'cristina@email.com', phone: '11-99789-1234', cpf: '89012345678' },
    { name: 'André Pereira', email: 'andre@email.com', phone: '84-98890-2345', cpf: '90123456789' },
    { name: 'Sabrina Oliveira', email: 'sabrina@email.com', phone: '82-99901-3456', cpf: '01234567891' },
    { name: 'Vicente Gomes', email: 'vicente@email.com', phone: '11-98901-4567', cpf: '12345678902' },
    { name: 'Elisa Barbosa', email: 'elisa@email.com', phone: '75-99012-5678', cpf: '23456789013' },
  ];

  const result = [];
  let count = 0;

  for (const customer of customers) {
    const existResult = await pool.query(
      `SELECT id FROM customers WHERE email = $1 AND agency_id = $2`,
      [customer.email, agencyId]
    );

    let customerId;
    if (existResult.rows.length > 0) {
      customerId = existResult.rows[0].id;
    } else {
      customerId = generateId();
      try {
        await pool.query(
          `INSERT INTO customers (id, agency_id, name, email, phone, cpf, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', NOW(), NOW())
           ON CONFLICT DO NOTHING`,
          [customerId, agencyId, customer.name, customer.email, customer.phone, customer.cpf]
        );
        count++;
      } catch {
        // Skip if duplicate
      }
    }

    result.push({ id: customerId, name: customer.name });
  }

  console.log(`   ✓ Created/found ${customers.length} customers (${count} new)`);
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
    { destination: 'Gramado', description: 'Montanhas e chocolates - inverno' },
    { destination: 'Punta Cana', description: 'Resort tudo incluído - casal com filhos' },
  ];

  let count = 0;
  for (let i = 0; i < wishes.length; i++) {
    const customer = customers[i % customers.length];
    const wish = wishes[i];

    const existResult = await pool.query(
      `SELECT 1 FROM wishes WHERE customer_id = $1 AND destination = $2`,
      [customer.id, wish.destination]
    );

    if (existResult.rows.length === 0) {
      await pool.query(
        `INSERT INTO wishes (id, customer_id, destination, description, status, priority, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'ACTIVE', 'MEDIUM', NOW(), NOW())`,
        [generateId(), customer.id, wish.destination, wish.description]
      );
      count++;
    }
  }

  console.log(`   ✓ Created ${count} wishes`);
}

async function seedOffers(agencyId) {
  const offers = [
    {
      title: 'Cancún All-Inclusive 7 Noites',
      destination: 'Cancún',
      description: 'Hotel 5 estrelas, refeições ilimitadas, bebidas, atividades',
      price: 4500,
      hotel_name: 'Grand Palladium Cancún',
    },
    {
      title: 'Paris Romântica 5 Dias',
      destination: 'Paris',
      description: 'Lua de mel em Paris com passeios ao Louvre e Torre Eiffel',
      price: 8900,
      hotel_name: 'Hotel Le Marais Paris',
    },
    {
      title: 'Orlando Magic: Parques 5 Dias',
      destination: 'Orlando',
      description: 'Ingressos ilimitados Disney, Universal e SeaWorld',
      price: 6200,
      hotel_name: 'Disney All Star Movies Resort',
    },
    {
      title: 'Maceió Praia 4 Noites',
      destination: 'Maceió',
      description: 'Resort frente-mar com tudo incluído em Maceió',
      price: 2800,
      hotel_name: 'Praia Bonita Resort',
    },
    {
      title: 'Buenos Aires Tango 4 Noites',
      destination: 'Buenos Aires',
      description: 'Cidade com show de tango, gastronomia, shopping',
      price: 3200,
      hotel_name: 'Fierro Hotel Buenos Aires',
    },
    {
      title: 'Gramado Inverno Romântico',
      destination: 'Gramado',
      description: 'Escapada romântica com chocolates e montanhas',
      price: 1500,
      hotel_name: 'Pousada Monte Verde Gramado',
    },
    {
      title: 'Punta Cana Resort Tudo Incluído',
      destination: 'Punta Cana',
      description: 'Resort all-inclusive República Dominicana - melhor preço/benefício',
      price: 3950,
      hotel_name: 'Barceló Bávaro Grand Resort',
    },
    {
      title: 'Portugal: Lisboa + Madeira 8 Dias',
      destination: 'Portugal',
      description: 'Conhecer Portugal: capital e ilha paradisíaca',
      price: 5800,
      hotel_name: 'Memmo Alfama Hotel + Porto Moniz Madeira',
    },
  ];

  const result = [];
  let count = 0;

  for (const offer of offers) {
    const existResult = await pool.query(
      `SELECT id FROM offers WHERE title = $1 AND agency_id = $2`,
      [offer.title, agencyId]
    );

    let offerId;
    if (existResult.rows.length > 0) {
      offerId = existResult.rows[0].id;
    } else {
      offerId = generateId();
      await pool.query(
        `INSERT INTO offers (id, agency_id, title, destination, description, base_price, currency, hotel_name, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'BRL', $7, 'ACTIVE', NOW(), NOW())`,
        [offerId, agencyId, offer.title, offer.destination, offer.description, offer.price, offer.hotel_name]
      );
      count++;
    }

    result.push({ id: offerId, title: offer.title, price: offer.price });
  }

  console.log(`   ✓ Created ${count} offers`);
  return result;
}

async function seedProposals(agencyId, customers, offers) {
  const statuses = ['DRAFT', 'SENT', 'VIEWED', 'ACCEPTED'];
  let count = 0;

  for (let i = 0; i < 10; i++) {
    const customer = customers[i % customers.length];
    const offer = offers[i % offers.length];
    const status = statuses[i % statuses.length];

    const existResult = await pool.query(
      `SELECT 1 FROM proposals WHERE customer_id = $1 AND offer_id = $2`,
      [customer.id, offer.id]
    );

    if (existResult.rows.length === 0) {
      const totalPassengers = 2 + (i % 3);
      const unitPrice = offer.price;
      const totalPrice = unitPrice * totalPassengers;

      await pool.query(
        `INSERT INTO proposals (id, customer_id, offer_id, status, total_passengers, unit_price, total_price, currency, valid_until, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'BRL', NOW() + INTERVAL '30 days', NOW(), NOW())`,
        [generateId(), customer.id, offer.id, status, totalPassengers, unitPrice, totalPrice]
      );
      count++;
    }
  }

  console.log(`   ✓ Created ${count} proposals`);
}

async function seedBookings(agencyId, customers, offers) {
  let count = 0;

  for (let i = 0; i < 8; i++) {
    const customer = customers[i % customers.length];
    const offer = offers[i % offers.length];

    const existResult = await pool.query(
      `SELECT 1 FROM bookings WHERE customer_id = $1 AND offer_id = $2`,
      [customer.id, offer.id]
    );

    if (existResult.rows.length === 0) {
      const departureDate = new Date(Date.now() + Math.random() * 180 * 24 * 60 * 60 * 1000);
      const returnDate = new Date(departureDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      const statuses = ['CONFIRMED', 'CONFIRMED', 'PENDING'];
      const status = statuses[i % statuses.length];

      await pool.query(
        `INSERT INTO bookings (id, customer_id, offer_id, booking_date, departure_date, return_date, status, total_passengers, amount, currency, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), $4, $5, $6, 2, $7, 'BRL', NOW(), NOW())`,
        [generateId(), customer.id, offer.id, departureDate, returnDate, status, offer.price * 2]
      );
      count++;
    }
  }

  console.log(`   ✓ Created ${count} bookings`);
}

async function seedSales(agencyId, customers) {
  let count = 0;

  for (let i = 0; i < 8; i++) {
    const customer = customers[i % customers.length];
    const saleDate = new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000);
    const totalPrice = 5000 + Math.random() * 15000;

    const existResult = await pool.query(
      `SELECT 1 FROM sales WHERE customer_id = $1 AND DATE(sale_date) = DATE($2)`,
      [customer.id, saleDate]
    );

    if (existResult.rows.length === 0) {
      await pool.query(
        `INSERT INTO sales (id, customer_id, status, sale_date, amount, currency, payment_status, created_at, updated_at)
         VALUES ($1, $2, 'CONFIRMED', $3, $4, 'BRL', 'PARTIAL', NOW(), NOW())`,
        [generateId(), customer.id, saleDate, totalPrice]
      );
      count++;
    }
  }

  console.log(`   ✓ Created ${count} sales`);
}

async function seedTrips() {
  const statuses = ['PLANNING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'];
  let count = 0;

  // Get sales to link trips to
  const salesResult = await pool.query(
    `SELECT id FROM sales LIMIT 6`
  );

  for (let i = 0; i < salesResult.rows.length; i++) {
    const sale = salesResult.rows[i];
    const status = statuses[i % statuses.length];
    const startDate = new Date(Date.now() + Math.random() * 180 * 24 * 60 * 60 * 1000);
    const endDate = new Date(startDate.getTime() + (5 + Math.random() * 9) * 24 * 60 * 60 * 1000);

    const existResult = await pool.query(
      `SELECT 1 FROM trips WHERE sale_id = $1`,
      [sale.id]
    );

    if (existResult.rows.length === 0) {
      await pool.query(
        `INSERT INTO trips (id, sale_id, destination, status, start_date, end_date, created_at, updated_at)
         VALUES ($1, $2, 'Destino Viagem', $3, $4, $5, NOW(), NOW())`,
        [generateId(), sale.id, status, startDate, endDate]
      );
      count++;
    }
  }

  console.log(`   ✓ Created ${count} trips`);
}

async function verifyData(agencyId) {
  const queries = [
    ['Customers', `SELECT COUNT(*) as count FROM customers WHERE agency_id = $1`],
    ['Wishes', `SELECT COUNT(*) as count FROM wishes WHERE customer_id IN (SELECT id FROM customers WHERE agency_id = $1)`],
    ['Offers', `SELECT COUNT(*) as count FROM offers WHERE agency_id = $1`],
    ['Proposals', `SELECT COUNT(*) as count FROM proposals WHERE customer_id IN (SELECT id FROM customers WHERE agency_id = $1)`],
    ['Bookings', `SELECT COUNT(*) as count FROM bookings`],
    ['Sales', `SELECT COUNT(*) as count FROM sales WHERE customer_id IN (SELECT id FROM customers WHERE agency_id = $1)`],
    ['Trips', `SELECT COUNT(*) as count FROM trips`],
    ['Users', `SELECT COUNT(*) as count FROM users WHERE agency_id = $1`],
  ];

  for (const [label, sql] of queries) {
    const result = await pool.query(sql, [agencyId]);
    console.log(`   ✓ ${label}: ${result.rows[0].count}`);
  }
}

seedDemo();
