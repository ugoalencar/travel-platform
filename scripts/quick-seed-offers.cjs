#!/usr/bin/env node
/**
 * Quick Seed: Offers and Commerce
 * Creates offers, proposals, bookings, and sales for demo agencies
 */

const { Pool } = require('pg');
const crypto = require('crypto');

const databaseUrl = process.env.DATABASE_URL ||
  'postgresql://travel_test:travel_test_password@127.0.0.1:55432/travel_platform_test';

const pool = new Pool({ connectionString: databaseUrl });

function generateId() {
  return crypto.randomUUID();
}

async function quickSeed() {
  console.log('\n✨ Quick Seed: Commerce Data\n');

  try {
    // Get customers (which already have agency_id)
    const customersResult = await pool.query('SELECT id, agency_id FROM customers ORDER BY created_at LIMIT 15');
    const customers = customersResult.rows;

    if (customers.length === 0) throw new Error('No customers found');

    // Use first customer's agency
    const agencyId = customers[0].agency_id;

    if (customers.length === 0) throw new Error('No customers found');

    console.log(`📍 Agency: ${agencyId}`);
    console.log(`👥 Customers: ${customers.length}\n`);

    // Create offers
    console.log('1. Creating offers...');
    const offers = [
      { name: 'Cancún All-Inclusive 7N', description: 'Resort 5 estrelas com tudo incluído', price: 4500 },
      { name: 'Paris Romântica 5D', description: 'Lua de mel em Paris com passeios', price: 8900 },
      { name: 'Orlando Magic 5D', description: 'Parques temáticos - Disney, Universal', price: 6200 },
      { name: 'Maceió Praia 4N', description: 'Praia nordestina com águas calmas', price: 2800 },
      { name: 'Buenos Aires 4N', description: 'Tango, gastronomia e compras', price: 3200 },
      { name: 'Gramado Romântico', description: 'Montanhas, chocolates e inverno', price: 1500 },
      { name: 'Punta Cana Resort', description: 'Resort all-inclusive República Dominicana', price: 3950 },
      { name: 'Portugal 8D', description: 'Lisboa e Madeira - destino europeu', price: 5800 },
    ];

    const offerIds = [];
    for (const offer of offers) {
      const id = generateId();
      const validFrom = new Date();
      const validUntil = new Date(validFrom.getTime() + 90 * 24 * 60 * 60 * 1000);

      await pool.query(
        `INSERT INTO offers (id, agency_id, name, description, price, valid_from, valid_until, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        [id, agencyId, offer.name, offer.description, offer.price, validFrom, validUntil]
      );
      offerIds.push(id);
      console.log(`   ✓ ${offer.name}`);
    }

    // Create proposals
    console.log('\n2. Creating proposals...');
    const statuses = ['DRAFT', 'SENT'];
    let proposalCount = 0;

    for (let i = 0; i < 10; i++) {
      const customer = customers[i % customers.length];
      const offerPrice = offers[i % offers.length].price;
      const status = statuses[i % statuses.length];
      const discount = Math.random() * 0.2; // 0-20% discount
      const proposedPrice = offerPrice * (1 - discount);
      const total = Math.round(proposedPrice * 100) / 100;

      const checkResult = await pool.query(
        `SELECT 1 FROM proposals WHERE customer_id = $1 AND offer_id = $2 LIMIT 1`,
        [customer.id, offerIds[i % offerIds.length]]
      );

      if (checkResult.rows.length === 0) {
        await pool.query(
          `INSERT INTO proposals (id, agency_id, customer_id, offer_id, proposed_price, discount, total, status, valid_until, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() + INTERVAL '30 days', NOW(), NOW())`,
          [generateId(), agencyId, customer.id, offerIds[i % offerIds.length], proposedPrice, discount, total, status]
        );
        proposalCount++;
      }
    }
    console.log(`   ✓ ${proposalCount} proposals created`);

    // Get a user for sales
    const userResult = await pool.query(
      `SELECT id FROM users WHERE agency_id = $1 LIMIT 1`,
      [agencyId]
    );
    const userId = userResult.rows[0]?.id || generateId();

    // Create sales
    console.log('\n3. Creating sales...');
    let salesCount = 0;

    for (let i = 0; i < 8; i++) {
      const customer = customers[i % customers.length];
      const offerPrice = offers[i % offers.length].price;
      const discount = Math.random() * 0.15; // 0-15% discount
      const amount = offerPrice * (1 - discount);
      const total = Math.round(amount * 100) / 100;
      const statuses = ['PENDING', 'CONFIRMED'];
      const status = statuses[i % statuses.length];

      // Link to proposal if one exists
      let proposalResult = null;
      try {
        proposalResult = await pool.query(
          `SELECT id FROM proposals WHERE customer_id = $1 LIMIT 1`,
          [customer.id]
        );
      } catch {
        // Ignore if proposals don't exist
      }

      const proposalId = proposalResult?.rows[0]?.id || null;

      const checkResult = await pool.query(
        `SELECT 1 FROM sales WHERE customer_id = $1 LIMIT 1`,
        [customer.id]
      );

      if (checkResult.rows.length === 0) {
        await pool.query(
          `INSERT INTO sales (id, agency_id, customer_id, proposal_id, user_id, amount, discount, total, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
          [generateId(), agencyId, customer.id, proposalId, userId, amount, discount, total, status]
        );
        salesCount++;
      }
    }
    console.log(`   ✓ ${salesCount} sales created`);

    // Verify
    console.log('\n4. Verification:');
    const counts = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM offers WHERE agency_id = $1', [agencyId]),
      pool.query('SELECT COUNT(*) as count FROM proposals WHERE agency_id = $1', [agencyId]),
      pool.query('SELECT COUNT(*) as count FROM sales WHERE agency_id = $1', [agencyId]),
    ]);

    console.log(`   ✓ Offers: ${counts[0].rows[0].count}`);
    console.log(`   ✓ Proposals: ${counts[1].rows[0].count}`);
    console.log(`   ✓ Sales: ${counts[2].rows[0].count}`);

    console.log('\n✅ Quick seed complete!\n');
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

quickSeed();
