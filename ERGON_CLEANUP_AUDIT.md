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

## Phase 21 audit and cleanup disposition

Phase 21 re-ran the repository identity and cleanup audit after `main` was fast-forwarded to the Phase 20 merge commit.

### Repository identity

| Field | Result |
| --- | --- |
| Local repository | `/Users/harshparmar/Desktop/Projects/Ergon` |
| Origin | `git@github.com:ParmarHarsh/Ergon.git` |
| Main SHA at branch point | `85057836158f212dd69ea213ecc1057fed893c05` |
| Phase 20 merged | Yes; `3032519b7b120ca1b2e2dcd1546afccbc4b4d504` is an ancestor of `main`. |

### Tracked-file brand audit

| Metric | Result |
| --- | ---: |
| Tracked files inspected | 129 |
| Text-readable files inspected | 129 |
| Non-text/binary files reviewed | 0 |
| Former-name filename matches | 0 |
| Former-name content matches found | 66 lines, all in historical audit/cleanup documents |
| Active former-name defects fixed | 0 |
| Valid historical former-name references preserved | 66 |
| External/path references preserved | Historical old-path and old-remote references only |
| Unresolved active former-name defects | 0 |

Classification summary:

| Classification | Count |
| --- | ---: |
| ERGON_ACTIVE_PRODUCT | 88 |
| ERGON_TECHNICAL_IDENTIFIER | 24 |
| NO_BRAND_REFERENCE | 11 |
| HISTORICAL_FORMER_NAME_REFERENCE_VALID | 4 |
| EXTERNAL_REMOTE_OR_PATH_REFERENCE | 2 |
| FORMER_NAME_ACTIVE_REFERENCE_MUST_FIX | 0 |
| BINARY_OR_NON_TEXT_REVIEWED | 0 |

Historical former-name references remain in `PROJECT_AUDIT.md`, `PILOT_INFRASTRUCTURE_AUDIT.md`, `PRODUCT_GAP_AUDIT.md`, and this audit because they document previous project names, old local paths, old remote names, and prior cleanup decisions.

### Cleanup candidate disposition

| Candidate | Phase 21 disposition |
| --- | --- |
| `PROJECT_AUDIT.md` | Kept as historical audit evidence. |
| `PILOT_INFRASTRUCTURE_AUDIT.md` | Kept as historical infrastructure evidence. |
| `PRODUCT_GAP_AUDIT.md` | Kept; merge remains a future docs-organization decision. |
| `DEPLOYMENT_READINESS.md` | Kept; merge remains a future docs-organization decision. |
| `PILOT_READINESS.md` | Kept. |
| `STAGING_INFRASTRUCTURE_RUNBOOK.md` | Kept. |
| `PILOT_DATA_POLICY.md` | Kept. |
| `INVESTOR_DEMO.md` | Kept; still requires current demo review before any merge/delete decision. |
| `ERGON_PRODUCT_STRATEGY.md` | Kept. |
| `ERGON_UX_PRINCIPLES.md` | Kept and updated with Phase 21 UX standard. |
| `ERGON_IDENTITY_STRATEGY.md` | Kept. |
| `ERGON_CLEANUP_AUDIT.md` | Kept and updated. |
| Top-level Markdown docs | Kept; no mass move or merge in this phase. |
| Old local root folder rename candidate | Completed externally before Phase 21: actual repository path is now `/Users/harshparmar/Desktop/Projects/Ergon`. Historical old-path references preserved. |
| Old GitHub repository rename candidate | Completed externally before Phase 21: actual origin is now `git@github.com:ParmarHarsh/Ergon.git`. Historical old-remote references preserved. |
| `tests/e2e/pilot-smoke.spec.js` | Kept and extended. |
| `/tmp` and `/private/tmp` local runtime paths | Not tracked; no source deletion performed. |
| `apps/web/dist` | Generated and ignored; no tracked deletion performed. |
| `node_modules` | Generated and ignored; no tracked deletion performed. |
| Workspace package names | Already completed in Phase 20 as `@ergon/*`; preserved. |

Final cleanup counts:

| Status | Count |
| --- | ---: |
| KEEP | 7 |
| SAFE_DELETE completed | 0 |
| MERGED | 0 |
| RENAMED | 3 |
| HISTORICAL_PRESERVE | 3 |
| REQUIRES_FURTHER_EVIDENCE | 3 |

No files were deleted in Phase 21 because no tracked file satisfied the complete safe-delete standard.
