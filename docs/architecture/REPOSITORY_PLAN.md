# Repository plan

Use one pnpm workspace only when `contracts/` is added; otherwise retain a single application repository. The application is a modular monolith, organised by business domain rather than by framework type. Public contract ABI/types are generated into `packages/contracts` only after the contract is frozen.

See `docs/planning/IMPLEMENTATION_PLAN.md` for gates. No framework scaffold has been created in Phase 0.
