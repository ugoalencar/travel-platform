from pathlib import Path
import json
from playwright.sync_api import sync_playwright

AGENCY_URL = "http://127.0.0.1:5195"
PLATFORM_URL = "http://127.0.0.1:5197"
OUT = Path("docs/visual-reconstruction-delivery/screenshots/final")
OUT.mkdir(parents=True, exist_ok=True)

NOW = "2026-09-08T12:00:00.000Z"
CUSTOMER_ID = "cust-1"
TRIP_ID = "trip-1"
SALE_ID = "d0d50001-0000-4000-8000-000000000009"

customer = {
    "id": CUSTOMER_ID,
    "agencyId": "agency-1",
    "name": "Mariana Alves Silva",
    "email": "mariana.silva@email.com",
    "phone": "+55 11 98765-4321",
    "cpf": "123.456.789-09",
    "passport": "FZ1234567",
    "status": "ACTIVE",
    "createdAt": "2022-03-12T10:00:00.000Z",
    "updatedAt": NOW,
}

trip = {
    "id": TRIP_ID,
    "agencyId": "agency-1",
    "customerId": CUSTOMER_ID,
    "name": "Cancun em familia",
    "destination": "Cancun, Mexico",
    "status": "CONFIRMED",
    "startDate": "2026-12-12T12:00:00.000Z",
    "endDate": "2026-12-19T12:00:00.000Z",
    "description": "Pacote familiar com resort, transfer e passeios.",
    "createdAt": NOW,
    "updatedAt": NOW,
}

booking = {
    "id": "booking-1",
    "agencyId": "agency-1",
    "bookerCustomerId": CUSTOMER_ID,
    "customerName": customer["name"],
    "tripId": TRIP_ID,
    "tripName": trip["name"],
    "tripType": "INTERNATIONAL",
    "cancelled": False,
    "createdAt": NOW,
    "updatedAt": NOW,
}

supplier_air = {
    "id": "sup-air",
    "agencyId": "agency-1",
    "name": "LATAM Airlines",
    "categories": ["AIRLINE"],
    "status": "ACTIVE",
    "createdAt": NOW,
    "updatedAt": NOW,
}

supplier_land = {
    "id": "sup-land",
    "agencyId": "agency-1",
    "name": "Cancun Receptivo Premium",
    "categories": ["TRANSFER", "HOTEL"],
    "status": "ACTIVE",
    "createdAt": NOW,
    "updatedAt": NOW,
}

air_service = {
    "id": "air-1",
    "agencyId": "agency-1",
    "tripId": TRIP_ID,
    "supplierId": supplier_air["id"],
    "customerId": CUSTOMER_ID,
    "airline": "LATAM",
    "direction": "OUTBOUND",
    "sequence": 1,
    "origin": "GRU",
    "destination": "CUN",
    "departureDate": "2026-12-12T00:00:00.000Z",
    "departureTime": "08:45",
    "arrivalDate": "2026-12-12T00:00:00.000Z",
    "arrivalTime": "16:10",
    "flightNumber": "LA2450",
    "cabinClass": "ECONOMY",
    "bookingLocator": "AB12CD",
    "ticketNumber": "9571234567890",
    "baggage": "1 mala 23kg",
    "seat": "18A",
    "fare": 4200,
    "taxes": 780,
    "fees": 320,
    "commission": 410,
    "cost": 4450,
    "saleValue": 5300,
    "currency": "BRL",
    "supplierDueDate": "2026-10-05T00:00:00.000Z",
    "supplierPaymentStatus": "OPEN",
    "status": "CONFIRMED",
    "notes": "Assentos juntos solicitados.",
    "createdAt": NOW,
    "updatedAt": NOW,
}

land_service = {
    "id": "land-1",
    "agencyId": "agency-1",
    "tripId": TRIP_ID,
    "supplierId": supplier_land["id"],
    "customerId": CUSTOMER_ID,
    "serviceType": "ACCOMMODATION",
    "description": "Resort all inclusive - 7 noites",
    "startDate": "2026-12-12T00:00:00.000Z",
    "endDate": "2026-12-19T00:00:00.000Z",
    "quantity": 7,
    "cost": 9800,
    "saleValue": 12800,
    "taxes": 450,
    "fees": 600,
    "commission": 1200,
    "currency": "BRL",
    "supplierDueDate": "2026-11-01T00:00:00.000Z",
    "supplierPaymentStatus": "PARTIALLY_PAID",
    "status": "CONFIRMED",
    "confirmationNumber": "HTL-90817",
    "notes": "Quarto familia vista mar.",
    "createdAt": NOW,
    "updatedAt": NOW,
}


def response(body, status=200):
    return {"status": status, "content_type": "application/json", "body": json.dumps(body)}


def agency_route(state):
    def route_api(route):
        path = route.request.url.replace(AGENCY_URL, "")
        if path == "/api/me":
            role = state.get("role", "ADMIN")
            route.fulfill(**response({"userId": "user-1", "agencyId": "agency-1", "role": role}))
        elif path == "/api/commercial/dashboard":
            route.fulfill(**response({
                "salesThisMonthTotal": 184900,
                "salesThisMonthCount": 18,
                "proposalsWaitingCount": 7,
                "upcomingTripsCount": 14,
                "followUpsDueTodayCount": 6,
                "overdueFollowUpsCount": 2,
                "pendingSalesCount": 4,
                "overdueReceivablesCount": 3,
                "openOpportunitiesCount": 23,
                "sentProposalsCount": 11,
                "acceptedProposalsCount": 5,
                "openProposalValueSum": 312400,
                "confirmedSalesCount": 12,
                "paidSalesCount": 9,
                "cancelledBookingsCount": 1,
                "pescadorReviewQueueCount": 5,
                "postSalePendingCount": 8,
            }))
        elif path.startswith("/api/commercial/travel-search"):
            route.fulfill(**response({
                "operational": [{
                    "bookingId": booking["id"],
                    "departureAt": "2026-09-08T18:30:00.000Z",
                    "originDestination": "GRU -> CUN",
                    "customerName": customer["name"],
                }],
                "commercial": [{
                    "tripId": TRIP_ID,
                    "startDate": trip["startDate"],
                    "destination": trip["destination"],
                    "customerName": customer["name"],
                }],
            }))
        elif path == "/api/commercial/proposals-waiting":
            route.fulfill(**response({"proposals": [{
                "id": "proposal-1",
                "customerId": CUSTOMER_ID,
                "customerName": customer["name"],
                "total": 28430,
                "notes": "Cancun familia - resort e aereo",
                "validUntil": "2026-09-20T00:00:00.000Z",
                "status": "SENT",
            }]}))
        elif path.startswith("/api/commercial/interactions"):
            route.fulfill(**response({"interactions": [{
                "id": "int-1",
                "agencyId": "agency-1",
                "customerId": CUSTOMER_ID,
                "userId": "user-1",
                "channel": "WHATSAPP",
                "direction": "OUTBOUND",
                "summary": "Voucher enviado e documentos conferidos",
                "occurredAt": NOW,
                "createdAt": NOW,
            }]}))
        elif path == "/api/operations/occurrences":
            route.fulfill(**response({"occurrences": [{
                "id": "occ-1",
                "agencyId": "agency-1",
                "tripId": TRIP_ID,
                "tripName": trip["name"],
                "customerName": customer["name"],
                "description": "Confirmar assento infantil com companhia",
                "status": "ABERTA",
                "createdAt": NOW,
                "updatedAt": NOW,
            }]}))
        elif path == "/api/financial/summary":
            route.fulfill(**response({"summary": {
                "dashboard": {
                    "expensesThisMonth": 98200,
                    "totalReceivable": 74600,
                    "overdueReceivable": 8400,
                    "payablesTotal": 39800,
                    "overduePayables": 2400,
                    "cashAvailable": 126500,
                    "committedCash": 31500,
                },
                "salesThisMonth": {"total": 184900, "count": 18},
                "expectedMargin": 47200,
                "recentPayments": [{
                    "id": "pay-1",
                    "customerName": customer["name"],
                    "description": "Entrada Cancun",
                    "amount": 12000,
                    "occurredAt": NOW,
                }],
                "upcomingReceivables": [{
                    "id": "rec-1",
                    "customerName": customer["name"],
                    "description": "Parcela Cancun",
                    "amount": 6000,
                    "dueAt": "2026-10-10T00:00:00.000Z",
                }],
            }}))
        elif path.startswith("/api/financial/sales/"):
            route.fulfill(**response({"story": {
                "saleId": SALE_ID,
                "customerName": customer["name"],
                "tripName": trip["name"],
                "grossSale": 32490,
                "received": 20490,
                "remainingReceivable": 12000,
                "margin": {"netMargin": 8200},
                "supplierPayables": [],
                "installmentSchedule": [],
            }}))
        elif path == "/api/customers":
            route.fulfill(**response({"customers": [customer]}))
        elif path == "/api/trips":
            route.fulfill(**response({"trips": [trip]}))
        elif path == "/api/bookings":
            route.fulfill(**response({"bookings": [booking]}))
        elif path == "/api/suppliers":
            route.fulfill(**response({"suppliers": [supplier_air, supplier_land]}))
        elif path.startswith("/api/air-services"):
            route.fulfill(**response({"airServices": [air_service]}))
        elif path.startswith("/api/land-services"):
            route.fulfill(**response({"landServices": [land_service]}))
        elif path == "/api/cost-centers":
            route.fulfill(**response({"costCenters": [{"id": "cc-1", "name": "Operacao", "active": True}]}))
        elif path == "/api/commission-plans":
            route.fulfill(**response({"commissionPlans": [{"id": "cp-1", "name": "Padrao vendas", "active": True}]}))
        elif path.startswith("/api/employees"):
            route.fulfill(**response({"employees": [{
                "id": "emp-1",
                "agencyId": "agency-1",
                "name": "Carla Mendes",
                "employmentType": "EMPLOYEE",
                "roleTitle": "Consultora senior",
                "department": "Operacao",
                "costCenterId": "cc-1",
                "status": "ACTIVE",
                "createdAt": NOW,
                "updatedAt": NOW,
            }]}))
        else:
            route.fulfill(**response({}))
    return route_api


def platform_route(route):
    path = route.request.url.replace(PLATFORM_URL, "")
    if path == "/api/platform/financial":
        route.fulfill(**response({"metrics": {
            "mrr": 94800,
            "arr": 1137600,
            "activeSubscriptions": 79,
            "trialCount": 12,
            "churnRate": 2.4,
            "cancelledSubscriptions": 3,
        }}))
    elif path == "/api/platform/analytics/subscriber-growth":
        route.fulfill(**response({"data": [
            {"month": "Abr", "count": 52},
            {"month": "Mai", "count": 59},
            {"month": "Jun", "count": 64},
            {"month": "Jul", "count": 70},
            {"month": "Ago", "count": 75},
            {"month": "Set", "count": 79},
        ]}))
    elif path == "/api/platform/analytics/mrr-evolution":
        route.fulfill(**response({"data": [
            {"month": "Abr", "mrr": 64000},
            {"month": "Mai", "mrr": 70500},
            {"month": "Jun", "mrr": 78200},
            {"month": "Jul", "mrr": 83600},
            {"month": "Ago", "mrr": 90100},
            {"month": "Set", "mrr": 94800},
        ]}))
    elif path == "/api/platform/analytics/lead-funnel":
        route.fulfill(**response({"data": [
            {"stage": "Leads", "count": 148},
            {"stage": "Demo", "count": 43},
            {"stage": "Trial", "count": 18},
            {"stage": "Cliente", "count": 9},
        ]}))
    elif path == "/api/platform/analytics/plan-distribution":
        route.fulfill(**response({"data": [
            {"planId": "starter", "planName": "Starter", "count": 31},
            {"planId": "growth", "planName": "Growth", "count": 35},
            {"planId": "enterprise", "planName": "Enterprise", "count": 13},
        ]}))
    elif path == "/api/platform/subscribers":
        route.fulfill(**response({"subscribers": [
            {"id": "agency-1", "status": "ACTIVE"},
            {"id": "agency-2", "status": "ACTIVE"},
            {"id": "agency-3", "status": "SUSPENDED"},
        ]}))
    elif path == "/api/platform/support":
        route.fulfill(**response({"cases": [
            {"id": "case-1", "status": "OPEN"},
            {"id": "case-2", "status": "IN_PROGRESS"},
        ]}))
    else:
        route.fulfill(**response({}))


def main():
    console_errors = []
    failed_requests = []
    unexpected_statuses = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        agency_state = {"role": "ADMIN"}
        agency = browser.new_page(viewport={"width": 1440, "height": 1000})
        agency.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        agency.on("requestfailed", lambda req: failed_requests.append(req.url))
        agency.on("response", lambda res: unexpected_statuses.append(f"{res.status} {res.url}") if res.status in [403, 500] else None)
        agency.route("**/api/**", agency_route(agency_state))

        agency_targets = [
            ("agency-dashboard", "/", "ADMIN"),
            ("finance", "/financial", "ADMIN"),
            ("air", "/operations/air", "ADMIN"),
            ("ground", "/operations/land", "ADMIN"),
            ("bookings", "/bookings", "ADMIN"),
            ("trips", "/trips", "ADMIN"),
            ("staff", "/", "AGENT"),
        ]
        for name, path, role in agency_targets:
            agency_state["role"] = role
            agency.goto(AGENCY_URL + path, wait_until="networkidle")
            agency.screenshot(path=str(OUT / f"{name}.png"), full_page=True)

        platform = browser.new_page(viewport={"width": 1440, "height": 1000})
        platform.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        platform.on("requestfailed", lambda req: failed_requests.append(req.url))
        platform.on("response", lambda res: unexpected_statuses.append(f"{res.status} {res.url}") if res.status in [403, 500] else None)
        platform.route("**/api/**", platform_route)
        platform.goto(PLATFORM_URL + "/", wait_until="networkidle")
        platform.screenshot(path=str(OUT / "platform-admin.png"), full_page=True)

        browser.close()

    report = {
        "console_errors": console_errors,
        "network_failures": failed_requests,
        "unexpected_403_500": unexpected_statuses,
    }
    (OUT / "browser-qa.json").write_text(json.dumps(report, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
