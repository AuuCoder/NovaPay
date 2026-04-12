# Security Policy

## Scope

This repository is intended to publish the NovaPay application framework, not production data or live credentials.

The public repository should contain only:

- application source code
- Prisma schema and migration files
- deployment and integration documentation
- example environment variables with placeholder values

The public repository must never contain:

- real `.env` files
- database dumps or local database files
- payment certificates, private keys, or platform public key bundles copied from production
- merchant production data, callback payloads, or audit exports
- screenshots, logs, or test fixtures that expose real account identifiers or secrets

## Responsible Disclosure

Before making this repository public, configure at least one private security reporting channel:

- GitHub Private Vulnerability Reporting
- a dedicated security mailbox such as `security@your-domain`

If a private reporting channel has not been configured yet, do not ask reporters to open public issues containing exploit details.

## Release Checklist For Public GitHub Repositories

Before the first public push, verify the following:

1. `.env`, `.env.local`, certificate files, key files, database files, dumps, and backup files are ignored by Git.
2. `.env.example` contains placeholders only and no real secrets.
3. Only `prisma/schema.prisma` and migration files are published for database structure. No data exports are included.
4. README, deployment docs, and sample commands use placeholder values instead of real credentials or internal endpoints.
5. The Git history does not contain previously committed secrets. If it does, rewrite history and rotate all affected credentials before publishing.
6. Merchant payment channel credentials remain merchant-managed and are never moved into platform environment variables for convenience.

## Secret Rotation

If any real secret has ever been committed locally or pushed to a remote repository, rotate it before publishing:

- database passwords
- `NOVAPAY_DATA_ENCRYPTION_KEY`
- bootstrap administrator passwords
- payment channel private keys and certificates
- merchant API credentials

## Repository Maintainer Guidance

Recommended first-public-release contents:

- `app/`
- `lib/`
- `prisma/`
- `scripts/`
- `tests/`
- `docs/`
- `.gitignore`
- `.env.example`
- `README.md`
- `SECURITY.md`
- package manager and build config files

Recommended exclusions:

- `.env`
- `.next/`
- `node_modules/`
- `generated/`
- local uploads or storage directories
- any file containing live merchant or payment-provider secrets
