# Crushclub

Cruschclub (formerly: Streetz) is a Nigerian-focused social membership platform for paid community access, social discovery, public rooms, and event experiences.

## Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS
- Backend: NestJS, TypeScript
- Database: PostgreSQL with Prisma
- Realtime: Socket.IO with Redis adapter support
- Media: S3-compatible object storage with CDN-ready delivery
- Payments: Paystack
- Profile Verification: AWS Rekognition
- Infrastructure: Docker Compose for local Postgres and Redis

## Local Development

```bash
npm run web:dev
npm run api:dev
```

## Discovery

Discovery uses explicit, mutually confirmed preferences rather than inferring compatibility from sexuality. Members privately choose a matching gender, who they want to meet, and an age range. The feed applies mutual gender and age eligibility, account and safety gates, the viewer's distance limit, a deterministic relevance score, and two exploration slots. Impressions are analytics-only; only explicit likes, passes, blocks, and matches exclude profiles.

After pulling schema changes, apply migrations before starting the API:

```bash
npm run api:prisma:generate
npm --prefix apps/api run prisma:deploy
```

Existing profiles receive conservative suggested preferences but must confirm them before using Discovery.

Use `prisma:migrate` only while authoring a new migration against a disposable development database. Deployment, monitoring, smoke-test, and backup procedures are in [OPERATIONS.md](OPERATIONS.md).
