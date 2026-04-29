# Streetz

Streetz is a prototype for a Nigerian-focused social membership platform with three core modules:

- Social discovery and dating-style matching
- Admin-created public chat rooms
- Admin-managed events and ticketing

## Stack

- Next.js frontend
- NestJS API
- PostgreSQL with Prisma
- Redis-ready infrastructure
- S3-compatible media storage
- Paystack payments
- AWS-ready deployment boundaries

## First Build Slices

1. Foundation: app shell, API health, configuration, Prisma schema
2. Auth and roles: users, admins, JWT, subscription status
3. Payments: Paystack subscription and event ticket webhooks
4. Profiles and discovery: photos, preferences, likes, passes, matches
5. Public chat rooms: admin-created rooms, real-time messages, moderation
6. Events and tickets: event CRUD, ticket purchase, QR/code validation

## Local Apps

```bash
npm run web:dev
npm run api:dev
```

Each app keeps its own dependencies under `apps/web` and `apps/api`.

## Local Services

```bash
docker compose up -d
npm --prefix apps/api run prisma:migrate
```

Local env files live at `apps/api/.env` and `apps/web/.env`.

The module-by-module roadmap lives in `docs/MODULE_ROADMAP.md`.
