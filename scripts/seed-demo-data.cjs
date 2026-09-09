#!/usr/bin/env node
// Demo data seed script for local development.
//
// NOTE (discrepancy flagged per task instructions): the customer-app task
// brief said to "extend the existing scripts/seed-demo-data.cjs". No such
// file existed anywhere in this repository/branch at the time this task
// was done (verified: grep across the tree, no references in any
// package.json script). This file is therefore newly created, not
// extended, following the brief's intent as closely as possible. It uses
// the same fixed demo agency/user ids already hardcoded in
// services/api/src/dev-auth.ts so the seeded rows line up with the dev
// auth principals used for local manual testing.
//
// Usage: DATABASE_URL=postgres://... node scripts/seed-demo-data.cjs
// Requires a role that can bypass/see through RLS (e.g. the migration
// admin role), since it inserts across the two demo agencies directly.

const { Pool } = require('pg');
const { seedBusinessStories } = require('./demo-business-stories.cjs');

const agencyAId = '10000000-0000-4000-8000-000000000001';
const agencyBId = '20000000-0000-4000-8000-000000000001';
const userAId = '11000000-0000-4000-8000-000000000001';
const userBId = '21000000-0000-4000-8000-000000000001';

// Must match services/api/src/dev-auth.ts authorizedDevCustomerPrincipals.
const customerDemoAId = '31000000-0000-4000-8000-000000000001';
const customerDemoBId = '41000000-0000-4000-8000-000000000001';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await seedAgencyAndDemoCustomer(pool, {
      agencyId: agencyAId,
      agencySlug: 'agency-a-demo',
      agencyName: 'Agency A (Demo)',
      userId: userAId,
      userEmail: 'user-a@example.test',
      customerId: customerDemoAId,
    });
    await seedAgencyAndDemoCustomer(pool, {
      agencyId: agencyBId,
      agencySlug: 'agency-b-demo',
      agencyName: 'Agency B (Demo)',
      userId: userBId,
      userEmail: 'user-b@example.test',
      customerId: customerDemoBId,
    });

    const stagesA = await seedDefaultPipelines(pool, agencyAId);
    await seedDefaultPipelines(pool, agencyBId);
    await seedCommercialCockpitScenarios(pool, { agencyId: agencyAId, userId: userAId, stages: stagesA });
    await seedBusinessStories(pool, { agencyId: agencyAId, userId: userAId });

    console.log('Demo data seeded for Agency A and Agency B, including Cliente Demo customer portal fixtures.');
  } finally {
    await pool.end();
  }
}

async function seedAgencyAndDemoCustomer(pool, opts) {
  const { agencyId, agencySlug, agencyName, userId, userEmail, customerId } = opts;

  await pool.query(
    `INSERT INTO agencies (id, name, slug, email, plan, status)
     VALUES ($1, $2, $3, $4, 'FREE', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING`,
    [agencyId, agencyName, agencySlug, `${agencySlug}@example.test`],
  );

  await pool.query(
    `INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
     VALUES ($1, $2, $3, 'Demo Admin', 'ADMIN', 'demo-only-hash', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING`,
    [userId, agencyId, userEmail],
  );

  // Cliente Demo -- the customer-portal end-customer demo identity.
  await pool.query(
    `INSERT INTO customers (id, agency_id, name, email, phone, cpf, status)
     VALUES ($1, $2, 'Cliente Demo', $3, '11999990000', '12345678900', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING`,
    [customerId, agencyId, `cliente-demo-${agencySlug}@example.test`],
  );

  // 1 Wish
  await pool.query(
    `INSERT INTO wishes (agency_id, customer_id, destination, start_date, end_date, travelers_count)
     VALUES ($1, $2, 'Fernando de Noronha', '2027-01-10', '2027-01-20', 2)
     ON CONFLICT DO NOTHING`,
    [agencyId, customerId],
  );

  // 1 future Trip
  await pool.query(
    `INSERT INTO trips (agency_id, customer_id, name, destination, start_date, end_date, status)
     VALUES ($1, $2, 'Viagem para a Bahia', 'Salvador', '2027-02-01', '2027-02-10', 'PLANNED')
     ON CONFLICT DO NOTHING`,
    [agencyId, customerId],
  );

  // 1 past Trip
  await pool.query(
    `INSERT INTO trips (agency_id, customer_id, name, destination, start_date, end_date, status)
     VALUES ($1, $2, 'Viagem para o Rio', 'Rio de Janeiro', '2025-01-01', '2025-01-10', 'COMPLETED')
     ON CONFLICT DO NOTHING`,
    [agencyId, customerId],
  );

  // Offers visible to it (agency-wide, no per-customer targeting exists
  // in the schema -- see ADR discussion in customer-portal.ts).
  await pool.query(
    `INSERT INTO offers (agency_id, name, description, price, status)
     VALUES ($1, 'Pacote Praia', 'Pacote promocional de verao', 1999.90, 'ACTIVE')
     ON CONFLICT DO NOTHING`,
    [agencyId],
  );

  // 1 Proposal
  await pool.query(
    `INSERT INTO proposals (agency_id, customer_id, proposed_price, discount, total, status, conditions)
     VALUES ($1, $2, 2500, 200, 2300, 'SENT', 'Pagamento em ate 3x sem juros')
     ON CONFLICT DO NOTHING`,
    [agencyId, customerId],
  );

  // Transport fixtures for the bookings below.
  const route = await pool.query(
    `INSERT INTO routes (agency_id, origin, destination) VALUES ($1, 'Sao Paulo', 'Rio de Janeiro') RETURNING id`,
    [agencyId],
  );
  const routeId = route.rows[0].id;

  const returnRoute = await pool.query(
    `INSERT INTO routes (agency_id, origin, destination) VALUES ($1, 'Rio de Janeiro', 'Sao Paulo') RETURNING id`,
    [agencyId],
  );
  const returnRouteId = returnRoute.rows[0].id;

  const oneWayProduct = await pool.query(
    `INSERT INTO transport_products (agency_id, name, trip_type, outbound_route_id, price)
     VALUES ($1, 'Onibus SP -> RJ', 'ONE_WAY', $2, 150) RETURNING id`,
    [agencyId, routeId],
  );
  const roundTripProduct = await pool.query(
    `INSERT INTO transport_products (agency_id, name, trip_type, outbound_route_id, return_route_id, price)
     VALUES ($1, 'Onibus SP <-> RJ', 'ROUND_TRIP', $2, $3, 280) RETURNING id`,
    [agencyId, routeId, returnRouteId],
  );

  const outboundDeparture = await pool.query(
    `INSERT INTO scheduled_departures (agency_id, product_id, departure_at, capacity, service_type)
     VALUES ($1, $2, '2027-03-01T08:00:00Z', 40, 'OWN') RETURNING id`,
    [agencyId, oneWayProduct.rows[0].id],
  );

  const roundTripOutbound = await pool.query(
    `INSERT INTO scheduled_departures (agency_id, product_id, departure_at, capacity, service_type)
     VALUES ($1, $2, '2027-04-01T08:00:00Z', 40, 'OWN') RETURNING id`,
    [agencyId, roundTripProduct.rows[0].id],
  );
  const roundTripReturn = await pool.query(
    `INSERT INTO scheduled_departures (agency_id, product_id, departure_at, capacity, service_type)
     VALUES ($1, $2, '2027-04-10T08:00:00Z', 40, 'OWN') RETURNING id`,
    [agencyId, roundTripProduct.rows[0].id],
  );

  // 1 one-way Booking
  const oneWayBooking = await pool.query(
    `INSERT INTO bookings (agency_id, booker_customer_id, trip_type, outbound_departure_id, notes)
     VALUES ($1, $2, 'ONE_WAY', $3, 'Reserva demo one-way') RETURNING id`,
    [agencyId, customerId, outboundDeparture.rows[0].id],
  );
  await pool.query(
    `INSERT INTO booking_passengers (agency_id, booking_id, name)
     VALUES ($1, $2, 'Cliente Demo')`,
    [agencyId, oneWayBooking.rows[0].id],
  );

  // 1 round-trip Booking
  const roundTripBooking = await pool.query(
    `INSERT INTO bookings (agency_id, booker_customer_id, trip_type, outbound_departure_id, return_departure_id, notes)
     VALUES ($1, $2, 'ROUND_TRIP', $3, $4, 'Reserva demo round-trip') RETURNING id`,
    [agencyId, customerId, roundTripOutbound.rows[0].id, roundTripReturn.rows[0].id],
  );
  await pool.query(
    `INSERT INTO booking_passengers (agency_id, booking_id, name)
     VALUES ($1, $2, 'Cliente Demo')`,
    [agencyId, roundTripBooking.rows[0].id],
  );
}

// ============================================================
// CONFIGURABLE MULTI-PIPELINE DEMO DATA
// (migration 009_configurable_pipelines.sql)
// Creates the default "Comercial" pipeline (9 stages, mirroring the old
// CommercialStage enum exactly, same as the migration's own per-agency
// backfill DML) plus 3 extra pipelines for visual variety in the demo:
// "Pos-venda", "Terrestre", "Internacional". All pipelines are left
// unrestricted (zero PipelineAccess rows) -- this repo's demo seed only
// ever creates one staff user per agency, so there is no second demo
// user available to exercise a real restricted-pipeline scenario without
// fabricating one, which the brief explicitly says not to do.
// Returns a { STAGE_NAME: stageId } map for the "Comercial" pipeline so
// seedCommercialCockpitScenarios() below can assign the 4 demo
// opportunities to real stage ids.
// ============================================================
async function seedDefaultPipelines(pool, agencyId) {
  // Migration 008's own backfill DML creates a default "Comercial"
  // pipeline per agency, but only for agencies that already exist at
  // migration-apply time -- on a fresh database (this script's only
  // supported entry point, matching every other reset-then-seed flow in
  // this repo) no agencies exist yet when 008 runs, so it creates zero
  // pipelines. This function is what actually creates "Comercial" (+ its
  // 9 stages) for the agencies this script itself just inserted. Do NOT
  // run this script twice against the same database without resetting
  // the schema first -- like every other seed/test flow in this repo, it
  // assumes a clean slate and will create duplicate pipelines otherwise.
  const comercial = await pool.query(
    `INSERT INTO pipelines (agency_id, name, description) VALUES ($1, 'Comercial', 'Pipeline padrao') RETURNING id`,
    [agencyId],
  );
  const comercialId = comercial.rows[0].id;

  const comercialStageDefs = [
    ['PROSPECTING', 1, 'NEUTRAL', 'NORMAL'],
    ['INTEREST', 2, 'BLUE', 'NORMAL'],
    ['QUOTE', 3, 'BLUE', 'NORMAL'],
    ['PROPOSAL_SENT', 4, 'YELLOW', 'NORMAL'],
    ['WAITING_CUSTOMER', 5, 'YELLOW', 'ATTENTION'],
    ['NEGOTIATION', 6, 'ORANGE', 'ATTENTION'],
    ['WON', 7, 'GREEN', 'SUCCESS'],
    ['POST_SALE', 8, 'PURPLE', 'NORMAL'],
    ['LOST', 9, 'RED', 'ATTENTION'],
  ];
  const stages = {};
  for (const [name, sequence, colorKey, visualLevel] of comercialStageDefs) {
    const result = await pool.query(
      `INSERT INTO pipeline_stages (agency_id, pipeline_id, name, sequence, color_key, visual_level)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [agencyId, comercialId, name, sequence, colorKey, visualLevel],
    );
    stages[name] = result.rows[0].id;
  }

  await seedSimplePipeline(pool, agencyId, 'Pós-venda', [
    ['Aguardando contato', 1, 'NEUTRAL', 'NORMAL'],
    ['Contato realizado', 2, 'BLUE', 'NORMAL'],
    ['Feedback', 3, 'YELLOW', 'NORMAL'],
    ['Problema', 4, 'RED', 'ATTENTION'],
    ['Resolvido', 5, 'GREEN', 'SUCCESS'],
  ]);

  await seedSimplePipeline(pool, agencyId, 'Terrestre', [
    ['Novo contato', 1, 'NEUTRAL', 'NORMAL'],
    ['Orçamento terrestre', 2, 'BLUE', 'NORMAL'],
    ['Confirmado', 3, 'GREEN', 'SUCCESS'],
  ]);

  await seedSimplePipeline(pool, agencyId, 'Internacional', [
    ['Novo contato', 1, 'NEUTRAL', 'NORMAL'],
    ['Documentação', 2, 'PURPLE', 'ATTENTION'],
    ['Visto/aprovação', 3, 'ORANGE', 'ATTENTION'],
    ['Confirmado', 4, 'GREEN', 'SUCCESS'],
  ]);

  return stages;
}

async function seedSimplePipeline(pool, agencyId, name, stageDefs) {
  const pipeline = await pool.query(
    `INSERT INTO pipelines (agency_id, name) VALUES ($1, $2) RETURNING id`,
    [agencyId, name],
  );
  const pipelineId = pipeline.rows[0].id;
  for (const [stageName, sequence, colorKey, visualLevel] of stageDefs) {
    await pool.query(
      `INSERT INTO pipeline_stages (agency_id, pipeline_id, name, sequence, color_key, visual_level)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [agencyId, pipelineId, stageName, sequence, colorKey, visualLevel],
    );
  }
  return pipelineId;
}

// ============================================================
// COMMERCIAL COCKPIT DEMO SCENARIOS (Cliente A/B/C/D)
// Additive only -- inserted once for Agency A, distinct from the
// "Cliente Demo" customer-portal fixture above. Exactly the 4 scenarios
// from the brief, each exercising a different part of the cockpit. Each
// opportunity is assigned to the "Comercial" pipeline's matching stage
// (via the `stages` map from seedDefaultPipelines()) instead of the old
// `stage` enum column, per migration 009_configurable_pipelines.sql.
// ============================================================
// Fixed, deterministic ids for the 4 Commercial Cockpit demo customers --
// NOT gen_random_uuid()-generated. A human tester needs a stable URL to
// bookmark/share across re-seeds; a random id changes every time this
// script runs against a freshly reset database, silently breaking any
// previously-handed-out "here's the demo customer" link (this happened
// once already -- see the ARCH note in the security test file). Only
// scoped to Agency A (agencyAId, '...0001') since these 4 scenarios are
// agency-A-only by design.
const cockpitDemoCustomerIds = {
  cancun: 'c0cc0001-0000-4000-8000-00000000000a',
  gramado: 'c0cc0001-0000-4000-8000-00000000000b',
  buzios: 'c0cc0001-0000-4000-8000-00000000000c',
  portoDeGalinhas: 'c0cc0001-0000-4000-8000-00000000000d',
};

async function seedCommercialCockpitScenarios(pool, { agencyId, userId, stages }) {
  const comercialPipelineId = (
    await pool.query(`SELECT pipeline_id FROM pipeline_stages WHERE agency_id = $1 AND id = $2`, [
      agencyId,
      stages.PROSPECTING,
    ])
  ).rows[0].pipeline_id;
  // Cliente A: Wish + Proposal sent + OVERDUE follow-up.
  const clienteA = await pool.query(
    `INSERT INTO customers (id, agency_id, name, email, phone, status)
     VALUES ($1, $2, 'Cliente A (Cockpit Demo - Cancun)', 'cliente-a-cockpit@example.test', '11999991111', 'ACTIVE')
     RETURNING id`,
    [cockpitDemoCustomerIds.cancun, agencyId],
  );
  const clienteAId = clienteA.rows[0].id;

  await pool.query(
    `INSERT INTO wishes (agency_id, customer_id, destination, start_date, end_date, travelers_count)
     VALUES ($1, $2, 'Cancún', '2027-05-01', '2027-05-10', 2)`,
    [agencyId, clienteAId],
  );
  const proposalA = await pool.query(
    `INSERT INTO proposals (agency_id, customer_id, proposed_price, discount, total, status, valid_until)
     VALUES ($1, $2, 4500, 0, 4500, 'SENT', now() + INTERVAL '10 days') RETURNING id`,
    [agencyId, clienteAId],
  );
  const opportunityA = await pool.query(
    `INSERT INTO commercial_opportunities
       (agency_id, customer_id, proposal_id, responsible_user_id, destination, stage, pipeline_id, stage_id, next_action_at, expected_value)
     VALUES ($1, $2, $3, $4, 'Cancún', 'PROPOSAL_SENT', $5, $6, now() - INTERVAL '3 days', 4500)
     RETURNING id`,
    [agencyId, clienteAId, proposalA.rows[0].id, userId, comercialPipelineId, stages.PROPOSAL_SENT],
  );
  await pool.query(
    `INSERT INTO commercial_tasks
       (agency_id, customer_id, opportunity_id, assigned_user_id, type, title, due_at, created_by)
     VALUES ($1, $2, $3, $4, 'FOLLOW_UP', 'Retornar sobre proposta Cancún', now() - INTERVAL '2 days', $4)`,
    [agencyId, clienteAId, opportunityA.rows[0].id, userId],
  );

  // Cliente B: Proposal awaiting response, NO overdue follow-up.
  const clienteB = await pool.query(
    `INSERT INTO customers (id, agency_id, name, email, phone, status)
     VALUES ($1, $2, 'Cliente B (Cockpit Demo - Gramado)', 'cliente-b-cockpit@example.test', '11999992222', 'ACTIVE')
     RETURNING id`,
    [cockpitDemoCustomerIds.gramado, agencyId],
  );
  const clienteBId = clienteB.rows[0].id;
  const proposalB = await pool.query(
    `INSERT INTO proposals (agency_id, customer_id, proposed_price, discount, total, status, valid_until)
     VALUES ($1, $2, 3200, 0, 3200, 'SENT', now() + INTERVAL '15 days') RETURNING id`,
    [agencyId, clienteBId],
  );
  await pool.query(
    `INSERT INTO commercial_opportunities
       (agency_id, customer_id, proposal_id, responsible_user_id, destination, stage, pipeline_id, stage_id, next_action_at, expected_value)
     VALUES ($1, $2, $3, $4, 'Gramado', 'PROPOSAL_SENT', $5, $6, now() + INTERVAL '5 days', 3200)`,
    [agencyId, clienteBId, proposalB.rows[0].id, userId, comercialPipelineId, stages.PROPOSAL_SENT],
  );

  // Cliente C: closed Sale + future Trip.
  const clienteC = await pool.query(
    `INSERT INTO customers (id, agency_id, name, email, phone, status)
     VALUES ($1, $2, 'Cliente C (Cockpit Demo - Buzios)', 'cliente-c-cockpit@example.test', '11999993333', 'ACTIVE')
     RETURNING id`,
    [cockpitDemoCustomerIds.buzios, agencyId],
  );
  const clienteCId = clienteC.rows[0].id;
  const saleC = await pool.query(
    `INSERT INTO sales (agency_id, customer_id, user_id, amount, discount, total, status)
     VALUES ($1, $2, $3, 6000, 0, 6000, 'CONFIRMED') RETURNING id`,
    [agencyId, clienteCId, userId],
  );
  await pool.query(
    `INSERT INTO receivables (agency_id, sale_id, customer_id, description, amount, due_at)
     VALUES ($1, $2, $3, 'Venda demo Buzios', 6000, '2020-01-01T00:00:00Z')`,
    [agencyId, saleC.rows[0].id, clienteCId],
  );
  await pool.query(
    `INSERT INTO trips (agency_id, customer_id, sale_id, name, destination, start_date, end_date, status)
     VALUES ($1, $2, $3, 'Viagem confirmada', 'Buzios', '2027-06-01', '2027-06-08', 'CONFIRMED')`,
    [agencyId, clienteCId, saleC.rows[0].id],
  );
  await pool.query(
    `INSERT INTO commercial_opportunities
       (agency_id, customer_id, sale_id, responsible_user_id, destination, stage, pipeline_id, stage_id, expected_value)
     VALUES ($1, $2, $3, $4, 'Buzios', 'WON', $5, $6, 6000)`,
    [agencyId, clienteCId, saleC.rows[0].id, userId, comercialPipelineId, stages.WON],
  );

  // Cliente D: COMPLETED trip + pending post-sale task suggestion --
  // deliberately no POST_SALE CommercialTask row, so
  // listPostSaleCandidates() surfaces this customer for manual follow-up.
  const clienteD = await pool.query(
    `INSERT INTO customers (id, agency_id, name, email, phone, status)
     VALUES ($1, $2, 'Cliente D (Cockpit Demo - Porto de Galinhas)', 'cliente-d-cockpit@example.test', '11999994444', 'ACTIVE')
     RETURNING id`,
    [cockpitDemoCustomerIds.portoDeGalinhas, agencyId],
  );
  const clienteDId = clienteD.rows[0].id;
  await pool.query(
    `INSERT INTO trips (agency_id, customer_id, name, destination, start_date, end_date, status)
     VALUES ($1, $2, 'Viagem concluída', 'Porto de Galinhas', '2025-11-01', '2025-11-08', 'COMPLETED')`,
    [agencyId, clienteDId],
  );

  const cancelledDeparture = await seedDemoDeparture(pool, agencyId, {
    origin: 'Sao Paulo',
    destination: 'Curitiba',
    productName: 'Onibus SP -> Curitiba',
    departureAt: '2027-07-01T08:00:00Z',
  });
  const cancelledBooking = await pool.query(
    `INSERT INTO bookings
       (agency_id, booker_customer_id, trip_type, outbound_departure_id, cancelled, cancelled_at, cancelled_by_user_id, cancellation_reason, notes)
     VALUES ($1, $2, 'ONE_WAY', $3, true, now(), $4, 'Solicitacao do cliente', 'Reserva demo cancelada')
     RETURNING id`,
    [agencyId, clienteDId, cancelledDeparture, userId],
  );
  await pool.query(
    `INSERT INTO booking_passengers (agency_id, booking_id, name)
     VALUES ($1, $2, 'Cliente D Demo')`,
    [agencyId, cancelledBooking.rows[0].id],
  );

  await pool.query(
    `INSERT INTO external_offer_captures
       (agency_id, source_url, source_name, raw_content, normalized_title, normalized_description, found_price, currency, valid_until, status)
     VALUES
       ($1, 'https://supplier.example/demo-cancun', 'Supplier Demo', 'Pacote Cancun com hotel', 'Pacote Cancun Demo', 'Hotel e transfer', 4200, 'BRL', now() + INTERVAL '20 days', 'UNDER_REVIEW'),
       ($1, 'https://supplier.example/demo-lisboa', 'Supplier Demo', 'Pacote Lisboa com aereo', 'Pacote Lisboa Demo', 'Aereo e hotel', 7200, 'BRL', now() + INTERVAL '30 days', 'APPROVED')`,
    [agencyId],
  );
}

async function seedDemoDeparture(pool, agencyId, opts) {
  const route = await pool.query(
    `INSERT INTO routes (agency_id, origin, destination)
     VALUES ($1, $2, $3) RETURNING id`,
    [agencyId, opts.origin, opts.destination],
  );
  const product = await pool.query(
    `INSERT INTO transport_products (agency_id, name, trip_type, outbound_route_id, price)
     VALUES ($1, $2, 'ONE_WAY', $3, 180) RETURNING id`,
    [agencyId, opts.productName, route.rows[0].id],
  );
  const departure = await pool.query(
    `INSERT INTO scheduled_departures (agency_id, product_id, departure_at, capacity, service_type)
     VALUES ($1, $2, $3, 40, 'OWN') RETURNING id`,
    [agencyId, product.rows[0].id, opts.departureAt],
  );
  return departure.rows[0].id;
}

main().catch((error) => {
  console.error('Seeding failed:', error);
  process.exitCode = 1;
});
