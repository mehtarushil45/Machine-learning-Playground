# ML Playground Product Constitution

## 1. Product Identity & Quality Standards
- **Startup-Grade Platform**: ML Playground is a startup-grade ML platform, not a student project. Everything built must reflect production-grade rigor, scalability, and polish.
- **Uniqueness & Differentiation**: We aim to compete with the best ML platforms, but must NOT copy or mix their features into a generic platform. Product identity, uniqueness, and focused UX take precedence over feature parity.
- **Core Priorities**: Product identity, uniqueness, UX, ML correctness, reliability, and quality are strictly higher priority than sheer feature count.

## 2. ML Correctness & Rigor
- **No Silent Invalidity**: Never silently allow an invalid ML decision or configuration. Errors, invalid pipeline configurations, and unsupported data formats or parameters must be explicitly caught, validated, and reported.
- **Verification & Testing**: Never claim a feature is complete without verification and tests. Every pipeline, component, and model workflow must be demonstrably verified.

## 3. Architecture & Code Evolution
- **Inspect & Reuse**: Before changing code, inspect the existing architecture and reuse it where appropriate. Do not reinvent existing patterns or add redundant abstractions.
- **Preserve Working Functionality**: Preserve working functionality unless a change is intentionally approved.
- **No Monolithic Refactors**: Never perform a large refactor or implement an entire phase at once.
- **Smallest Safe Changes**: Prefer the smallest safe change that moves the product toward its strategic goal.

## 4. Incremental Engineering Workflow
Always work incrementally following the disciplined cycle:
**Audit** → **Plan** → **Implement** → **Test** → **Review** → **Commit**

1. **Audit**: Inspect existing state, architecture, and dependencies.
2. **Plan**: Formulate the smallest safe, high-impact increment before touching code.
3. **Implement**: Execute strictly within scope, avoiding unnecessary surface changes.
4. **Test**: Validate functionality, edge cases, and ML correctness.
5. **Review**: Ensure alignment with product identity, UX, and architectural integrity.
6. **Commit**: Finalize and document the change cleanly.

## 5. Technical Decision-Making & Investigation
- **Investigate When Uncertain**: When uncertain, investigate and report before implementing. Never make unverified assumptions.
- **Constructive Challenge**: Challenge product or technical decisions when evidence suggests a better approach, cleaner architecture, or superior user experience.
