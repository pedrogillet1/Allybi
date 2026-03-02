# SSOT Migration Patch Plan
Generated: 2026-03-02 | Registry v4.0.1

---

## Prerequisites

Before executing any patches:
1. Ensure all tests pass on current main branch
2. Take a snapshot of `bank_registry.any.json` (v4.0.1)
3. Verify `unused_bank_audit.json` is current (last run: 2026-03-02)
4. Confirm no in-flight bank migrations or registry changes

---

## §1 Canonical Mirror Cleanup (29 files)

### Context
29 files on disk are domain-prefixed mirrors of canonical registered banks. They are NOT in the registry and should be removed to reduce confusion and disk clutter.

### Pre-flight Check
For each mirror, verify:
1. The canonical counterpart exists and is registered
2. No source code (`.ts`, `.js`) directly references the mirror file path
3. No other bank's `dependsOn` or `path` field references the mirror

### Patch Steps

**Step 1.1 — Grep for code references to mirror paths**
```bash
# Run from backend/
for mirror in \
  "legal/abbreviations/legal.en.any.json" \
  "legal/abbreviations/legal.pt.any.json" \
  "legal/doc_types/extraction/legal_board_resolution" \
  "legal/doc_types/extraction/legal_dpa" \
  "legal/doc_types/extraction/legal_employment_agreement" \
  "legal/doc_types/extraction/legal_msa" \
  "legal/doc_types/extraction/legal_nda" \
  "legal/doc_types/extraction/legal_privacy_policy" \
  "legal/doc_types/extraction/legal_sow" \
  "legal/lexicons/legal.en.any.json" \
  "legal/lexicons/legal.pt.any.json" \
  "medical/abbreviations/medical.en.any.json" \
  "medical/abbreviations/medical.pt.any.json" \
  "medical/lexicons/medical.en.any.json" \
  "medical/lexicons/medical.pt.any.json"; do
  echo "=== $mirror ==="
  grep -r "$mirror" src/ --include="*.ts" --include="*.js" || echo "(no references)"
done
```

**Step 1.2 — Delete unreferenced mirrors**
If no code references found:
```bash
rm src/data_banks/document_intelligence/domains/legal/abbreviations/legal.en.any.json
rm src/data_banks/document_intelligence/domains/legal/abbreviations/legal.pt.any.json
# ... (all 29 files)
```

**Step 1.3 — Add redirect aliases for referenced mirrors**
If code references ARE found, add alias entries to `bank_aliases.any.json`:
```json
{
  "alias": "<mirror_meta_id>",
  "canonicalId": "<canonical_bank_id>",
  "reason": "Migration from mirror file to canonical bank",
  "addedAt": "2026-03-02",
  "expiresInDays": 90
}
```

**Step 1.4 — Update `unused_bank_audit.json`**
Remove deleted mirrors from the canonical mirrors exclusion list.

### Rollback
Restore deleted files from git: `git checkout HEAD -- <paths>`

---

## §2 Domain Ontology Unification

### Context
Two domain ontologies exist as autonomous parallel definitions (Cluster 1, HIGH severity):
- `domain_ontology` (root): 10 parents, 54 subdomains, retrieval/formatting profiles
- `di_domain_ontology` (DI): 14 flat domains, bilingual labels, cross-domain links

### Option A — Keep Both, Add SSOT Markers + Cross-Validation (RECOMMENDED)

**Pros:**
- Non-invasive — no structural changes to either file
- Preserves separation of concerns (root handles retrieval profiles, DI handles DI enumeration)
- Can be implemented incrementally with zero runtime risk

**Cons:**
- Two files remain the "source" for domain taxonomy, requiring ongoing sync
- Developers must know which file to update for which purpose

**Patch Steps:**

**Step 2A.1 — Add SSOT role markers to domain_ontology**
```json
// In domain_ontology.any.json _meta:
"ssotRole": "root_taxonomy",
"ssotScope": "Domain hierarchy, retrieval profiles, formatting profiles, terminology hooks",
"ssotSibling": "di_domain_ontology"
```

**Step 2A.2 — Add SSOT role markers + dependency to di_domain_ontology**
```json
// In di_domain_ontology.any.json _meta:
"ssotRole": "di_enumeration",
"ssotScope": "DI-layer domain enumeration, bilingual labels, cross-domain links",
"ssotSibling": "domain_ontology",
"dependsOn": ["domain_ontology"]  // Currently empty — add this
```

**Step 2A.3 — Add bank_dependencies entry**
In `bank_dependencies.any.json`, find the `di_domain_ontology` entry and add:
```json
{"id": "di_domain_ontology", "dependsOn": ["domain_ontology"]}
```

**Step 2A.4 — Add cross-validation to runtimeWiringIntegrity.service.ts**
Add a new integrity check category `domainOntologyAlignment`:
```typescript
// Verify shared domain IDs match between root and DI ontologies
const rootDomains = getBank('domain_ontology')?.parents?.map(p => p.id) || [];
const diDomains = getBank('di_domain_ontology')?.config?.canonicalDomainIds || [];
const shared = rootDomains.filter(id => diDomains.includes(id));
// Warn if shared set changes (currently 7: banking, billing, insurance, medical, legal, accounting, finance)
```

**Step 2A.5 — Add the 7 DI-only domains to root ontology (optional, deferred)**
Consider adding `education, housing, hr_payroll, identity, ops, tax, travel` as subdomains under appropriate parents in `domain_ontology`. This unifies the domain ID set but requires careful retrieval profile assignment.

### Option B — Merge into Single File (NOT RECOMMENDED)

**Pros:**
- Single source of truth in one file
- No sync issues

**Cons:**
- Extremely invasive — every DI service references `di_domain_ontology` by ID
- Would require updating all 14 `domain_profile_*` banks
- Risk of breaking boot due to structural changes
- DI-specific fields (bilingual labels, crossDomainLinks) would bloat the root file

**Not recommended.** The separation of concerns is intentional and valuable.

### Rollback
Revert `_meta` changes in both ontology files and remove the dependency edge.

---

## §3 Deprecated File Cleanup (31 files)

### Context
31 files in `_deprecated/` directories across data_banks. Not registered. May contain code references.

### Patch Steps

**Step 3.1 — Inventory deprecated files**
```bash
find src/data_banks -path "*_deprecated*" -name "*.json" | sort
```

**Step 3.2 — Check for code references**
```bash
for f in $(find src/data_banks -path "*_deprecated*" -name "*.json"); do
  basename=$(basename "$f" .json)
  echo "=== $basename ==="
  grep -r "$basename" src/ --include="*.ts" --include="*.js" || echo "(no references)"
done
```

**Step 3.3 — Delete unreferenced deprecated files**
Files with zero code references can be safely deleted.

**Step 3.4 — Add migration aliases for referenced deprecated files**
Any deprecated file still referenced in code needs a migration alias pointing to its replacement.

### Rollback
Restore from git.

---

## §4 Quarantine Review (11 files)

### Context
11 files from the February 2026 memory audit in `_quarantine/2026-02-memory-audit/`:
- 4 schemas: `rich_message.schema`, `creative.schema`, `editing.schema`, `connectors.schema`
- 6 dictionaries: `editing_synonyms.{en,pt}`, `file_actions_synonyms.{en,pt}`, `connectors_synonyms.{en,pt}`
- 1 generation report

### Decision Matrix

| File | Action | Reasoning |
|------|--------|-----------|
| `rich_message.schema.json` | Review for promotion | May be needed for rich message validation |
| `creative.schema.json` | Review for promotion | Creative pipeline may need schema validation |
| `editing.schema.json` | Review for promotion | Editing pipeline exists and may benefit |
| `connectors.schema.json` | Review for promotion | Connector system exists |
| `editing_synonyms.{en,pt}` | Delete | Editing synonyms exist in registered banks |
| `file_actions_synonyms.{en,pt}` | Delete | File action synonyms covered elsewhere |
| `connectors_synonyms.{en,pt}` | Delete | Connector synonyms covered elsewhere |
| `__bank_generation_report` | Delete | Build artifact, no runtime value |

### Patch Steps

**Step 4.1** — Grep for references to quarantined schema names
**Step 4.2** — Promote schemas with references (register in bank_registry + checksums + dependencies)
**Step 4.3** — Delete unreferenced schemas and all dictionaries
**Step 4.4** — Delete generation report
**Step 4.5** — Remove `_quarantine/2026-02-memory-audit/` directory if empty

### Rollback
Restore from git.

---

## §5 Entity Schema Governance (172 files)

### Context
172 `.entities.schema.any.json` files exist on disk but are NOT in the bank registry. These are JSON Schema validation contracts for per-doctype entity extraction.

### Decision: Document as Schema Contracts Outside Bank System

Entity schemas are **intentionally outside** the bank system:
- They are consumed by the extraction pipeline as validation schemas, not as data banks
- They follow a `{doctype}.entities.schema.any.json` naming convention
- They are per-doctype, creating a 1:1 mapping with document types

### Patch Steps

**Step 5.1** — Add governance comment to `bank_registry.any.json` config:
```json
"entitySchemaPolicy": {
  "note": "172 .entities.schema.any.json files are intentionally outside the bank registry. They are JSON Schema validation contracts consumed by the extraction pipeline. Governed by di_entity_ontology for type definitions.",
  "count": 172,
  "canonicalOntology": "di_entity_ontology"
}
```

**Step 5.2** — Add a validation to `runtimeWiringIntegrity.service.ts` (optional):
Verify entity schema files match the 172 expected doc types. This prevents orphan schemas accumulating.

### Rollback
Remove config entry.

---

## §6 Registry & Manifest JSON Patches

### 6.1 bank_registry.any.json
- Add `entitySchemaPolicy` to config (Step 5.1)
- Bump version to `4.0.2`

### 6.2 bank_dependencies.any.json
- Add `dependsOn: ["domain_ontology"]` for `di_domain_ontology` (Step 2A.3)

### 6.3 bank_aliases.any.json
- Add redirect aliases for any code-referenced mirrors (Step 1.3, if needed)

### 6.4 bank_checksums.any.json
- Regenerate checksums for modified files after all patches applied

---

## §7 Rollback Plan

| Patch Section | Rollback Command |
|---------------|-----------------|
| Mirror cleanup | `git checkout HEAD -- src/data_banks/document_intelligence/domains/legal/ src/data_banks/document_intelligence/domains/medical/` |
| Domain ontology markers | `git checkout HEAD -- src/data_banks/semantics/domain_ontology.any.json src/data_banks/document_intelligence/semantics/domain_ontology.any.json` |
| Deprecated cleanup | `git checkout HEAD -- src/data_banks/` |
| Quarantine review | `git checkout HEAD -- src/data_banks/_quarantine/` |
| Registry patches | `git checkout HEAD -- src/data_banks/manifest/` |

**Full rollback:** `git checkout HEAD -- src/data_banks/ src/services/core/banks/runtimeWiringIntegrity.service.ts`

---

## §8 Deploy Readiness Checklist

- [ ] All 29 canonical mirrors verified: canonical counterparts exist, no code references
- [ ] Domain ontology SSOT markers added to both ontology files
- [ ] `di_domain_ontology` dependency on `domain_ontology` added to bank_dependencies
- [ ] Cross-validation integrity check added to runtimeWiringIntegrity
- [ ] Deprecated files with zero references deleted
- [ ] Quarantine schemas reviewed (promote or delete)
- [ ] Entity schema governance policy added to registry config
- [ ] bank_registry version bumped to 4.0.2
- [ ] Checksums regenerated for all modified banks
- [ ] Full test suite passes
- [ ] `unused_bank_audit.json` re-run and clean
- [ ] Runtime wiring integrity check passes with new categories
- [ ] No regressions in chat pipeline (manual smoke test)

---

## Cross-References

- **Conflict analysis:** `SSOT_CONFLICTS_AND_DUPES.md`
- **Master index:** `SSOT_MASTER_INDEX.md`
- **Canonical map:** `SSOT_CANONICAL_MAP.json`
- **Truth contract:** `SSOT_RUNTIME_TRUTH_CONTRACT.md`
- **Scorecard:** `SSOT_SCORECARD.md`
