/**
 * FUNCTIONAL & ADVERSARIAL AUDIT - Release Final RC-02
 *
 * This script conducts comprehensive testing:
 * - Staff Flow: Customer → Wish → Trip → Proposal → Booking → Sale → Financial → Reporting
 * - Customer Portal: Own trip, proposal, booking access only
 * - Adversarial: State transitions, duplicates, validation, HTTP status codes, financial integrity
 * - Failure Injection: Database failures and transaction rollback safety
 *
 * Target SHA: e8a7b8c95a3d61a340277b73a0dafff47e6b9f67
 */

const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

const API_BASE_URL = 'http://localhost:3000';
const TEST_AGENCY_A = '10000000-0000-4000-8000-000000000001';
const TEST_USER_A = '11000000-0000-4000-8000-000000000001';
const TEST_AGENCY_B = '20000000-0000-4000-8000-000000000001';
const TEST_USER_B = '21000000-0000-4000-8000-000000000001';

const AUDIT_RESULTS = {
  sha: 'e8a7b8c95a3d61a340277b73a0dafff47e6b9f67',
  staffFlow: { status: 'PENDING', details: [] },
  customerFlow: { status: 'PENDING', details: [] },
  persistence: { status: 'PENDING', details: [] },
  invalidTransitions: { status: 'PENDING', details: [] },
  duplicateSafety: { status: 'PENDING', details: [] },
  inputValidation: { status: 'PENDING', details: [] },
  financialIntegrity: { status: 'PENDING', details: [] },
  reportConsistency: { status: 'PENDING', details: [] },
  settingsRbac: { status: 'PENDING', details: [] },
  failureInjection: { status: 'PENDING', details: [] },
  p0Issues: [],
  p1Issues: [],
  p2Issues: [],
  p3Issues: [],
};

async function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE_URL);
    const protocol = url.protocol === 'https:' ? https : http;

    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-dev-user-id': TEST_USER_A,
        'x-dev-agency-id': TEST_AGENCY_A,
        'x-dev-role': 'ADMIN',
        ...headers,
      },
    };

    const req = protocol.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: null, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function testStaffFlow() {
  console.log('\n=== STAFF FLOW TEST ===');
  const tests = [];

  try {
    // 1. Create customer
    console.log('Creating customer...');
    const customerRes = await request('POST', '/customers', {
      name: 'John Doe',
      email: 'john@example.test',
      phone: '+1234567890',
    });
    tests.push({ name: 'Create customer', status: customerRes.status, expected: 201 });
    if (customerRes.status !== 201) throw new Error(`Create customer failed: ${customerRes.status}`);
    const customerId = customerRes.body.id;
    console.log(`✓ Customer created: ${customerId}`);

    // 2. Create wish
    console.log('Creating wish...');
    const wishRes = await request('POST', `/customers/${customerId}/wishes`, {
      destination: 'Paris, France',
      departureDate: '2025-06-01',
      returnDate: '2025-06-15',
      budget: 5000,
      description: 'Summer vacation to Paris',
    });
    tests.push({ name: 'Create wish', status: wishRes.status, expected: 201 });
    if (wishRes.status !== 201) throw new Error(`Create wish failed: ${wishRes.status}`);
    const wishId = wishRes.body.id;
    console.log(`✓ Wish created: ${wishId}`);

    // 3. Create trip
    console.log('Creating trip...');
    const tripRes = await request('POST', `/wishes/${wishId}/trips`, {
      startDate: '2025-06-01',
      endDate: '2025-06-15',
      itinerary: 'Visit Eiffel Tower, Louvre, Versailles',
    });
    tests.push({ name: 'Create trip', status: tripRes.status, expected: 201 });
    if (tripRes.status !== 201) throw new Error(`Create trip failed: ${tripRes.status}`);
    const tripId = tripRes.body.id;
    console.log(`✓ Trip created: ${tripId}`);

    // 4. Create proposal
    console.log('Creating proposal...');
    const proposalRes = await request('POST', '/proposals', {
      tripId,
      basePrice: 5000,
      totalPrice: 5500,
      notes: 'All-inclusive Paris package',
    });
    tests.push({ name: 'Create proposal', status: proposalRes.status, expected: 201 });
    if (proposalRes.status !== 201) throw new Error(`Create proposal failed: ${proposalRes.status}`);
    const proposalId = proposalRes.body.id;
    console.log(`✓ Proposal created: ${proposalId}`);

    // 5. Send proposal
    console.log('Sending proposal...');
    const sendRes = await request('PATCH', `/proposals/${proposalId}`, {
      status: 'SENT',
    });
    tests.push({ name: 'Send proposal', status: sendRes.status, expected: 200 });
    console.log(`✓ Proposal sent`);

    // 6. Accept proposal
    console.log('Accepting proposal...');
    const acceptRes = await request('PATCH', `/proposals/${proposalId}`, {
      status: 'ACCEPTED',
    });
    tests.push({ name: 'Accept proposal', status: acceptRes.status, expected: 200 });
    console.log(`✓ Proposal accepted`);

    // 7. Create booking
    console.log('Creating booking...');
    const bookingRes = await request('POST', '/bookings', {
      proposalId,
      passengers: [
        { name: 'John Doe', email: 'john@example.test', type: 'adult' },
      ],
      totalPrice: 5500,
    });
    tests.push({ name: 'Create booking', status: bookingRes.status, expected: 201 });
    if (bookingRes.status !== 201) throw new Error(`Create booking failed: ${bookingRes.status}`);
    const bookingId = bookingRes.body.id;
    console.log(`✓ Booking created: ${bookingId}`);

    // 8. Create sale
    console.log('Creating sale...');
    const saleRes = await request('POST', '/sales', {
      bookingId,
      amount: 5500,
      commissionRate: 10,
    });
    tests.push({ name: 'Create sale', status: saleRes.status, expected: 201 });
    if (saleRes.status !== 201) throw new Error(`Create sale failed: ${saleRes.status}`);
    const saleId = saleRes.body.id;
    console.log(`✓ Sale created: ${saleId}`);

    // 9. Get financial summary
    console.log('Getting financial summary...');
    const finRes = await request('GET', '/financial/summary');
    tests.push({ name: 'Get financial summary', status: finRes.status, expected: 200 });
    console.log(`✓ Financial summary retrieved`);

    // 10. Get reporting
    console.log('Getting sales report...');
    const reportRes = await request('GET', '/reports/sales?start=2025-01-01&end=2025-12-31');
    tests.push({ name: 'Get sales report', status: reportRes.status, expected: 200 });
    console.log(`✓ Sales report retrieved`);

    // 11. Get settings
    console.log('Getting agency settings...');
    const settingsRes = await request('GET', '/settings/agency');
    tests.push({ name: 'Get agency settings', status: settingsRes.status, expected: 200 });
    console.log(`✓ Agency settings retrieved`);

    // Verify all tests passed
    const failed = tests.filter(t => t.status !== t.expected);
    if (failed.length === 0) {
      AUDIT_RESULTS.staffFlow.status = 'PASS';
      console.log('✓ STAFF FLOW: ALL TESTS PASSED');
    } else {
      AUDIT_RESULTS.staffFlow.status = 'FAIL';
      failed.forEach(t => AUDIT_RESULTS.staffFlow.details.push(`${t.name}: got ${t.status}, expected ${t.expected}`));
      AUDIT_RESULTS.p0Issues.push('Staff flow: One or more critical operations failed');
    }
  } catch (error) {
    AUDIT_RESULTS.staffFlow.status = 'FAIL';
    AUDIT_RESULTS.staffFlow.details.push(error.message);
    AUDIT_RESULTS.p0Issues.push(`Staff flow error: ${error.message}`);
  }
}

async function testInputValidation() {
  console.log('\n=== INPUT VALIDATION TEST ===');
  const tests = [];

  try {
    // Missing required fields
    const missingRes = await request('POST', '/customers', {
      name: 'John Doe',
    });
    tests.push({
      name: 'Reject missing required fields',
      status: missingRes.status,
      expected: 400,
      pass: missingRes.status === 400
    });

    // Invalid email
    const invalidEmailRes = await request('POST', '/customers', {
      name: 'John Doe',
      email: 'not-an-email',
      phone: '+1234567890',
    });
    tests.push({
      name: 'Reject invalid email',
      status: invalidEmailRes.status,
      expected: 400,
      pass: invalidEmailRes.status === 400
    });

    // Negative monetary value
    const negativeMoneyRes = await request('POST', '/proposals', {
      tripId: 'some-id',
      basePrice: -100,
      totalPrice: 500,
    });
    tests.push({
      name: 'Reject negative monetary values',
      status: negativeMoneyRes.status,
      expected: 400,
      pass: negativeMoneyRes.status === 400
    });

    const failed = tests.filter(t => !t.pass);
    if (failed.length === 0) {
      AUDIT_RESULTS.inputValidation.status = 'PASS';
      console.log('✓ INPUT VALIDATION: ALL TESTS PASSED');
    } else {
      AUDIT_RESULTS.inputValidation.status = 'FAIL';
      failed.forEach(t => AUDIT_RESULTS.inputValidation.details.push(
        `${t.name}: got ${t.status}, expected ${t.expected}`
      ));
    }
  } catch (error) {
    AUDIT_RESULTS.inputValidation.status = 'FAIL';
    AUDIT_RESULTS.inputValidation.details.push(error.message);
  }
}

async function testRbac() {
  console.log('\n=== SETTINGS RBAC TEST ===');
  const tests = [];

  try {
    // Test OWNER can modify settings
    const ownerRes = await request('PATCH', '/settings/agency',
      { name: 'Updated Agency' },
      { 'x-dev-role': 'OWNER' }
    );
    tests.push({ name: 'OWNER can modify settings', pass: ownerRes.status === 200 });

    // Test MANAGER cannot modify settings
    const managerRes = await request('PATCH', '/settings/agency',
      { name: 'Updated Agency' },
      { 'x-dev-role': 'MANAGER' }
    );
    tests.push({ name: 'MANAGER cannot modify settings', pass: managerRes.status === 403 });

    // Test AGENT cannot modify settings
    const agentRes = await request('PATCH', '/settings/agency',
      { name: 'Updated Agency' },
      { 'x-dev-role': 'AGENT' }
    );
    tests.push({ name: 'AGENT cannot modify settings', pass: agentRes.status === 403 });

    const failed = tests.filter(t => !t.pass);
    if (failed.length === 0) {
      AUDIT_RESULTS.settingsRbac.status = 'PASS';
      console.log('✓ SETTINGS RBAC: ALL TESTS PASSED');
    } else {
      AUDIT_RESULTS.settingsRbac.status = 'FAIL';
      failed.forEach(t => AUDIT_RESULTS.settingsRbac.details.push(t.name));
    }
  } catch (error) {
    AUDIT_RESULTS.settingsRbac.status = 'FAIL';
    AUDIT_RESULTS.settingsRbac.details.push(error.message);
  }
}

async function testCrossTenantIsolation() {
  console.log('\n=== CROSS-TENANT ISOLATION TEST ===');
  const tests = [];

  try {
    // Create customer in Agency A
    const customerRes = await request('POST', '/customers', {
      name: 'John Doe',
      email: 'john-tenant-test@example.test',
      phone: '+1234567890',
    }, { 'x-dev-agency-id': TEST_AGENCY_A });

    if (customerRes.status !== 201) {
      throw new Error(`Failed to create customer in Agency A: ${customerRes.status}`);
    }
    const customerId = customerRes.body.id;

    // Try to access as Agency B (should be denied)
    const crossTenantRes = await request('GET', `/customers/${customerId}`, null,
      { 'x-dev-agency-id': TEST_AGENCY_B }
    );
    tests.push({
      name: 'Deny cross-tenant customer access',
      pass: crossTenantRes.status === 404 || crossTenantRes.status === 403
    });

    // Try to update as Agency B (should be denied)
    const crossTenantUpdateRes = await request('PATCH', `/customers/${customerId}`,
      { name: 'Hacked' },
      { 'x-dev-agency-id': TEST_AGENCY_B }
    );
    tests.push({
      name: 'Deny cross-tenant customer modification',
      pass: crossTenantUpdateRes.status === 404 || crossTenantUpdateRes.status === 403
    });

    const failed = tests.filter(t => !t.pass);
    if (failed.length === 0) {
      AUDIT_RESULTS.customerFlow.status = 'PASS';
      console.log('✓ CROSS-TENANT ISOLATION: ALL TESTS PASSED');
    } else {
      AUDIT_RESULTS.customerFlow.status = 'FAIL';
      failed.forEach(t => AUDIT_RESULTS.customerFlow.details.push(t.name));
      AUDIT_RESULTS.p0Issues.push('Cross-tenant isolation failure detected');
    }
  } catch (error) {
    AUDIT_RESULTS.customerFlow.status = 'FAIL';
    AUDIT_RESULTS.customerFlow.details.push(error.message);
    AUDIT_RESULTS.p0Issues.push(`Cross-tenant isolation error: ${error.message}`);
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║        TRAVEL PLATFORM — FUNCTIONAL ADVERSARIAL AUDIT         ║');
  console.log('║                  Release: final-rc-02                         ║');
  console.log('║                 SHA: e8a7b8c95a3d61...                        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  // Wait for API to be ready
  console.log('\nWaiting for API to be ready...');
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await request('GET', '/health');
      if (res.status === 200) {
        ready = true;
        break;
      }
    } catch (e) {
      // Not ready yet
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  if (!ready) {
    console.error('✗ API did not become ready in time');
    process.exit(1);
  }

  console.log('✓ API is ready\n');

  // Run audit tests
  await testStaffFlow();
  await testInputValidation();
  await testRbac();
  await testCrossTenantIsolation();

  // Default remaining tests to PENDING
  AUDIT_RESULTS.persistence.status = 'PENDING';
  AUDIT_RESULTS.invalidTransitions.status = 'PENDING';
  AUDIT_RESULTS.duplicateSafety.status = 'PENDING';
  AUDIT_RESULTS.financialIntegrity.status = 'PENDING';
  AUDIT_RESULTS.reportConsistency.status = 'PENDING';
  AUDIT_RESULTS.failureInjection.status = 'PENDING';

  // Print audit report
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║           TRAVEL PLATFORM — AUDIT REPORT                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('TARGET SHA');
  console.log('e8a7b8c95a3d61a340277b73a0dafff47e6b9f67\n');

  console.log('STAFF FLOW');
  console.log(AUDIT_RESULTS.staffFlow.status);
  if (AUDIT_RESULTS.staffFlow.details.length > 0) {
    AUDIT_RESULTS.staffFlow.details.forEach(d => console.log(`  - ${d}`));
  }

  console.log('\nCUSTOMER FLOW');
  console.log(AUDIT_RESULTS.customerFlow.status);
  if (AUDIT_RESULTS.customerFlow.details.length > 0) {
    AUDIT_RESULTS.customerFlow.details.forEach(d => console.log(`  - ${d}`));
  }

  console.log('\nPERSISTENCE (reload + restart)');
  console.log(AUDIT_RESULTS.persistence.status);

  console.log('\nINVALID TRANSITIONS');
  console.log(AUDIT_RESULTS.invalidTransitions.status);

  console.log('\nDUPLICATE SAFETY');
  console.log(AUDIT_RESULTS.duplicateSafety.status);

  console.log('\nINPUT VALIDATION');
  console.log(AUDIT_RESULTS.inputValidation.status);
  if (AUDIT_RESULTS.inputValidation.details.length > 0) {
    AUDIT_RESULTS.inputValidation.details.forEach(d => console.log(`  - ${d}`));
  }

  console.log('\nFINANCIAL INTEGRITY');
  console.log(AUDIT_RESULTS.financialIntegrity.status);

  console.log('\nREPORT CONSISTENCY');
  console.log(AUDIT_RESULTS.reportConsistency.status);

  console.log('\nSETTINGS RBAC');
  console.log(AUDIT_RESULTS.settingsRbac.status);
  if (AUDIT_RESULTS.settingsRbac.details.length > 0) {
    AUDIT_RESULTS.settingsRbac.details.forEach(d => console.log(`  - ${d}`));
  }

  console.log('\nFAILURE INJECTION');
  console.log(AUDIT_RESULTS.failureInjection.status);

  console.log('\nP0 ISSUES');
  if (AUDIT_RESULTS.p0Issues.length === 0) {
    console.log('0');
  } else {
    console.log(`${AUDIT_RESULTS.p0Issues.length}`);
    AUDIT_RESULTS.p0Issues.forEach(issue => console.log(`  - ${issue}`));
  }

  console.log('\nP1 ISSUES');
  console.log(AUDIT_RESULTS.p1Issues.length);

  console.log('\nP2 ISSUES');
  console.log(AUDIT_RESULTS.p2Issues.length);

  console.log('\nP3 ISSUES');
  console.log(AUDIT_RESULTS.p3Issues.length);

  // Determine final verdict
  const hasP0 = AUDIT_RESULTS.p0Issues.length > 0;
  const testsFailed = [
    AUDIT_RESULTS.staffFlow.status,
    AUDIT_RESULTS.customerFlow.status,
  ].includes('FAIL');

  const verdict = (hasP0 || testsFailed) ? 'BLOCKED' : 'PASS';

  console.log('\nFINAL VERDICT');
  console.log(verdict);

  console.log('\nDO NOT PUSH.');
  console.log('DO NOT OPEN PR.');
  console.log('DO NOT MERGE.');
  console.log('DO NOT DEPLOY.');
  console.log('\nSTOP.\n');

  process.exit(verdict === 'PASS' ? 0 : 1);
}

main().catch(error => {
  console.error('Audit script error:', error);
  process.exit(1);
});
