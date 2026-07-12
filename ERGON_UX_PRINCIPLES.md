# Ergon UX Principles

## Outcome-first, not module-first

Screens should be organized around manufacturer questions and outcomes: what to upload, what needs review, what gaps matter, what action comes next, and what proof can be produced.

## AI does the repetitive work

The interface should show Ergon as a workspace that reduces repetitive compliance work through ingestion, organization, classification, matching, prioritization, drafting, and packet assembly. When AI is disabled or not implemented, the UI must say so plainly.

## Progressive disclosure

Start with the decision a user needs to make. Keep expert detail, lineage, citations, confidence, and audit history available without making every screen feel like a database console.

## Plain language

Use manufacturing and compliance language that a plant manager, EHS lead, quality manager, or operations owner can understand. Avoid unnecessary internal terms.

## One clear primary action per screen

Each screen should make the next useful action obvious. Secondary actions should remain visible but not compete with the main task.

## Show what needs attention

Home and work screens should prioritize review items, high-risk gaps, overdue actions, processing failures, and missing evidence.

## Explain why something matters

When Ergon shows a gap, risk, action, or review item, it should explain the business/compliance reason and the evidence behind it.

## Show provenance

Every material result should preserve sources, evidence lineage, AI suggestions, deterministic matches, and human decisions.

## Make uncertainty visible

Confidence, missing context, demo/unverified rules, disabled integrations, and human-review boundaries must be visible.

## Never trap the user in indefinite loading

Loading states must resolve to success, failure, unavailable, or actionable empty state. The user should never be left indefinitely at "Loading Ergon...".

## Empty states must teach

Empty states should explain what is missing, why it matters, and the safest next action.

## Errors must provide next action

Errors should be specific enough to help the user recover without exposing secrets or account existence.

## Sensitive/destructive actions require friction

Legal holds, deletion, archive, restore, security changes, and external representations require confirmation and audit trails.

## Keep expert detail available but not dominant

Regulatory citations, scoring logic, AI lineage, and audit evidence should be accessible, but the first layer should remain decision-friendly.

## Consistent terminology

Use Ergon, Home, Evidence, AI Review, Gaps & Actions, Action Plan, Audit Packs, Facilities, Team & Roles, Security, and System consistently.

## Accessible keyboard/focus behavior

Interactive controls must be reachable by keyboard, visibly focused, and labeled. Avoid keyboard traps in drawers, forms, and dialogs.

## Responsive design

The app should remain usable around 390px mobile, 768px tablet, and desktop widths. Tables may scroll horizontally, but primary actions and labels should remain usable.

## No fake automation claims

Do not imply live regulatory monitoring, real OCR, ERP integrations, external SSO, or AI processing unless those capabilities are actually configured and implemented.

## No overwhelming dashboards

Do not fill the first screen with decorative metrics. Show the few signals that help the user decide what to do next.
