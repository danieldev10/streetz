# Streetz

Streetz is a Nigerian-focused social membership platform for paid community access, social discovery, public rooms, and event experiences.

The product combines member profiles, status-based discovery, matching, direct messaging, public community spaces, subscriptions, and ticketed events behind a web-first experience.

## Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS
- Backend: NestJS, TypeScript
- Database: PostgreSQL with Prisma
- Realtime: Socket.IO with Redis adapter support
- Media: S3-compatible object storage with CDN-ready delivery
- Payments: Paystack
- Infrastructure: Docker Compose for local Postgres and Redis

## Architecture

Streetz is organized as a small monorepo:

- `apps/web`: Next.js application and user interface
- `apps/api`: NestJS API, Prisma schema, migrations, and service modules
- `docker-compose.yml`: local Postgres and Redis services

The browser talks to the NestJS API over HTTP and Socket.IO. The API owns authentication, subscription checks, profile and discovery rules, payments, media orchestration, and database access. PostgreSQL stores core application data, Redis supports realtime scaling, and object storage handles profile media.

## Local Development

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
