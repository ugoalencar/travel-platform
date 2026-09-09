from pathlib import Path
import json
from playwright.sync_api import sync_playwright
from visual_final_qa import AGENCY_URL, PLATFORM_URL, agency_route, platform_route

CUSTOMER_URL = "http://127.0.0.1:5196"
OUT = Path("docs/visual-reconstruction-delivery/screenshots/responsive")
OUT.mkdir(parents=True, exist_ok=True)

NOW = "2026-09-08T12:00:00.000Z"
CUSTOMER_ID = "cust-1"


def response(body, status=200):
    return {"status": status, "content_type": "application/json", "body": json.dumps(body)}


customer = {
    "id": CUSTOMER_ID,
    "agencyId": "agency-1",
    "name": "Mariana Alves Silva",
    "email": "mariana.silva@email.com",
    "phone": "+55 11 98765-4321",
    "cpf": "123.456.789-09",
    "passport": "FZ1234567",
    "notes": "Prefere roteiros com experiencias locais.",
    "status": "ACTIVE",
    "createdAt": "2022-03-12T10:00:00.000Z",
    "updatedAt": NOW,
}

trip = {
    "id": "trip-1",
    "agencyId": "agency-1",
    "customerId": CUSTOMER_ID,
    "name": "Cancun em familia",
    "destination": "Cancun, Mexico",
    "status": "CONFIRMED",
    "startDate": "2026-12-12T12:00:00.000Z",
    "endDate": "2026-12-19T12:00:00.000Z",
    "createdAt": NOW,
    "updatedAt": NOW,
}


def customer_route(route):
    path = route.request.url.replace(CUSTOMER_URL, "")
    if path == "/api/customers":
        route.fulfill(**response({"customers": [customer]}))
    elif path == f"/api/customers/{CUSTOMER_ID}":
        route.fulfill(**response({"customer": customer}))
    elif path == "/api/wishes":
        route.fulfill(**response({"wishes": []}))
    elif path == "/api/proposals":
        route.fulfill(**response({"proposals": []}))
    elif path == "/api/sales":
        route.fulfill(**response({"sales": []}))
    elif path == "/api/bookings":
        route.fulfill(**response({"bookings": []}))
    elif path == "/api/financial/receivables":
        route.fulfill(**response({"receivables": []}))
    elif path == "/api/trips":
        route.fulfill(**response({"trips": [trip]}))
    elif path.startswith("/api/commercial/opportunities"):
        route.fulfill(**response({"total": 0, "opportunities": []}))
    elif path.startswith("/api/commercial/interactions"):
        route.fulfill(**response({"total": 0, "interactions": []}))
    elif path.startswith("/api/commercial/tasks"):
        route.fulfill(**response({"total": 0, "tasks": []}))
    elif path == "/api/commercial/pipelines":
        route.fulfill(**response({"pipelines": []}))
    elif path == "/customer-api/me":
        route.fulfill(**response({"profile": {"id": CUSTOMER_ID, "name": customer["name"], "email": customer["email"]}}))
    elif path == "/customer-api/trips":
        route.fulfill(**response({"trips": [trip]}))
    elif path == "/customer-api/offers":
        route.fulfill(**response({"offers": [{"id": "offer-1", "name": "Bariloche neve", "price": 18900, "status": "ACTIVE"}]}))
    elif path == "/customer-api/bookings":
        route.fulfill(**response({"bookings": [{"id": "booking-1", "isFuture": True, "tripName": trip["name"]}]}))
    elif path == "/customer-api/proposals":
        route.fulfill(**response({"proposals": [{"id": "proposal-1", "total": 28430, "status": "SENT"}]}))
    elif path == "/customer-api/documents":
        route.fulfill(**response({"documents": [{"id": "doc-1", "type": "PASSPORT", "verificationStatus": "PENDING"}]}))
    elif path == "/customer-api/payment-schedule":
        route.fulfill(**response({"items": []}))
    else:
        route.fulfill(**response({}))


def capture(page, base, name, path, width, height=900):
    page.set_viewport_size({"width": width, "height": height})
    page.goto(base + path, wait_until="networkidle")
    page.screenshot(path=str(OUT / f"{name}-{width}.png"), full_page=True)
    return {
        "name": name,
        "width": width,
        "scrollWidth": page.evaluate("document.documentElement.scrollWidth"),
        "innerWidth": page.evaluate("window.innerWidth"),
    }


def main():
    console_errors = []
    failed_requests = []
    unexpected_statuses = []
    overflows = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        agency_state = {"role": "ADMIN"}
        agency = browser.new_page()
        agency.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        agency.on("requestfailed", lambda req: failed_requests.append(req.url))
        agency.on("response", lambda res: unexpected_statuses.append(f"{res.status} {res.url}") if res.status in [403, 500] else None)
        agency.route("**/api/**", agency_route(agency_state))

        customer_page = browser.new_page()
        customer_page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        customer_page.on("requestfailed", lambda req: failed_requests.append(req.url))
        customer_page.on("response", lambda res: unexpected_statuses.append(f"{res.status} {res.url}") if res.status in [403, 500] else None)
        customer_page.route("**/api/**", customer_route)
        customer_page.route("**/customer-api/**", customer_route)

        platform = browser.new_page()
        platform.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        platform.on("requestfailed", lambda req: failed_requests.append(req.url))
        platform.on("response", lambda res: unexpected_statuses.append(f"{res.status} {res.url}") if res.status in [403, 500] else None)
        platform.route("**/api/**", platform_route)

        checks = []
        for width in [1440, 1024, 390]:
            agency_state["role"] = "ADMIN"
            checks.append(capture(agency, AGENCY_URL, "agency-dashboard", "/", width))
            checks.append(capture(agency, AGENCY_URL, "agency-finance", "/financial", width))
            checks.append(capture(agency, AGENCY_URL, "agency-trips", "/trips", width))
            agency_state["role"] = "AGENT"
            checks.append(capture(agency, AGENCY_URL, "agency-staff", "/", width))
            checks.append(capture(customer_page, CUSTOMER_URL, "customer-360", f"/customers/{CUSTOMER_ID}", width))
            checks.append(capture(customer_page, CUSTOMER_URL, "customer-portal", "/customer-portal", width))
            checks.append(capture(platform, PLATFORM_URL, "platform-admin", "/", width))

        browser.close()

    for check in checks:
        if check["scrollWidth"] > check["innerWidth"]:
            overflows.append(check)

    report = {
        "console_errors": console_errors,
        "network_failures": failed_requests,
        "unexpected_403_500": unexpected_statuses,
        "horizontal_overflows": overflows,
    }
    (OUT / "responsive-qa.json").write_text(json.dumps(report, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
