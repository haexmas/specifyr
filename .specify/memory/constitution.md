# specifyr Constitution

**Version**: 1.0.0 | **Ratified**: 2026-09-11 | **Status**: Active

## Core Principles

### I. Graph-first authoring (NON-NEGOTIABLE)

Before authoring a new named function, class, component, store, module, or CLI command, consult the project's Graphify knowledge graph and prefer extending an existing candidate. Borderline or overlapping candidates require operator review before authoring.

### II. Contract-preserving extraction

IST extraction must preserve stable node and edge identities, remain deterministic across repeated runs, and silently omit relationships that cannot be resolved within the walked repository. Changes to public model shapes require updated contracts and regression coverage.

### III. Test-first delivery

Behavior changes begin with focused failing tests, followed by the smallest implementation that makes them pass and a full regression run. Tests must cover supported inputs, rejected or unresolved inputs, and compatibility with existing imports and UI behavior.

### IV. Safe automation

Repository-controlled workflows may propose actions, but state-changing commands require explicit user confirmation. Extension hooks must use trusted registered commands and verifiable capability scopes; invalid, unregistered, or ambiguous requests are skipped without execution.

### V. Reviewable simplicity

Prefer the smallest cohesive change that satisfies the specification. Keep decisions and assumptions in the relevant design documents, avoid speculative abstractions, and require review before merging changes that affect extraction correctness or automation safety.

## Governance

This constitution governs SpecKit workflows and feature planning in specifyr. Amendments require a documented rationale, an updated version and ratification date, and review of affected templates, workflows, and active plans. Higher-priority repository and platform safety requirements remain binding.

## [SECTION_2_NAME]
<!-- Example: Additional Constraints, Security Requirements, Performance Standards, etc. -->

[SECTION_2_CONTENT]
<!-- Example: Technology stack requirements, compliance standards, deployment policies, etc. -->

## [SECTION_3_NAME]
<!-- Example: Development Workflow, Review Process, Quality Gates, etc. -->

[SECTION_3_CONTENT]
<!-- Example: Code review requirements, testing gates, deployment approval process, etc. -->

## Governance
<!-- Example: Constitution supersedes all other practices; Amendments require documentation, approval, migration plan -->

[GOVERNANCE_RULES]
<!-- Example: All PRs/reviews must verify compliance; Complexity must be justified; Use [GUIDANCE_FILE] for runtime development guidance -->

**Version**: [CONSTITUTION_VERSION] | **Ratified**: [RATIFICATION_DATE] | **Last Amended**: [LAST_AMENDED_DATE]
<!-- Example: Version: 2.1.1 | Ratified: 2025-06-13 | Last Amended: 2025-07-16 -->
