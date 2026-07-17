# Ergon UX Principles

## Phase 21 operating standard

One screen, one purpose, one obvious next action.

Visible product wordmark uses `ERGON`. Normal prose uses `Ergon`. Technical identifiers use `ergon`.

## Outcome-first, not module-first

Screens should be organized around manufacturer questions and outcomes: what to upload, what needs review, what gaps matter, what action comes next, and what proof can be produced.

## AI does the repetitive work

The interface should show Ergon as a workspace that reduces repetitive compliance work through ingestion, organization, classification, matching, prioritization, drafting, and packet assembly. When AI is disabled or not implemented, the UI must say so plainly.

## Progressive disclosure

Start with the decision a user needs to make. Keep expert detail, lineage, citations, confidence, and audit history available without making every screen feel like a database console.

Default pages should show summary first and expert detail second. Use drawers, native disclosure, compact filters, and focused details before adding more always-visible panels.

Evidence cards should expose one primary workflow state, the summary, the highest-priority findings, and the primary review decision first. Processing metadata, full provenance, weak AI candidates, lifecycle controls, and destructive or infrequent review actions remain available through labeled disclosure.

Provenance should be compact by default but complete on demand. Show the reference count and source scope, then a few source-supported priority anchors. Put the complete set in a labeled, keyboard-focusable, bounded scrolling surface that preserves line, row, page, paragraph, sheet, and cell-range locations. Never hide provenance or expand dozens of references into an unbounded default page.

## Plain language

Use manufacturing and compliance language that a plant manager, EHS lead, quality manager, or operations owner can understand. Avoid unnecessary internal terms.

## One clear primary action per screen

Each screen should make the next useful action obvious. Secondary actions should remain visible but not compete with the main task.

Home answers "What needs my attention today?" Evidence prioritizes "Add evidence." AI Review prioritizes "What decision does a human need to make?" Gaps & Actions prioritizes "What is missing and what should happen next?"

Every primary screen should have one dominant purpose, one clearly dominant first action, and no more than three first-attention elements competing above the fold.

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

Mobile uses a drawer navigation pattern with visible close control, Escape-to-close behavior, single-column content, reachable sign out, and no page-level horizontal overflow. Desktop uses grouped persistent navigation and a visible account/sign-out area. Tablet reduces columns before content becomes cramped.

Show exactly one obvious Sign out path in an active viewport state: the topbar account area on desktop and the contained account footer inside the open navigation drawer on mobile and tablet. Account actions must fit their surface without clipping, escape, or duplicate equivalents.

Tables may remain tables when relationships matter, but they must sit inside controlled scroll containers. Priority summaries should be card/list based before dense tables.

Preserve natural responsive wrapping. Use available content width and browser-native balanced or pretty wrapping for important headings and descriptions; do not force global nowrap rules or hardcoded line breaks. Dense tables should preserve readable columns inside local scrolling rather than compressing labels into word fragments.

Responsive quality is judged in the browser. A page can pass overflow checks and still fail if text, buttons, or status pills are visually clipped or squeezed into unreadable fragments.

Motion should clarify state changes, stay fast, and respect `prefers-reduced-motion`. Route content may use a restrained opacity transition around 180–220 ms without delaying data loading or animating the persistent sidebar.

Loading, empty, and error states should be finite and actionable: loading resolves to success, empty, unavailable, or error; empty states name the next step; errors explain recovery without exposing secrets.

## No fake automation claims

Do not imply live regulatory monitoring, real OCR, ERP integrations, external SSO, or AI processing unless those capabilities are actually configured and implemented.

## No overwhelming dashboards

Do not fill the first screen with decorative metrics. Show the few signals that help the user decide what to do next.
