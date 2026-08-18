# System Modules

## V1 Modules

| Module | Responsibility |
|--------|----------------|
| Auth | Authentication, session handling, current user context |
| Agency Core | Agencies, Users, Brokers, Customers, CustomerAccount |
| Commercial Core | Wish, Offer, Proposal, Sale, Commission, Trip |
| Dashboard | Basic operational metrics |

## Auth

Initial conceptual endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/register` | POST | Agency registration |
| `/auth/login` | POST | Login |
| `/auth/logout` | POST | Logout |
| `/auth/forgot` | POST | Forgot password |
| `/auth/reset` | POST | Reset password |
| `/auth/me` | GET | Current user |

## Agency Core

Initial conceptual endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/agencies/me` | GET | Current agency profile |
| `/agencies/me` | PUT | Update agency |
| `/users` | GET | List users |
| `/users` | POST | Create user |
| `/customers` | GET | List customers |
| `/customers` | POST | Create customer |
| `/brokers` | GET | List brokers |
| `/brokers` | POST | Create broker |

## Commercial Core

Initial conceptual endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/wishes` | GET | List wishes |
| `/wishes` | POST | Create wish |
| `/offers` | GET | List offers |
| `/offers` | POST | Create offer |
| `/proposals` | GET | List proposals |
| `/proposals` | POST | Create proposal |
| `/sales` | GET | List sales |
| `/sales` | POST | Register sale |
| `/trips` | GET | List customer trips |

## V1.1 / Future Modules

Booking is not a V1 module. ADR-004 classifies Booking as V1.1.

The future Pescador module is not part of V1 and must remain conceptually
separate from Offer until a dedicated decision/modeling step is approved.
