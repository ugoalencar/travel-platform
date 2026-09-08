const STORY_IDS = {
  marianaCancun: {
    customer: 'd0d50001-0000-4000-8000-000000000001',
    dependent: 'd0d50001-0000-4000-8000-000000000002',
    address: 'd0d50001-0000-4000-8000-000000000003',
    document: 'd0d50001-0000-4000-8000-000000000004',
    wish: 'd0d50001-0000-4000-8000-000000000005',
    capture: 'd0d50001-0000-4000-8000-000000000006',
    offer: 'd0d50001-0000-4000-8000-000000000007',
    proposal: 'd0d50001-0000-4000-8000-000000000008',
    sale: 'd0d50001-0000-4000-8000-000000000009',
    receivable: 'd0d50001-0000-4000-8000-000000000010',
    payment: 'd0d50001-0000-4000-8000-000000000011',
    allocation: 'd0d50001-0000-4000-8000-000000000012',
    trip: 'd0d50001-0000-4000-8000-000000000013',
    revenueEntrada: 'd0d50001-0000-4000-8000-000000000014',
    revenueParcela2: 'd0d50001-0000-4000-8000-000000000015',
    revenueParcela3: 'd0d50001-0000-4000-8000-000000000016',
    payableHotel: 'd0d50001-0000-4000-8000-000000000017',
    payableAereo: 'd0d50001-0000-4000-8000-000000000018',
    payableTransfer: 'd0d50001-0000-4000-8000-000000000019',
    payableSeguro: 'd0d50001-0000-4000-8000-000000000020',
    payableComissao: 'd0d50001-0000-4000-8000-000000000021',
  },
  disney: {
    proposal: 'd0d50002-0000-4000-8000-000000000001',
    sale: 'd0d50002-0000-4000-8000-000000000002',
    trip: 'd0d50002-0000-4000-8000-000000000003',
  },
  honeymoon: {
    proposal: 'd0d50003-0000-4000-8000-000000000001',
    sale: 'd0d50003-0000-4000-8000-000000000002',
    trip: 'd0d50003-0000-4000-8000-000000000003',
  },
  domestic: {
    proposal: 'd0d50004-0000-4000-8000-000000000001',
    sale: 'd0d50004-0000-4000-8000-000000000002',
    trip: 'd0d50004-0000-4000-8000-000000000003',
  },
  europe: {
    proposal: 'd0d50005-0000-4000-8000-000000000001',
    sale: 'd0d50005-0000-4000-8000-000000000002',
    trip: 'd0d50005-0000-4000-8000-000000000003',
  },
};

async function seedBusinessStories(pool, { agencyId, userId }) {
  await seedMarianaCancun(pool, { agencyId, userId });
  await seedSupportingStory(pool, { agencyId, userId, key: 'disney', customerName: 'Fernando Costa Gomes', destination: 'Orlando / Disney', total: 24800 });
  await seedSupportingStory(pool, { agencyId, userId, key: 'honeymoon', customerName: 'Roberto Fernandes', destination: 'Paris', total: 17800 });
  await seedSupportingStory(pool, { agencyId, userId, key: 'domestic', customerName: 'Carla Mendes', destination: 'Gramado', total: 7200 });
  await seedSupportingStory(pool, { agencyId, userId, key: 'europe', customerName: 'Juliana Santos Ribeiro', destination: 'Portugal', total: 28600 });
}

async function seedMarianaCancun(pool, { agencyId, userId }) {
  const ids = STORY_IDS.marianaCancun;
  const customerId = await getOrCreateMarianaCustomer(pool, { agencyId });

  await pool.query(
    `UPDATE customer_addresses
        SET is_primary = false, updated_at = now()
      WHERE agency_id = $1 AND customer_id = $2 AND id <> $3 AND is_primary = true`,
    [agencyId, customerId, ids.address],
  );

  await pool.query(
    `INSERT INTO customer_addresses
       (id, agency_id, customer_id, street, number, district, city, state, cep, country, type, is_primary, created_at, updated_at)
     VALUES ($1, $2, $3, 'Rua das Palmeiras', '100', 'Centro', 'Joinville', 'SC', '89200000', 'Brasil', 'RESIDENTIAL', true, now(), now())
     ON CONFLICT (agency_id, id) DO UPDATE SET
       customer_id = EXCLUDED.customer_id,
       street = EXCLUDED.street,
       number = EXCLUDED.number,
       district = EXCLUDED.district,
       city = EXCLUDED.city,
       state = EXCLUDED.state,
       cep = EXCLUDED.cep,
       country = EXCLUDED.country,
       type = EXCLUDED.type,
       is_primary = EXCLUDED.is_primary,
       updated_at = now()`,
    [ids.address, agencyId, customerId],
  );

  await pool.query(
    `INSERT INTO customer_dependents (id, agency_id, customer_id, name, relationship_type, birth_date, created_at, updated_at)
     VALUES ($1, $2, $3, 'Lucas Alves Silva', 'CHILD', '2015-05-10', now(), now())
     ON CONFLICT (agency_id, id) DO UPDATE SET
       customer_id = EXCLUDED.customer_id,
       name = EXCLUDED.name,
       relationship_type = EXCLUDED.relationship_type,
       birth_date = EXCLUDED.birth_date,
       updated_at = now()`,
    [ids.dependent, agencyId, customerId],
  );

  await pool.query(
    `INSERT INTO customer_documents
       (id, agency_id, customer_id, document_type, document_number, holder_name, issuing_country, issued_date, expiry_date, verification_status, created_at, updated_at)
     VALUES ($1, $2, $3, 'PASSAPORTE', 'DEMO-CANCUN-001', 'Mariana Alves Silva', 'BR', '2024-01-01', '2034-01-01', 'VERIFIED', now(), now())
     ON CONFLICT (agency_id, id) DO UPDATE SET
       customer_id = EXCLUDED.customer_id,
       document_type = EXCLUDED.document_type,
       document_number = EXCLUDED.document_number,
       holder_name = EXCLUDED.holder_name,
       issuing_country = EXCLUDED.issuing_country,
       issued_date = EXCLUDED.issued_date,
       expiry_date = EXCLUDED.expiry_date,
       verification_status = EXCLUDED.verification_status,
       updated_at = now()`,
    [ids.document, agencyId, customerId],
  );

  await pool.query(
    `UPDATE customers
        SET marital_status = 'CASADO',
            profession = 'Analista de Marketing',
            id_issuing_authority = 'SSP/SC',
            id_issued_date = '2018-03-12',
            emergency_contact_name = 'João Alves Silva',
            emergency_contact_relationship = 'Cônjuge',
            emergency_contact_phone = '11976543210',
            emergency_contact_whatsapp = '11976543210',
            emergency_contact_email = 'joao.alves@email.com',
            emergency_contact_notes = 'Contato principal em caso de emergência durante a viagem.',
            updated_at = now()
      WHERE agency_id = $1 AND id = $2`,
    [agencyId, customerId],
  );

  const requirementPassportId = 'd0d50001-0000-4000-8000-000000000022';
  const requirementInsuranceId = 'd0d50001-0000-4000-8000-000000000023';

  await pool.query(
    `INSERT INTO travel_requirements
       (id, agency_id, customer_id, traveler_type, destination, type, required, fulfilled, document_id, expiration_date, created_at, updated_at)
     VALUES ($1, $2, $3, 'CUSTOMER', 'Cancun', 'PASSAPORTE_VALIDO', true, true, $4, '2034-01-01', now(), now())
     ON CONFLICT (agency_id, id) DO UPDATE SET
       destination = EXCLUDED.destination,
       type = EXCLUDED.type,
       required = EXCLUDED.required,
       fulfilled = EXCLUDED.fulfilled,
       document_id = EXCLUDED.document_id,
       expiration_date = EXCLUDED.expiration_date,
       updated_at = now()`,
    [requirementPassportId, agencyId, customerId, ids.document],
  );

  await pool.query(
    `INSERT INTO travel_requirements
       (id, agency_id, customer_id, traveler_type, destination, type, required, fulfilled, notes, created_at, updated_at)
     VALUES ($1, $2, $3, 'CUSTOMER', 'Cancun', 'SEGURO', true, true, 'Seguro viagem internacional contratado com a agência.', now(), now())
     ON CONFLICT (agency_id, id) DO UPDATE SET
       destination = EXCLUDED.destination,
       type = EXCLUDED.type,
       required = EXCLUDED.required,
       fulfilled = EXCLUDED.fulfilled,
       notes = EXCLUDED.notes,
       updated_at = now()`,
    [requirementInsuranceId, agencyId, customerId],
  );

  await pool.query(
    `INSERT INTO wishes (id, agency_id, customer_id, destination, start_date, end_date, travelers_count, notes, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'Cancun', '2027-05-01', '2027-05-10', 3, 'Familia quer resort all-inclusive com entrada e duas parcelas.', 'ACTIVE', now(), now())
     ON CONFLICT (agency_id, id) DO UPDATE SET
       customer_id = EXCLUDED.customer_id,
       destination = EXCLUDED.destination,
       start_date = EXCLUDED.start_date,
       end_date = EXCLUDED.end_date,
       travelers_count = EXCLUDED.travelers_count,
       notes = EXCLUDED.notes,
       status = EXCLUDED.status,
       updated_at = now()`,
    [ids.wish, agencyId, customerId],
  );

  await pool.query(
    `INSERT INTO external_offer_captures
       (id, agency_id, source_url, source_name, raw_content, normalized_title, normalized_description, found_price, currency, valid_until, status, created_at, updated_at)
     VALUES ($1, $2, 'https://supplier.example/demo-mariana-cancun', 'Supplier Demo', $3, 'Cancun All-Inclusive Familia', 'Hotel, aereo, transfer e seguro para familia', 18000, 'BRL', '2027-01-31', 'APPROVED', now(), now())
     ON CONFLICT (agency_id, id) DO UPDATE SET
       source_url = EXCLUDED.source_url,
       source_name = EXCLUDED.source_name,
       raw_content = EXCLUDED.raw_content,
       normalized_title = EXCLUDED.normalized_title,
       normalized_description = EXCLUDED.normalized_description,
       found_price = EXCLUDED.found_price,
       currency = EXCLUDED.currency,
       valid_until = EXCLUDED.valid_until,
       status = EXCLUDED.status,
       updated_at = now()`,
    [ids.capture, agencyId, JSON.stringify({ demoOnly: true, story: 'Mariana / Cancun' })],
  );

  await pool.query(
    `INSERT INTO offers (id, agency_id, name, description, price, valid_from, valid_until, status, created_at, updated_at)
     VALUES ($1, $2, 'Mariana / Cancun - pacote familia', 'Cancun all-inclusive com hotel, aereo, transfer e seguro.', 18000, '2026-09-01', '2027-01-31', 'ACTIVE', now(), now())
     ON CONFLICT (agency_id, id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       price = EXCLUDED.price,
       valid_from = EXCLUDED.valid_from,
       valid_until = EXCLUDED.valid_until,
       status = EXCLUDED.status,
       updated_at = now()`,
    [ids.offer, agencyId],
  );

  await pool.query(
    `INSERT INTO proposals (id, agency_id, customer_id, offer_id, wish_id, user_id, proposed_price, discount, total, valid_until, notes, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 18000, 0, 18000, '2027-01-31', 'Mariana / Cancun - entrada de 6000 e duas parcelas futuras.', 'ACCEPTED', now(), now())
     ON CONFLICT (agency_id, id) DO UPDATE SET
       customer_id = EXCLUDED.customer_id,
       offer_id = EXCLUDED.offer_id,
       wish_id = EXCLUDED.wish_id,
       user_id = EXCLUDED.user_id,
       proposed_price = EXCLUDED.proposed_price,
       discount = EXCLUDED.discount,
       total = EXCLUDED.total,
       valid_until = EXCLUDED.valid_until,
       notes = EXCLUDED.notes,
       status = EXCLUDED.status,
       updated_at = now()`,
    [ids.proposal, agencyId, customerId, ids.offer, ids.wish, userId],
  );

  await pool.query(
    `INSERT INTO sales (id, agency_id, customer_id, proposal_id, user_id, amount, discount, total, status, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 18000, 0, 18000, 'CONFIRMED', 'Demo principal: Mariana / Cancun', now(), now())
     ON CONFLICT (agency_id, id) DO UPDATE SET
       customer_id = EXCLUDED.customer_id,
       proposal_id = EXCLUDED.proposal_id,
       user_id = EXCLUDED.user_id,
       amount = EXCLUDED.amount,
       discount = EXCLUDED.discount,
       total = EXCLUDED.total,
       status = EXCLUDED.status,
       notes = EXCLUDED.notes,
       updated_at = now()`,
    [ids.sale, agencyId, customerId, ids.proposal, userId],
  );

  await pool.query(
    `INSERT INTO receivables (id, agency_id, sale_id, customer_id, description, amount, due_at, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'Mariana / Cancun - saldo total da venda', 18000, '2027-03-10', 'PARTIALLY_PAID', now(), now())
     ON CONFLICT (agency_id, sale_id) DO UPDATE SET
       customer_id = EXCLUDED.customer_id,
       description = EXCLUDED.description,
       amount = EXCLUDED.amount,
       due_at = EXCLUDED.due_at,
       status = EXCLUDED.status,
       updated_at = now()`,
    [ids.receivable, agencyId, ids.sale, customerId],
  );

  await seedInstallmentRevenues(pool, { agencyId, saleId: ids.sale, customerId });
  await seedSupplierPayables(pool, { agencyId, saleId: ids.sale });

  await pool.query(
    `INSERT INTO payments (id, agency_id, direction, amount, occurred_at, method, reference, notes, created_by, created_at)
     VALUES ($1, $2, 'IN', 6000, '2026-09-03', 'PIX', 'DEMO-MARIANA-ENTRADA', 'Entrada Mariana / Cancun', $3, now())
     ON CONFLICT (agency_id, id) DO NOTHING`,
    [ids.payment, agencyId, userId],
  );

  await pool.query(
    `INSERT INTO payment_allocations (id, agency_id, payment_id, receivable_id, amount, created_at)
     VALUES ($1, $2, $3, $4, 6000, now())
     ON CONFLICT (agency_id, id) DO NOTHING`,
    [ids.allocation, agencyId, ids.payment, ids.receivable],
  );

  await pool.query(
    `INSERT INTO trips (id, agency_id, customer_id, sale_id, name, destination, start_date, end_date, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'Mariana / Cancun', 'Cancun', '2027-05-01', '2027-05-10', 'CONFIRMED', now(), now())
     ON CONFLICT (agency_id, sale_id) DO UPDATE SET
       customer_id = EXCLUDED.customer_id,
       name = EXCLUDED.name,
       destination = EXCLUDED.destination,
       start_date = EXCLUDED.start_date,
       end_date = EXCLUDED.end_date,
       status = EXCLUDED.status,
       updated_at = now()`,
    [ids.trip, agencyId, customerId, ids.sale],
  );
}

async function getOrCreateMarianaCustomer(pool, { agencyId }) {
  const ids = STORY_IDS.marianaCancun;
  const existing = await pool.query(
    `SELECT id FROM customers
      WHERE agency_id = $1 AND (id = $2 OR email = 'mariana.alves@email.com' OR cpf = '12345678901')
      ORDER BY CASE WHEN id = $2 THEN 0 ELSE 1 END
      LIMIT 1`,
    [agencyId, ids.customer],
  );
  const customerId = existing.rows[0]?.id ?? ids.customer;

  await pool.query(
    `INSERT INTO customers (id, agency_id, name, email, phone, cpf, rg, status, created_at, updated_at)
     VALUES ($1, $2, 'Mariana Alves Silva', 'mariana.alves@email.com', '11987654321', '12345678901', '123456789', 'ACTIVE', now(), now())
     ON CONFLICT (agency_id, id) DO UPDATE SET
       name = EXCLUDED.name,
       email = EXCLUDED.email,
       phone = EXCLUDED.phone,
       cpf = EXCLUDED.cpf,
       rg = EXCLUDED.rg,
       status = EXCLUDED.status,
       updated_at = now()`,
    [customerId, agencyId],
  );

  return customerId;
}

async function seedInstallmentRevenues(pool, { agencyId, saleId, customerId }) {
  const categoryId = await getCategory(pool, agencyId, 'Pacotes de viagem', 'REVENUE');
  const rows = [
    [STORY_IDS.marianaCancun.revenueEntrada, saleId, 'Entrada Mariana / Cancun', 6000, '2026-09-03', 'PAID'],
    [STORY_IDS.marianaCancun.revenueParcela2, null, 'Parcela 2 Mariana / Cancun', 6000, '2026-10-03', 'OPEN'],
    [STORY_IDS.marianaCancun.revenueParcela3, null, 'Parcela 3 Mariana / Cancun', 6000, '2026-11-03', 'OPEN'],
  ];

  for (const [id, revenueSaleId, description, amount, dueDate, status] of rows) {
    await pool.query(
      `INSERT INTO revenues
         (id, agency_id, sale_id, customer_id, category_id, description, amount, currency, competency_date, due_date, receipt_date, payment_method, status, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'BRL', $8, $8, CASE WHEN $9::"RevenueStatus" = 'PAID' THEN $8::timestamptz ELSE NULL END, 'PIX', $9::"RevenueStatus", 'Demo installment schedule for Mariana / Cancun sale', now(), now())
       ON CONFLICT (agency_id, id) DO UPDATE SET
         sale_id = EXCLUDED.sale_id,
         customer_id = EXCLUDED.customer_id,
         category_id = EXCLUDED.category_id,
         description = EXCLUDED.description,
         amount = EXCLUDED.amount,
         currency = EXCLUDED.currency,
         competency_date = EXCLUDED.competency_date,
         due_date = EXCLUDED.due_date,
         receipt_date = EXCLUDED.receipt_date,
         payment_method = EXCLUDED.payment_method,
         status = EXCLUDED.status,
         notes = EXCLUDED.notes,
         updated_at = now()`,
      [id, agencyId, revenueSaleId, customerId, categoryId, description, amount, dueDate, status],
    );
  }
}

async function seedSupplierPayables(pool, { agencyId, saleId }) {
  const rows = [
    [STORY_IDS.marianaCancun.payableHotel, 'Hotel - Grand Palladium Cancun', 7000, '2026-09-20'],
    [STORY_IDS.marianaCancun.payableAereo, 'Aereo - Sao Paulo / Cancun', 5000, '2026-09-25'],
    [STORY_IDS.marianaCancun.payableTransfer, 'Transfer - Aeroporto / Resort', 800, '2026-10-01'],
    [STORY_IDS.marianaCancun.payableSeguro, 'Seguro viagem familia', 500, '2026-10-05'],
    [STORY_IDS.marianaCancun.payableComissao, 'Comissao agencia / vendedor', 700, '2026-10-10'],
  ];

  for (const [id, description, amount, dueDate] of rows) {
    await pool.query(
      `INSERT INTO payables (id, agency_id, sale_id, description, amount, due_at, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'OPEN', now(), now())
       ON CONFLICT (agency_id, id) DO UPDATE SET
         sale_id = EXCLUDED.sale_id,
         description = EXCLUDED.description,
         amount = EXCLUDED.amount,
         due_at = EXCLUDED.due_at,
         status = EXCLUDED.status,
         updated_at = now()`,
      [id, agencyId, saleId, description, amount, dueDate],
    );
  }
}

async function seedSupportingStory(pool, { agencyId, userId, key, customerName, destination, total }) {
  const ids = STORY_IDS[key];
  const customer = await pool.query(
    `SELECT id FROM customers WHERE agency_id = $1 AND name = $2 LIMIT 1`,
    [agencyId, customerName],
  );
  const customerId = customer.rows[0]?.id;
  if (!customerId) return;

  await pool.query(
    `INSERT INTO proposals (id, agency_id, customer_id, user_id, proposed_price, discount, total, valid_until, notes, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 0, $5, '2027-01-31', $6, 'ACCEPTED', now(), now())
     ON CONFLICT (agency_id, id) DO UPDATE SET
       customer_id = EXCLUDED.customer_id,
       user_id = EXCLUDED.user_id,
       proposed_price = EXCLUDED.proposed_price,
       discount = EXCLUDED.discount,
       total = EXCLUDED.total,
       valid_until = EXCLUDED.valid_until,
       notes = EXCLUDED.notes,
       status = EXCLUDED.status,
       updated_at = now()`,
    [ids.proposal, agencyId, customerId, userId, total, `Demo ${key}: ${destination}`],
  );

  await pool.query(
    `INSERT INTO sales (id, agency_id, customer_id, proposal_id, user_id, amount, discount, total, status, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 0, $6, 'CONFIRMED', $7, now(), now())
     ON CONFLICT (agency_id, id) DO UPDATE SET
       customer_id = EXCLUDED.customer_id,
       proposal_id = EXCLUDED.proposal_id,
       user_id = EXCLUDED.user_id,
       amount = EXCLUDED.amount,
       discount = EXCLUDED.discount,
       total = EXCLUDED.total,
       status = EXCLUDED.status,
       notes = EXCLUDED.notes,
       updated_at = now()`,
    [ids.sale, agencyId, customerId, ids.proposal, userId, total, `Demo ${key}: ${destination}`],
  );

  await pool.query(
    `INSERT INTO trips (id, agency_id, customer_id, sale_id, name, destination, start_date, end_date, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, '2027-06-01', '2027-06-10', 'CONFIRMED', now(), now())
     ON CONFLICT (agency_id, sale_id) DO UPDATE SET
       customer_id = EXCLUDED.customer_id,
       name = EXCLUDED.name,
       destination = EXCLUDED.destination,
       start_date = EXCLUDED.start_date,
       end_date = EXCLUDED.end_date,
       status = EXCLUDED.status,
       updated_at = now()`,
    [ids.trip, agencyId, customerId, ids.sale, `Demo ${key}: ${destination}`, destination],
  );
}

async function getCategory(pool, agencyId, name, type) {
  const result = await pool.query(
    `INSERT INTO financial_categories (id, agency_id, name, type, description, is_active, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, true, now(), now())
     ON CONFLICT (agency_id, type, name) DO UPDATE SET is_active = true, updated_at = now()
     RETURNING id`,
    [agencyId, name, type, `${name} demo`],
  );
  return result.rows[0].id;
}

module.exports = { STORY_IDS, seedBusinessStories };
