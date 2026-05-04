---
paths:
  - "api/**/*"
  - "src/api/**/*"
  - "server/**/*"
  - "backend/**/*"
  - "**/*route*.ts"
  - "**/*controller*.ts"
  - "**/*service*.ts"
---

# API Rules

## Purpose
This file governs how Claude should design, modify, and validate API-related code for the TAV-AIP project. Apply these rules whenever working on endpoints, handlers, services, integrations, auth, validation, or API-facing data contracts.

## Project intent
TAV-AIP APIs should be operationally safe, predictable, easy to debug, and consistent across endpoints. Favor explicitness, typed contracts, and small composable services over clever abstractions.

## Workflow
- Explore existing API patterns before adding new endpoints or changing contracts.
- Reuse established request/response shapes, auth middleware, error utilities, and validation helpers before introducing new ones.
- For non-trivial API changes, first identify affected routes, services, external integrations, and downstream consumers.
- After implementing API changes, run the narrowest relevant tests first, then broader verification only if needed.
- Do not change public request or response shapes unless the task explicitly requires it.

## Endpoint design
- Keep controllers/route handlers thin; move business logic into service-layer functions.
- One endpoint should do one clear job.
- Prefer idempotent behavior where appropriate, especially for sync, retry, webhook, and import operations.
- Use REST-style naming unless this codebase already uses a different established convention.
- Use nouns for resources and avoid action-heavy route names unless there is already a project pattern for them.
- Paginate any list endpoint that can grow materially.
- Always define filtering and sorting behavior explicitly; never leave it ambiguous.

## Request validation
- Validate all external input at the boundary.
- Never trust request body, query params, headers, or webhook payloads without validation.
- Coerce and normalize values explicitly, especially booleans, dates, enums, VINs, stock numbers, IDs, and phone numbers.
- Reject invalid input with consistent 4xx responses and actionable error messages.
- Keep validation schemas close to the endpoint or in the project’s standard validation layer.

## Response conventions
- Return consistent JSON response shapes across similar endpoints.
- Use stable field names; do not rename fields casually.
- Prefer camelCase JSON keys unless the existing API standard in this repo says otherwise.
- Include pagination metadata for paginated endpoints.
- Do not leak internal implementation details, stack traces, SQL, or vendor-specific raw errors in responses.
- For create/update flows, return the canonical saved record or the project-standard success envelope.

## Error handling
- Use the project’s shared error helpers/middleware if available.
- Distinguish validation errors, auth errors, not-found cases, conflict cases, rate limits, and unexpected server failures.
- Do not swallow errors; log them with enough context for debugging.
- Wrap third-party integration failures with meaningful internal context.
- Prefer deterministic error messages over vague messages like "Something went wrong."

## Auth and permissions
- Treat every endpoint as private unless explicitly documented as public.
- Check authentication and authorization separately.
- Enforce least privilege for admin, operations, and user-scoped actions.
- Never trust client-provided role or permission fields without server verification.
- If an endpoint exposes dealership, customer, vehicle, invoice, or user data, confirm scope before returning data.

## Data integrity
- Treat writes as high-risk operations.
- For create/update/delete actions, verify required identifiers and ownership/scope before mutating data.
- Avoid partial writes when a transaction or all-or-nothing flow is more appropriate.
- Be careful with deduplication logic around VINs, stock numbers, deal IDs, transport orders, and imported marketplace records.
- Preserve audit-relevant fields and timestamps unless the task explicitly changes them.

## External integrations
- Encapsulate third-party API calls in dedicated service modules.
- Add timeouts, retries, and defensive parsing when calling external systems.
- Do not assume vendor payload stability.
- Log integration failures with correlation context, but never log secrets or raw credentials.
- Preserve idempotency for sync jobs, webhook handlers, and import endpoints.

## Security
- Never hardcode API keys, tokens, passwords, webhook secrets, or phone numbers intended to remain private.
- Read secrets from the project’s approved env/config layer only.
- Sanitize logs so they do not expose PII, tokens, auth headers, or full payment/compliance payloads.
- Validate and constrain any URL, file, or webhook input before use.
- Guard against mass assignment; only persist explicitly allowed fields.

## Performance
- Avoid N+1 queries and repeated external API calls inside loops.
- Select only required fields for list endpoints and search results.
- Add indexes or query-shape notes when introducing expensive new filters.
- For operational dashboards and inventory views, optimize for predictable response times over theoretical elegance.
- Use background processing for long-running sync/import work when appropriate.

## TAV domain guidance
- VIN-related logic must preserve 17-character integrity and avoid silent mutation.
- Stock numbers, deal references, auction references, and internal unit identifiers must be treated as business-critical identifiers.
- Inventory state transitions should be explicit and traceable.
- Messaging/compliance flows must not bypass opt-in, audit, or regulatory safeguards.
- Financial, title, buyer, seller, and vehicle records require extra caution around scope, correctness, and auditability.

## File organization
- Routes/handlers define transport concerns.
- Services contain business logic.
- Data-access modules handle database or vendor persistence concerns.
- Validation schemas and API contracts should be centralized in the project’s standard location when reused across endpoints.
- Do not put large business workflows directly in route files.

## Testing
- Add or update tests for any meaningful endpoint behavior change.
- Test happy path, validation failure, auth failure, and at least one edge case.
- For bug fixes, write or update a test that reproduces the bug.
- Prefer focused API/service tests over broad end-to-end coverage unless the change crosses multiple layers.
- If changing a contract, verify existing consumers or document the breaking change clearly in code comments or adjacent docs.

## Change safety
- Before changing an API contract, search for all known callers, frontend consumers, automations, and webhooks that may depend on it.
- Prefer additive changes over breaking changes.
- If a breaking change is unavoidable, preserve backward compatibility where practical or isolate the change behind a versioned path/flag.
- Call out migration risk in your final summary of code changes.

## Output expectations
When making API changes, Claude should:
- Briefly state which endpoints/files are affected.
- Preserve existing conventions unless there is a clear project-level reason to improve them.
- Summarize any contract changes, migration risk, and required verification steps.