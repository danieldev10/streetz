# First-batch local validation — 6 October 2026

Scope: this workspace with Node 22.13.0, an isolated PostgreSQL 15/PostGIS database and Redis 7.2.6 on loopback. No production data, payments, emails, AWS writes, or provider deployments were used. This is local evidence, not confirmation of hosted CI, alerts, backups, or staging provisioning.

| Check | Result |
| --- | --- |
| Prisma schema validation/generation | Passed |
| Existing migration history on a new database | All 57 applied |
| Mandatory API suite, including ticket/payment races, guest bookings and concurrent check-in | 67 passed; zero failures/skips |
| API/web lint and web type checking | Passed |
| API and web production builds | Passed |
| Operational script tests: target guards, stalled bodies, redirect/bypass handling and unhealthy routing | 4 passed |
| Full API process with sanitized configuration | Started; legacy/live/ready and guest public routes returned 200 |
| Temporary Redis outage | Readiness 503, liveness 200; recovered automatically |
| Temporary PostgreSQL outage | Readiness 503, liveness 200; recovered automatically |
| Long database query and concurrent readiness probes | Timed out within three seconds, with no queued probe backlog |
| Failed readiness response time in the full-process outage drill | Maximum observed 8 ms; local refusal/disconnection case only |
| API shutdown | SIGTERM completed within three seconds |

The mandatory suite exposed an outdated unread-room fixture which lacked event tickets. Its setup now reflects current event-room access, and additionally checks that an unticketed room is excluded. No production room permission was relaxed. The Redis test now waits for disconnect completion before asserting connection status.

## Encrypted local restore drill

Backup time: **2026-10-06 13:30:56 UTC**. Custom-format `pg_dump`, age 1.3.2 encryption/decryption, and `pg_restore --exit-on-error` into a new empty `template0` database.

Encrypted archive SHA-256: `f08435b30c3dbd2961c88249616af090764598c43c59ac52436884c125356863`.

Restoration and verification took **393 ms** for a tiny synthetic fixture, which does not establish production RTO. Verified all 57 migration records, PostGIS reads, equal source/restored counts for User/Event/Ticket/Payment, and one linked paid-ticket/successful-payment relationship across those tables. Decrypted bytes matched the original dump hash. Temporary restore database, fixtures, plaintext archive, encrypted archive and temporary identity were removed after verification.

Provider retention/PITR, encrypted off-provider storage, alert receipt, fresh GitHub runner execution, deployment gates, browser journeys and previous-deployment rollback remain pending. Complete [STAGING.md](../../STAGING.md)'s evidence checklist before marking the first batch operationally complete.
