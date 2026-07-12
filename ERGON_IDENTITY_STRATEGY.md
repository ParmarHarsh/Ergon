# Ergon Identity Strategy

## Current state

Ergon currently includes local password authentication, signed sessions, login throttling, account recovery, an SMTP recovery adapter, TOTP MFA, recovery codes, tenant isolation, role-based authorization, and audit logging.

These foundations are already useful for local development, closed testing, and future production hardening. They also express application-level concepts Ergon will still need even when external identity providers are added.

## Phase 20 decision

Phase 20 preserves the backend security foundations and stops expanding custom authentication as a near-term product priority.

The product focus shifts toward Ergon's manufacturing compliance mission: evidence ingestion, AI-assisted organization, review, gaps, actions, audit proof, provenance, and clearer UX.

In the primary UI, advanced auth features should be de-emphasized when disabled. Security remains accessible, but it should not dominate the product experience.

## Why we are not deleting the current security system

Deleting working authentication, sessions, recovery, MFA, RBAC, tenancy, or audit logging would remove safety foundations that the product still needs. Even with future Google or Microsoft sign-in, Ergon must still know which organization a user belongs to, which role they have, what tenant-scoped data they can access, and what actions they performed.

The existing foundations also protect local development and automated tests. They should be preserved until a standards-based identity replacement is designed, implemented, migrated, and proven.

## Why external SSO does not eliminate internal RBAC/tenancy/audit

External identity answers who the user is and how they authenticated. Ergon still must answer:

- which Ergon organization the user belongs to;
- which facilities and evidence they can access;
- whether they are an admin, reviewer, compliance manager, auditor, or executive;
- whether an action is tenant-scoped and authorized;
- what human decision was made;
- what audit event must be retained.

External SSO complements the internal authorization model. It does not replace it.

## Why custom auth should no longer be a near-term product priority

Custom auth work can consume product cycles without making manufacturing compliance easier. Ergon's near-term differentiation is not a proprietary login form. It is the ability to turn messy manufacturing evidence into traceable compliance work, reviewer decisions, prioritized gaps, and audit-ready outputs.

Future authentication work should be standards-based and customer-aligned rather than expanded custom flows.

## Future direction

Future identity phases should support:

- Google Workspace sign-in;
- Microsoft organizational sign-in;
- standards-based OIDC where appropriate;
- enterprise SSO where appropriate;
- customer domain/tenant mapping;
- just-in-time or admin-approved user provisioning;
- internal Ergon role assignment;
- preserved audit logging across identity providers.

## What Phase 20 does not implement

Phase 20 does not implement Google login, Microsoft login, OIDC, SAML, new MFA features, new account-recovery features, or new authentication dependencies.

## Local development posture

Safe local authentication remains available for development and acceptance testing. Synthetic local users and passwords may be used only in local/dev contexts and must not be treated as production credentials.
