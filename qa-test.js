const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const AGENCY_URL = 'http://localhost:5173';
const CUSTOMER_URL = 'http://localhost:5174';

// Breakpoints to test
const BREAKPOINTS = {
  desktop_1920: { width: 1920, height: 1080, name: 'Desktop 1920px' },
  desktop_1366: { width: 1366, height: 768, name: 'Desktop 1366px' },
  desktop_1024: { width: 1024, height: 768, name: 'Desktop 1024px' },
  tablet_834: { width: 834, height: 1194, name: 'Tablet 834px' },
  tablet_768: { width: 768, height: 1024, name: 'Tablet 768px' },
  mobile_720: { width: 720, height: 1280, name: 'Mobile 720px' },
  mobile_480: { width: 480, height: 854, name: 'Mobile 480px' },
  mobile_375: { width: 375, height: 667, name: 'Mobile 375px' },
};

const results = [];

function logResult(result) {
  results.push(result);
  const emoji = result.status === 'PASS' ? '✓' : result.status === 'FAIL' ? '✗' : '⚠';
  console.log(`${emoji} [${result.category}] ${result.test}: ${result.details || ''}`);
}

async function checkAccessibility(page, pageName) {
  console.log(`\n--- Checking Accessibility for ${pageName} ---`);

  // Check for ARIA labels on buttons
  const buttons = await page.locator('button').count();
  const ariaButtons = await page.locator('button[aria-label]').count();
  if (buttons > 0 && ariaButtons < buttons * 0.3) {
    logResult({
      category: 'Accessibility',
      test: `${pageName} - Button ARIA Labels`,
      status: 'WARNING',
      details: `Only ${ariaButtons}/${buttons} buttons have aria-labels`,
      severity: 'P1',
    });
  } else {
    logResult({
      category: 'Accessibility',
      test: `${pageName} - Button ARIA Labels`,
      status: 'PASS',
      details: `${ariaButtons}/${buttons} buttons properly labeled`,
    });
  }

  // Check for form labels
  const inputs = await page.locator('input').count();
  const labeledInputs = await page.locator('label').count();
  logResult({
    category: 'Accessibility',
    test: `${pageName} - Form Labels`,
    status: labeledInputs > 0 ? 'PASS' : inputs > 0 ? 'WARNING' : 'PASS',
    details: `Found ${labeledInputs} labels for ${inputs} inputs`,
    severity: inputs > 0 && labeledInputs === 0 ? 'P1' : undefined,
  });

  // Check focus visibility
  try {
    const focusableCount = await page.evaluate(() => {
      const elements = document.querySelectorAll(
        'button, a, input, select, textarea, [tabindex]'
      );
      return elements.length;
    });
    logResult({
      category: 'Accessibility',
      test: `${pageName} - Focusable Elements`,
      status: focusableCount > 0 ? 'PASS' : 'WARNING',
      details: `Found ${focusableCount} focusable elements`,
    });
  } catch {
    logResult({
      category: 'Accessibility',
      test: `${pageName} - Focusable Elements`,
      status: 'WARNING',
      details: 'Could not check focusable elements',
    });
  }
}

async function checkResponsive(page, breakpoint, pageName) {
  // Check for horizontal scroll
  const hasHorizontalScroll = await page.evaluate(() => {
    return window.innerWidth < document.documentElement.scrollWidth;
  });

  if (hasHorizontalScroll) {
    logResult({
      category: 'Responsive Design',
      test: `${pageName} - ${breakpoint} Horizontal Scroll`,
      status: 'FAIL',
      details: 'Page has unwanted horizontal scroll',
      severity: 'P0',
    });
  } else {
    logResult({
      category: 'Responsive Design',
      test: `${pageName} - ${breakpoint}`,
      status: 'PASS',
    });
  }

  // Check text is readable
  const fontSize = await page.evaluate(() => {
    const body = document.querySelector('body');
    if (!body) return 0;
    return parseInt(window.getComputedStyle(body).fontSize);
  });

  if (fontSize < 14) {
    logResult({
      category: 'Responsive Design',
      test: `${pageName} - ${breakpoint} Font Size`,
      status: 'WARNING',
      details: `Body font size is ${fontSize}px (min recommended 14px)`,
      severity: 'P1',
    });
  }
}

async function checkConsistency(page, pageName) {
  console.log(`\n--- Checking Visual Consistency for ${pageName} ---`);

  // Check button styling
  const primaryButtons = await page.locator('[class*="btn"], button[class*="primary"]').count();
  const secondaryButtons = await page.locator('[class*="secondary"]').count();
  const dangerButtons = await page.locator('[class*="danger"]').count();

  logResult({
    category: 'Visual Consistency',
    test: `${pageName} - Button Variants`,
    status: 'PASS',
    details: `Primary: ${primaryButtons}, Secondary: ${secondaryButtons}, Danger: ${dangerButtons}`,
  });

  // Check for loading states
  const loaders = await page.locator('[class*="loader"], [class*="spinner"], [class*="loading"]')
    .count();
  if (loaders === 0) {
    logResult({
      category: 'Visual Consistency',
      test: `${pageName} - Loading States`,
      status: 'WARNING',
      details: 'No visible loading state indicators found',
    });
  } else {
    logResult({
      category: 'Visual Consistency',
      test: `${pageName} - Loading States`,
      status: 'PASS',
      details: `Found ${loaders} loading indicators`,
    });
  }

  // Check for error states
  const errorElements = await page.locator('[class*="error"], [role="alert"]').count();
  logResult({
    category: 'Visual Consistency',
    test: `${pageName} - Error States`,
    status: errorElements > 0 ? 'PASS' : 'WARNING',
    details: `Found ${errorElements} error indicators`,
  });

  // Check for empty states
  const emptyElements = await page.locator('[class*="empty"]').count();
  logResult({
    category: 'Visual Consistency',
    test: `${pageName} - Empty States`,
    status: emptyElements > 0 ? 'PASS' : 'WARNING',
    details: `Found ${emptyElements} empty state elements`,
  });
}

async function testPage(page, url, pageName, screenshotDir) {
  console.log(`\n========== Testing ${pageName} ==========`);

  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500); // Wait for render

    // Test each breakpoint
    for (const [key, bp] of Object.entries(BREAKPOINTS)) {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.waitForTimeout(300); // Wait for layout shift

      // Take screenshot
      const screenshotPath = path.join(screenshotDir, `${pageName}_${key}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });

      // Check responsive issues
      await checkResponsive(page, bp.name, pageName);
    }

    // Reset to desktop for accessibility testing
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Check accessibility on desktop
    await checkAccessibility(page, pageName);

    // Check consistency
    await checkConsistency(page, pageName);

    logResult({
      category: 'Navigation & UX',
      test: `${pageName} - Page Load`,
      status: 'PASS',
    });
  } catch (error) {
    logResult({
      category: 'Navigation & UX',
      test: `${pageName} - Page Load`,
      status: 'FAIL',
      details: `Error: ${error.message}`,
      severity: 'P0',
    });
  }
}

async function runQATests() {
  console.log('='.repeat(60));
  console.log('STARTING VISUAL QA PASS');
  console.log('='.repeat(60));

  const screenshotDir = path.join('d:/travel-platform', 'qa-screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  // Pages to test - Agency Portal
  const agencyPages = [
    { url: `${AGENCY_URL}/`, name: 'Agency_Dashboard' },
    { url: `${AGENCY_URL}/customers`, name: 'Agency_Customers' },
    { url: `${AGENCY_URL}/offers`, name: 'Agency_Offers' },
  ];

  // Pages to test - Customer Portal
  const customerPages = [
    { url: `${CUSTOMER_URL}/`, name: 'Customer_Home' },
    { url: `${CUSTOMER_URL}/trips`, name: 'Customer_Trips' },
    { url: `${CUSTOMER_URL}/bookings`, name: 'Customer_Bookings' },
  ];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.createBrowserContext();
  const page = await context.newPage();

  // Test Agency Portal
  console.log('\n' + '='.repeat(60));
  console.log('TESTING AGENCY PORTAL');
  console.log('='.repeat(60));

  for (const pageConfig of agencyPages) {
    await testPage(page, pageConfig.url, pageConfig.name, screenshotDir);
  }

  // Test Customer Portal
  console.log('\n' + '='.repeat(60));
  console.log('TESTING CUSTOMER PORTAL');
  console.log('='.repeat(60));

  for (const pageConfig of customerPages) {
    await testPage(page, pageConfig.url, pageConfig.name, screenshotDir);
  }

  await context.close();
  await browser.close();

  // Generate report
  generateReport(results, screenshotDir);
}

function generateReport(results, screenshotDir) {
  console.log('\n' + '='.repeat(60));
  console.log('QA TEST REPORT');
  console.log('='.repeat(60));

  const p0Issues = results.filter((r) => r.severity === 'P0');
  const p1Issues = results.filter((r) => r.severity === 'P1');
  const p2Issues = results.filter((r) => r.severity === 'P2');
  const warnings = results.filter((r) => r.status === 'WARNING' && !r.severity);
  const passes = results.filter((r) => r.status === 'PASS');

  console.log(`\nSUMMARY:`);
  console.log(`  Total Tests: ${results.length}`);
  console.log(`  Passed: ${passes.length} ✓`);
  console.log(`  Warnings: ${warnings.length} ⚠`);
  console.log(`  P0 Issues (Blockers): ${p0Issues.length} ✗`);
  console.log(`  P1 Issues (High Priority): ${p1Issues.length}`);
  console.log(`  P2 Issues (Medium Priority): ${p2Issues.length}`);

  console.log(`\nVERDICT: ${p0Issues.length > 0 ? 'FAIL ✗' : 'PASS ✓'}`);
  console.log(`Acceptance Criteria: ${p0Issues.length === 0 ? 'MET' : 'NOT MET'}`);

  if (p0Issues.length > 0) {
    console.log('\nCRITICAL P0 ISSUES:');
    p0Issues.forEach((issue) => {
      console.log(`  - ${issue.test}: ${issue.details}`);
    });
  }

  if (p1Issues.length > 0) {
    console.log('\nHIGH PRIORITY P1 ISSUES:');
    p1Issues.slice(0, 5).forEach((issue) => {
      console.log(`  - ${issue.test}: ${issue.details}`);
    });
    if (p1Issues.length > 5) {
      console.log(`  ... and ${p1Issues.length - 5} more`);
    }
  }

  console.log(`\nScreenshots saved to: ${screenshotDir}`);
  console.log('='.repeat(60));

  // Save report to file
  const reportPath = path.join('d:/travel-platform', 'qa-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    summary: {
      p0Issues: p0Issues.length,
      p1Issues: p1Issues.length,
      p2Issues: p2Issues.length,
      warnings: warnings.length,
      passes: passes.length,
      total: results.length
    },
    results
  }, null, 2));
  console.log(`Report saved to: ${reportPath}`);
}

runQATests().catch(console.error);
