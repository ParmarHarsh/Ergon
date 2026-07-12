# Ergon Cleanup Audit

Phase 20 audited cleanup opportunities after the Ergon rename and UX reset. This document does not delete uncertain files. It records evidence and recommendations for a later explicitly scoped cleanup phase.

## Summary counts

| Status | Count |
| --- | ---: |
| KEEP | 7 |
| SAFE_DELETE_CANDIDATE | 1 |
| MERGE_CANDIDATE | 3 |
| RENAME_CANDIDATE | 4 |
| HISTORICAL_PRESERVE | 3 |
| REQUIRES_FURTHER_EVIDENCE | 3 |

## Candidates

| Path | Type | Evidence | References found | Risk of removal | Recommendation |
| --- | --- | --- | --- | --- | --- |
| `PROJECT_AUDIT.md` | historical audit log | Contains phase-by-phase history, former product name, local folder typo, and cleanup decisions. | Many direct references from prior phases. | High; deleting or rewriting would destroy traceability. | HISTORICAL_PRESERVE |
| `PILOT_INFRASTRUCTURE_AUDIT.md` | historical audit report | Captures Phase 15 infrastructure-readiness evidence and old remote/path context. | Referenced as readiness evidence; contains historical remote/path. | Medium. | HISTORICAL_PRESERVE |
| `PRODUCT_GAP_AUDIT.md` | current plus historical audit | Still useful for roadmap and gap evidence, but overlaps with new strategy docs. | Top-level tracked doc; Phase 20 updated active identity. | Medium. | MERGE_CANDIDATE |
| `DEPLOYMENT_READINESS.md` | deployment readiness | Current readiness summary overlaps with staging runbook and pilot readiness. | Top-level tracked doc. | Medium if moved without updating links. | MERGE_CANDIDATE |
| `PILOT_READINESS.md` | pilot checklist | Current checklist remains useful; pilot status remains `NO_GO`. | Top-level tracked doc. | Medium. | KEEP |
| `STAGING_INFRASTRUCTURE_RUNBOOK.md` | staging operations doc | Detailed staging setup remains useful and was updated to Ergon. | Top-level tracked doc. | Medium. | KEEP |
| `PILOT_DATA_POLICY.md` | pilot policy | Current safety and data-handling policy remains useful. | Top-level tracked doc. | Medium. | KEEP |
| `INVESTOR_DEMO.md` | demo script | Demo script is useful but should be reviewed against the new Home/navigation labels. | Top-level tracked doc, synthetic credentials updated. | Low. | REQUIRES_FURTHER_EVIDENCE |
| `ERGON_PRODUCT_STRATEGY.md` | product strategy | New Phase 20 strategy source of truth. | Created in Phase 20. | High; core strategy doc. | KEEP |
| `ERGON_UX_PRINCIPLES.md` | UX principles | New UX source of truth. | Created in Phase 20. | High. | KEEP |
| `ERGON_IDENTITY_STRATEGY.md` | identity strategy | New auth/identity strategy source of truth. | Created in Phase 20. | High. | KEEP |
| `ERGON_CLEANUP_AUDIT.md` | cleanup audit | New cleanup evidence and recommendations. | Created in Phase 20. | High. | KEEP |
| top-level Markdown docs | documentation hierarchy | Many top-level docs can overwhelm newcomers. | `README.md`, readiness docs, audits, strategy docs. | Medium; moves can break review context and links. | MERGE_CANDIDATE |
| `/Users/harshparmar/Desktop/Projects/ComplainceIQ` | local root folder | Folder remains misspelled and former-branded. User requested no active rename while Codex runs inside it. | Current working directory. | High during active work. | RENAME_CANDIDATE |
| GitHub repository `ParmarHarsh/ComplianceIQ` | external repository name | Remote remains former-branded until manual post-merge rename. | `git remote -v`. | High if automated now. | RENAME_CANDIDATE |
| `tests/e2e/pilot-smoke.spec.js` | browser smoke | Still named pilot smoke; behavior remains relevant. | `npm run qa:pilot`. | Low. | KEEP |
| `/tmp` and `/private/tmp` local runtime paths | generated local state | Local seeds/build smoke use temporary file repositories and storage. | Not tracked. | Low if removed manually after runs. | SAFE_DELETE_CANDIDATE only when generated locally; no tracked deletion in Phase 20. |
| `apps/web/dist` | generated static build output | Build output is generated and ignored. | `npm run build` creates it; ignored by git. | Low if ignored, high if accidentally tracked. | REQUIRES_FURTHER_EVIDENCE before any cleanup command |
| `node_modules` | dependency install output | Local install output, not source. | Ignored by git. | Low if removed locally, not a tracked source decision. | REQUIRES_FURTHER_EVIDENCE before local cleanup |
| workspace package names | package metadata | Renamed to `@ergon/*` in Phase 20 with lockfile metadata only; no dependency added. | `package.json`, package-lock. | Medium if external consumers existed; repository packages are private. | RENAME_CANDIDATE completed |

## Documentation hierarchy recommendation

Future documentation organization should be considered in a dedicated docs cleanup phase:

```text
docs/
  product/
  architecture/
  deployment/
  security/
  audits/
```

Do not mass-move historical documents in Phase 20. A later docs-organization PR should preserve links, update references, and keep `PROJECT_AUDIT.md` traceable.

## Cleanup decision

Audit now. Delete later only with explicit approved scope.
