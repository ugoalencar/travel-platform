import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect


STORY_ID = "d0d50001-0000-4000-8000-000000000009"
STORY = {
    "story": {
        "saleId": STORY_ID,
        "customerName": "Mariana Alves Silva",
        "tripName": "Mariana / Cancun",
        "grossSale": 18000,
        "received": 6000,
        "remainingReceivable": 12000,
        "totalSupplierPayable": 14000,
        "installmentSchedule": [
            {"description": "Entrada Mariana / Cancun", "amount": 6000, "dueDate": "2026-09-03", "status": "PAID"},
            {"description": "Parcela 2 Mariana / Cancun", "amount": 6000, "dueDate": "2026-10-03", "status": "OPEN"},
            {"description": "Parcela 3 Mariana / Cancun", "amount": 6000, "dueDate": "2026-11-03", "status": "OPEN"},
        ],
        "supplierPayables": [
            {"description": "Hotel - Grand Palladium Cancun", "amount": 7000, "dueAt": "2026-09-20", "status": "OPEN"},
            {"description": "Aereo - Sao Paulo / Cancun", "amount": 5000, "dueAt": "2026-09-25", "status": "OPEN"},
        ],
        "margin": {
            "grossSale": 18000,
            "supplierCosts": 13300,
            "commissionAndFees": 700,
            "grossMargin": 4700,
            "netMargin": 4000,
        },
    }
}


def check_page(page, width, height, name):
    page.set_viewport_size({"width": width, "height": height})
    page.route(
        "**/api/financial/sales/*/story",
        lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(STORY),
        ),
    )
    page.goto(f"http://127.0.0.1:5174/financial/sales/{STORY_ID}/story")
    page.wait_for_load_state("networkidle")
    expect(page.get_by_role("heading", name="Historia financeira - Mariana Alves Silva")).to_be_visible()
    expect(page.get_by_text("Venda bruta")).to_be_visible()
    expect(page.get_by_text("R$ 18.000,00").first).to_be_visible()
    expect(page.get_by_text("Hotel - Grand Palladium Cancun")).to_be_visible()
    screenshot_dir = Path(".superpowers/sdd/screenshots")
    screenshot_dir.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(screenshot_dir / f"sale-financial-story-{name}.png"), full_page=True)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    check_page(page, 1440, 1000, "desktop")
    page = browser.new_page()
    check_page(page, 390, 900, "mobile")
    browser.close()
