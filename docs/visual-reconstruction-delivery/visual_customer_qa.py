from pathlib import Path
from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:5196"
OUT = Path("docs/visual-reconstruction-delivery/screenshots")
OUT.mkdir(parents=True, exist_ok=True)

CUSTOMER_ID = "cust-1"
NOW = "2026-09-08T12:00:00.000Z"

customer = {
    "id": CUSTOMER_ID,
    "agencyId": "agency-1",
    "name": "Mariana Alves Silva",
    "email": "mariana.silva@email.com",
    "phone": "+55 11 98765-4321",
    "cpf": "123.456.789-09",
    "passport": "FZ1234567",
    "address": {
        "street": "Rua das Acacias, 245",
        "city": "Sao Paulo",
        "state": "SP",
        "zip": "05432-020",
    },
    "notes": "Prefere roteiros com experiencias locais e atividades para criancas.",
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

proposal = {
    "id": "proposal-1",
    "agencyId": "agency-1",
    "customerId": CUSTOMER_ID,
    "wishId": "wish-1",
    "status": "SENT",
    "total": 28430,
    "createdAt": NOW,
    "updatedAt": NOW,
}

sale = {
    "id": "sale-1",
    "agencyId": "agency-1",
    "customerId": CUSTOMER_ID,
    "proposalId": "proposal-1",
    "status": "CONFIRMED",
    "total": 32490,
    "createdAt": NOW,
    "updatedAt": NOW,
}

def json_response(body):
    return {"status": 200, "content_type": "application/json", "body": __import__("json").dumps(body)}

def route_api(route):
    url = route.request.url
    path = url.replace(BASE_URL, "")
    if path == "/api/customers":
        route.fulfill(**json_response({"customers": [customer]}))
    elif path == f"/api/customers/{CUSTOMER_ID}":
        route.fulfill(**json_response({"customer": customer}))
    elif path == "/api/wishes":
        route.fulfill(**json_response({"wishes": [{
            "id": "wish-1", "agencyId": "agency-1", "customerId": CUSTOMER_ID,
            "destination": "Italia", "status": "OPEN", "createdAt": NOW, "updatedAt": NOW
        }]}))
    elif path == "/api/proposals":
        route.fulfill(**json_response({"proposals": [proposal]}))
    elif path == "/api/sales":
        route.fulfill(**json_response({"sales": [sale]}))
    elif path == "/api/bookings":
        route.fulfill(**json_response({"bookings": [{
            "id": "booking-1", "agencyId": "agency-1", "bookerCustomerId": CUSTOMER_ID,
            "tripType": "INTERNATIONAL", "cancelled": False, "createdAt": NOW, "updatedAt": NOW
        }]}))
    elif path == "/api/financial/receivables":
        route.fulfill(**json_response({"receivables": [{
            "id": "rec-1", "agencyId": "agency-1", "customerId": CUSTOMER_ID,
            "description": "Parcela Cancun", "amount": 12000, "status": "OPEN",
            "dueAt": "2026-10-10T12:00:00.000Z", "createdAt": NOW, "updatedAt": NOW
        }]}))
    elif path == "/api/trips":
        route.fulfill(**json_response({"trips": [trip]}))
    elif path.startswith("/api/commercial/opportunities"):
        route.fulfill(**json_response({"total": 1, "opportunities": [{
            "id": "opp-1", "agencyId": "agency-1", "customerId": CUSTOMER_ID,
            "destination": "Italia", "expectedValue": 28430, "stage": "PROPOSAL_SENT",
            "pipelineId": "pipe-1", "stageId": "stage-1", "createdAt": NOW, "updatedAt": NOW
        }]}))
    elif path.startswith("/api/commercial/interactions"):
        route.fulfill(**json_response({"total": 1, "interactions": [{
            "id": "int-1", "agencyId": "agency-1", "customerId": CUSTOMER_ID,
            "userId": "user-1", "channel": "WHATSAPP", "direction": "OUTBOUND",
            "summary": "Proposta enviada para familia", "occurredAt": NOW, "createdAt": NOW
        }]}))
    elif path.startswith("/api/commercial/tasks"):
        route.fulfill(**json_response({"total": 1, "tasks": [{
            "id": "task-1", "agencyId": "agency-1", "customerId": CUSTOMER_ID,
            "assignedUserId": "user-1", "createdBy": "user-1", "type": "FOLLOW_UP",
            "title": "Confirmar preferencias do hotel", "dueAt": "2026-09-10T12:00:00.000Z",
            "createdAt": NOW
        }]}))
    elif path == "/api/commercial/pipelines":
        route.fulfill(**json_response({"pipelines": [{
            "id": "pipe-1", "agencyId": "agency-1", "name": "Viagens internacionais",
            "active": True, "notificationsEnabled": True, "createdAt": NOW, "updatedAt": NOW
        }]}))
    elif path == "/api/commercial/pipelines/pipe-1/stages":
        route.fulfill(**json_response({"stages": [{
            "id": "stage-1", "agencyId": "agency-1", "pipelineId": "pipe-1",
            "name": "Proposta enviada", "sequence": 3, "colorKey": "BLUE",
            "visualLevel": "NORMAL", "active": True, "notificationsEnabled": True,
            "createdAt": NOW, "updatedAt": NOW
        }]}))
    elif path == "/customer-api/me":
        route.fulfill(**json_response({"profile": {"id": CUSTOMER_ID, "name": customer["name"], "email": customer["email"]}}))
    elif path == "/customer-api/trips":
        route.fulfill(**json_response({"trips": [trip]}))
    elif path == "/customer-api/offers":
        route.fulfill(**json_response({"offers": [{"id": "offer-1", "name": "Bariloche neve", "price": 18900, "status": "ACTIVE"}]}))
    elif path == "/customer-api/bookings":
        route.fulfill(**json_response({"bookings": [{"id": "booking-1", "isFuture": True, "tripName": "Cancun em familia"}]}))
    elif path == "/customer-api/proposals":
        route.fulfill(**json_response({"proposals": [{"id": "proposal-1", "total": 28430, "status": "SENT"}]}))
    elif path == "/customer-api/documents":
        route.fulfill(**json_response({"documents": [{"id": "doc-1", "type": "PASSPORT", "verificationStatus": "PENDING"}]}))
    elif path == "/customer-api/payment-schedule":
        route.fulfill(**json_response({"items": [{"id": "pay-1", "amount": 6000, "dueAt": "2026-10-10T12:00:00.000Z", "status": "OPEN"}]}))
    else:
        route.fulfill(**json_response({}))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    page.route("**/api/**", route_api)
    page.route("**/customer-api/**", route_api)

    targets = [
        ("customer-list", "/customers"),
        ("customer-360", f"/customers/{CUSTOMER_ID}"),
        ("customer-form", "/customers/new"),
        ("customer-portal-home", "/customer-portal"),
    ]

    for name, path in targets:
        page.goto(BASE_URL + path, wait_until="networkidle")
        page.screenshot(path=str(OUT / f"{name}.png"), full_page=True)

    browser.close()
