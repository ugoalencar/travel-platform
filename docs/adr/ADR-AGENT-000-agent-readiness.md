# ADR-AGENT-000 — Agent Readiness: SAC / AI Agent Architecture Discovery

## Status

Proposed — Discovery

## Date

2026-08-18

## Scope

This document records the conceptual readiness assessment for future AI agent
and SAC (Customer Service via AI) capabilities in the Travel Platform. It is
NOT an implementation decision. It does NOT authorize agent development, SDK
installation, provider selection, or schema changes.

FUTURE CAPABILITY — NOT V1 IMPLEMENTATION.

---

## 1. Context

The Travel Platform may in the future support AI-driven agents for:

1. Customer SAC Agent — end-customer support
2. Agency Support Agent — agency staff operational assistance
3. Platform Operations Agent — platform health and monitoring
4. Engineering Agent — developer assistance (partially exists via opencode)

These agents have different trust levels, permission scopes, and autonomy
classifications. They must NOT be assumed to share the same authorization
model.

---

## 2. Central Principle

```
AGENT IS NOT A SECURITY BOUNDARY.
```

The AI model never decides its own authorization. All agent actions must pass
through deterministic, application-enforced controls.

Conceptual flow:

```
Agent
  ↓
Agent Gateway
  ↓
Guardian / Policy Enforcement
  ↓
Authorized Tool
  ↓
Application Service / API
  ↓
Authorization
  ↓
Tenant Context
  ↓
PostgreSQL / RLS
```

The Agent Gateway does NOT replace:

- authentication
- authorization
- RBAC
- resource ownership validation
- tenant context
- PostgreSQL RLS

---

## 3. Guardian / Policy Enforcement Layer (Future)

A Guardian layer must deterministically evaluate:

- authenticated principal
- tenant scope
- role and permission level
- requested tool identity
- requested operation type
- resource ownership (when applicable)
- risk level of the operation
- whether human approval is required

The AI model cannot grant permissions to itself. Authorization decisions are
made by the Guardian, not by the LLM.

---

## 4. Tool Model (Future)

Agents must operate through explicitly authorized tools. No unrestricted
direct database access is permitted.

```
NO UNRESTRICTED DIRECT DATABASE ACCESS.
```

Conceptual future tool examples (NOT implemented):

- `searchDocumentation` — public documentation lookup
- `getCustomerSummary` — authorized customer data retrieval
- `getProposalStatus` — proposal status query
- `getTripStatus` — trip status query
- `createSupportTicket` — ticket creation (reversible)
- `getIncidentDiagnostics` — read-only diagnostics

Each future tool must provide:

| Guarantee | Description |
|-----------|-------------|
| Input validation | Zod schema validation before execution |
| Authorization | Role check via `requireRole()` or equivalent |
| Tenant enforcement | `getAgencyId()` called within tool scope |
| Resource ownership | `validateResourceOwnership()` when applicable |
| Output filtering | Selective field extraction, no over-fetching |
| PII minimization | Mask sensitive fields based on agent type |
| Rate limiting | Per-tool invocation limits |
| Auditability | Logged: who, what, when, result |

---

## 5. Autonomy Levels (Future Classification)

### L1 — READ / ASSIST

Read-only operations. No data modification.

Examples:

- FAQ and documentation lookup
- Authorized data queries
- Read-only diagnostics
- Status checks

### L2 — REVERSIBLE ACTION

Actions that create or modify data but can be undone.

Examples:

- Create support ticket
- Add comment or note
- Create draft proposal
- Request reprocessing

### L3 — PRIVILEGED / HIGH IMPACT

Actions with significant or irreversible consequences.

Examples:

- Modify critical data
- Change permissions or roles
- Deploy or release
- Administrative operations
- Financial mutations

**L3 must require explicit human approval or equivalent strong control
mechanism.**

---

## 6. Customer SAC Agent — Public vs Authenticated

### Public Support

Example: "Como faço uma proposta?"

May use publicly authorized documentation. No authentication required.

### Authenticated Support

Example: "Qual é o status da minha viagem?"

Must require:

- authenticated identity
- authorization check
- tenant context
- resource ownership validation
- RLS enforcement

Identity must NEVER be inferred solely from conversation text. The agent
must resolve identity from a trusted authentication mechanism, not from
what the user types.

---

## 7. Tenant Isolation

All agent operations involving platform data remain TENANT-SCOPED.

The agent does not freely choose `agencyId`. Tenant must derive from
authenticated/authorized context.

Maintain:

- fail-closed behavior
- tenant-safe relationships
- authorization enforcement
- RLS as the final defense

Never weaken RLS to simplify agent integration.

---

## 8. PII / LGPD Considerations (Future)

When agents handle customer data:

- Data minimization: only retrieve required fields
- Purpose limitation: only use data for the stated purpose
- Least privilege: agent sees only what its role permits
- PII masking: mask CPF, email, phone in agent responses
- Output filtering: exclude sensitive fields from LLM context
- Retention control: agent interactions must be deletable
- Traceability: every PII access must be logged

PII must NOT appear unnecessarily in:

- LLM prompts or context windows
- application logs
- error messages
- distributed traces
- support transcripts

---

## 9. Prompt Injection Model (Future)

All external content is UNTRUSTED INPUT, including:

- user messages
- customer messages
- emails
- documents
- web pages
- content captured by Pescador
- external offers
- attachments

Instructions embedded in untrusted content MUST NOT alter:

- authorization decisions
- tenant scope
- tool permissions
- system policy
- approval requirements

Mitigations (conceptual):

- Separate user input from system prompts
- Mark external content with explicit prefix
- Tool calls validated by Guardian, not by LLM
- Sensitive data masked before entering LLM context
- Conversation history has maximum length

---

## 10. Pescador Interaction (Future Conceptual)

```
Internet / External Source
  ↓
Pescador (capture)
  ↓
Untrusted Content
  ↓
Review / Validation (human or controlled)
  ↓
Normalized Platform Data
```

Pescador usage of AI does NOT transform external content into trusted content.

Pescador does not receive additional privileges by being associated with
Agent Gateway.

All Pescador-captured content remains UNTRUSTED until validated.

---

## 11. Credential Management (Future Preference)

- Short-lived credentials
- Scoped authorization per tool invocation
- Revocable tokens
- Least privilege assignment

Never place secrets directly in LLM prompts.

Agents must not receive permanent administrative credentials.

---

## 12. Auditability (Future Requirement)

Before the first real agent is deployed in production, we must be able to
determine:

- which agent acted
- which user/principal it represented
- which tenant it operated in
- which tool was invoked
- what operation was performed
- when it occurred
- what the result was
- whether human approval was obtained (for L3)

**NOT creating an AuditLog entity now. NOT modifying Prisma. Only
recording this as a prerequisite requirement.**

---

## 13. Rate Limiting (Future Prerequisite)

Rate limiting must be active for Agent/SAC surfaces before the first
agent runs in production.

NOT implementing now. Recording as prerequisite.

---

## 14. Human Escalation (Future)

The Customer SAC Agent must have a path to human escalation when:

- confidence is low
- information is insufficient
- the customer explicitly requests it
- the question involves financial matters
- the question involves a complaint
- a security incident is detected
- the requested action is outside agent permissions

The agent must prefer escalation over inventing an answer or executing
an unauthorized action.

---

## 15. Agent Type Summary

| Agent Type | Trust Level | Autonomy | Tenant Scope | Key Constraint |
|------------|-------------|----------|--------------|----------------|
| Customer SAC | Low | L1 (read) | Own data only | No other customers' data |
| Agency Support | Medium | L1/L2 | Full agency | Matches human user's role |
| Platform Operations | High | L1/L3 | Cross-agency (metrics only) | No PII, no business data |
| Engineering | Variable | L2/L3 | None (code only) | No production tenant data |

---

## 16. Recommended Future Order (Non-Binding)

When agent capability is prioritized:

1. Customer SAC Agent — L1, read-only, lowest risk
2. Agency Support Agent — L1/L2, needs tool definitions
3. Platform Operations Agent — L1/L3, needs human approval
4. Engineering Agent — formalize existing opencode patterns

This order may be revisited when the capability is prioritized.

---

## 17. Prerequisites Before First Agent in Production

```
[ ] Auditability mechanism defined and implemented
[ ] PII masking / output filtering
[ ] Rate limiting
[ ] Guardian authorization model
[ ] Tool allowlist / registry
[ ] Human escalation path
[ ] Agent-specific security tests
[ ] End-to-end tenant isolation test (Agent → Guardian → Tool → Tenant Context → RLS)
```

Conceptual test requirement:

```
Agent → Guardian → Tool → Application → Tenant Context → Transaction → RLS
```

Must prove isolation between at least:

- Agency A
- Agency B

And fail-closed without authorized context.

---

## 18. Provider Neutrality

This document does NOT assume any specific AI provider:

- OpenAI
- Anthropic
- Google
- MiMo
- MCP
- or any other provider or protocol

The conceptual architecture must remain provider-neutral.

---

## 19. Impact on Current MVP

```
SCHEMA CHANGES NOW:     NONE
MIGRATIONS NOW:         NONE
DOMAIN CHANGES NOW:     NONE
RLS CHANGES NOW:        NONE
AGENT CODE NOW:         NONE
AI SDK NOW:             NONE
DEPENDENCIES NOW:       NONE
```

The MVP must preserve these properties for future agent compatibility:

- APIs authorize independently of the consumer
- Business rules do not live solely in the frontend
- Tenant identity does not come from the frontend freely
- Services can in the future be consumed by authorized tools
- Security continues to fail-closed

---

## 20. Future ADR Required

Before real agent implementation begins, a separate ADR must be created:

**ADR-AGENT-001: AI Agent Gateway / Guardian Architecture**

That ADR must decide:

- identity model
- authorization model
- tool protocol
- approval workflow
- provider abstraction
- observability
- auditability
- retention policy
- PII handling
- failure modes
- incident response
- cost controls
- model/provider strategy

ADR-AGENT-000 does NOT replace that future decision.

---

## 21. Current Foundation Advantages

The existing architecture already supports future agent integration:

| Advantage | Implementation | Status |
|-----------|----------------|--------|
| Tenant isolation | `AsyncLocalStorage` + RLS + transaction-scoped context | Working, tested |
| RBAC | 5 roles with `requireRole()` | Working |
| Fail-closed defaults | `getAgencyId()` throws, RLS returns zero rows | Working |
| Input validation | Zod available | Available |
| Structured errors | `TenantError`, `UnauthorizedError`, `ForbiddenError` | Working |
| Parameterized queries | `assertParameterizedTenantPredicate()` | Working |
| Error safety | `NotImplementedRepositoryError` leaks no PII | Working |

---

## 22. Design Constraints Now

| # | Constraint | Why It Matters |
|---|-----------|----------------|
| DC-1 | Audit trail entity needed | Agent actions must be traceable |
| DC-2 | Agent identity model | Impersonation vs. separate identity |
| DC-3 | PII masking layer | Agent responses must not expose raw PII |
| DC-4 | External content classification | Pescador content must be marked untrusted |
| DC-5 | Rate limiting infrastructure | Agents could flood the system |

---

## Consequences

### Positive

- Architecture is ready for future agent integration
- No blockers exist in current codebase
- Tenant isolation is solid and tested
- RBAC provides clear permission ceilings
- Fail-closed behavior prevents silent failures

### Negative

- Audit trail must be designed before first agent
- PII masking is a new capability not yet built
- Human approval workflow does not exist
- Tool abstraction layer must be created

### Trade-offs

- Deferring all agent work preserves MVP focus
- Documenting readiness now avoids architecture locks later
- Provider neutrality allows flexibility when capability is prioritized

---

## References

- `docs/03-security/security-model.md`
- `docs/03-security/tenant-isolation.md`
- `docs/03-security/authorization.md`
- `docs/03-security/threat-model.md`
- `docs/03-security/lgpd.md`
- `docs/01-architecture/architecture.md`
- `docs/02-domain/domain-model.md`
- `docs/adr/ADR-002-multitenancy.md`
- `docs/adr/ADR-003-authentication.md`
- `docs/adr/ADR-004-domain-modeling-wish-customer-sale-booking.md`
- `packages/domain/tenant-context.ts`
- `packages/domain/tenant-scoped-queries.ts`
