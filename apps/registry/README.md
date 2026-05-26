# NovaPay Plugin Registry (`@novapay/registry`)

This sub-project is the independently deployed Remote Plugin Registry service
for the NovaPay platform. It is **not** part of the NovaPay main application
runtime; it ships as its own Next.js + Prisma + PostgreSQL stack with its own
domain, database, and lifecycle.

For the full architecture, API contracts, data model, and phased rollout plan,
see:

- [`/.kiro/specs/remote-plugin-marketplace/design.md`](../../.kiro/specs/remote-plugin-marketplace/design.md)
- [`/.kiro/specs/remote-plugin-marketplace/requirements.md`](../../.kiro/specs/remote-plugin-marketplace/requirements.md)
- [`/.kiro/specs/remote-plugin-marketplace/tasks.md`](../../.kiro/specs/remote-plugin-marketplace/tasks.md)

## Status

Scaffolded by task **1.1** (Phase 1). Subsequent tasks will fill in the Prisma
schema, manifest parser, bundle pipeline, signing service, public API,
developer portal, license issuer, sandbox, and static-scan worker.

## Local development

> The repository root must already have its dependencies installed for shared
> tooling. This sub-project keeps its own `package.json` and is intended to
> run independently.

```bash
# from this directory (apps/registry)
npm install              # not run as part of task 1.1
npm run prisma:generate
npm run dev
```

## Scripts

| Script            | Purpose                                       |
| ----------------- | --------------------------------------------- |
| `dev`             | Run the Registry Next.js app in dev mode      |
| `build`           | Production build                              |
| `start`           | Start the production server                   |
| `lint`            | Run ESLint using `apps/registry/eslint.config.mjs` |
| `format`          | Format the codebase with Prettier             |
| `prisma:generate` | Generate the Prisma client                    |
| `prisma:migrate`  | Run `prisma migrate dev`                      |

## Layout

```
apps/registry/
  app/                  # Next.js App Router (admin + developer + public API)
  prisma/
    schema.prisma       # Registry-side Prisma schema (placeholder)
  next.config.ts
  tsconfig.json
  eslint.config.mjs     # Re-exports the repository-root ESLint config
  package.json
  README.md
```

## Relationship to the NovaPay main app

NovaPay consumes this Registry as its sole remote plugin marketplace.
The main app synchronizes catalog entries from the Registry, downloads signed
plugin bundles, and exposes approved plugins to merchants for installation and
channel configuration.
