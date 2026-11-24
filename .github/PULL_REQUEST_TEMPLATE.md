## What this changes

<!-- One or two sentences. Link the issue it closes, e.g. "Closes #12". -->

## Why

<!-- What problem does this solve? If it changes tax logic, link the HMRC page
     the figures came from. -->

## Checklist

- [ ] `pnpm test` passes
- [ ] `pnpm run typecheck` passes
- [ ] `pnpm run build` passes
- [ ] Any money value added or changed is **integer pence**, not a float
- [ ] Tax rates / bands / thresholds cite an HMRC source above, and have a test
      pinning the expected figure
- [ ] New Prisma migrations are hand-authored SQL, applied with `migrate deploy`
- [ ] Docs updated (`README.md`, `.env.example`, or `docs/`) if behaviour or
      configuration changed

## Screenshots

<!-- For UI changes, please include light and dark mode. -->
