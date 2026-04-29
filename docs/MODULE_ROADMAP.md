# Streetz Module Roadmap

Build Streetz as vertical slices. Each slice should leave the prototype demoable and should include database shape, API contract, UI surface, and admin/user permissions.

## Slice 1: Foundation And Auth

Status: started

- Next.js web shell
- NestJS API shell
- PostgreSQL schema with Prisma
- Redis-ready local service
- User and admin roles
- JWT login/register endpoints
- Subscription status fields on users

## Slice 2: Subscription Payments

Goal: users cannot access member features without an active monthly subscription.

- Paystack plan/reference model
- Payment initialization endpoint
- Webhook verification endpoint
- Subscription activation and expiry logic
- Admin payment audit view

## Slice 3: Profiles And Discovery

Goal: users can create profiles, browse candidates, like/pass, and match.

- Profile CRUD
- Profile photo upload through S3 presigned URLs
- Discovery candidate feed
- Like/pass endpoint
- Mutual match creation
- Block/report safety actions

## Slice 4: Public Chat Rooms

Goal: admins create rooms and active subscribers participate in live public chats.

- Admin room CRUD
- WebSocket gateway
- Message persistence
- Join/leave events
- Mute, delete, ban moderation controls
- Redis pub/sub adapter for horizontal scaling

## Slice 5: Events And Tickets

Goal: admins publish events and users buy tickets.

- Event CRUD
- Ticket type inventory
- Paystack ticket checkout
- QR/code ticket issuance
- Check-in endpoint
- Refund/cancellation state handling

## Slice 6: Admin And Legal Readiness

Goal: make the prototype credible for lawyers and investors.

- User moderation queue
- Reports dashboard
- Data export/deletion workflow stubs
- Terms, privacy, refund, and safety policy pages
- Audit logs for admin actions
