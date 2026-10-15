# QR tickets and event check-in staff

## Deployment

Deploy this release to staging first. The API pre-deploy command must run the existing `npm run prisma:deploy` step: migration `20261015120000_ticket_check_in_staff` adds event staff assignments and the optional staff reference on each checked-in ticket. No ticket codes or payment references are rewritten.

Deploy the API and worker with the new dependencies, then deploy the website. The worker generates QR tickets in confirmation-email PDFs. Keep the existing API/worker commands and environment variables. This feature does not need a QR subscription, additional AWS permissions, a new bucket, or a new secret.

An older API can run against the additive schema during rollout. Roll back code without dropping the new columns/tables if necessary.

## Using it

- Admin: open **Events → Scan tickets** for an event. Select **Open camera**, then scan the QR on a phone screen or printed ticket.
- Admin: **Events → Check-in staff** adds an existing account by email. Remove that assignment to revoke access. Admin accounts already have access to all events.
- Staff: log in at `/check-in` on the appropriate website (`staging.crushclub.ng/check-in` for testing, `crushclub.ng/check-in` for production), select an assigned event, and open the scanner. A paid membership or facial verification is not required for this task.
- The account-menu check-in link is visible only to admins. Assigned staff use the dedicated `/check-in` URL; ordinary accounts cannot open the check-in workspace or scan tickets.
- Each staff member should use their own account. The successful check-in records that account and the check-in time; repeated scans show the original record.
- After a result, select **Scan next ticket**. The scanner pauses between admissions so one QR cannot generate repeated requests from successive camera frames.
- **Enter code** remains available for camera failures, damaged QR images, and historical printed tickets. `STZ` and `CCL` tickets remain valid.

Customers see QR codes on confirmed ticket pages, guest booking confirmations, and newly generated ticket PDFs. Every individual admission ticket has its own QR. Existing email attachments cannot be changed, but downloading those tickets again produces PDFs with QR codes. Existing ticket emails are not automatically resent.

## Admission rules

The QR contains only the existing unique ticket code. No guest management token, email address, payment information, or executable URL is included. QR images are generated inside the application without an external image service or S3 storage.

The server checks the scanner's current account state and current event assignment, then locks the ticket while checking and updating it. Only confirmed/paid tickets for the selected published/completed event can be admitted. Cancelled events, wrong-event tickets, reserved/unpaid tickets, cancelled/refunded tickets and revoked staff access are rejected. Two API replicas cannot both record a first admission for the same ticket.

- Green: confirmed first admission.
- Amber: already checked in, with original time/staff. Do not admit a second person.
- Red: invalid ticket or access denied.
- Network uncertainty: admission is not confirmed. Retry the same ticket; do not assume success. A successful request whose response was lost may return “already used” on retry. The operator should reconcile the recorded staff/time before deciding whether the holder has already entered.

Scanning requires internet and a secure browser context. The current website already allows its own camera and decoder worker through Permissions Policy/CSP. The camera opens only after a staff action and closes when leaving the scanner. The scanner uses a JavaScript QR worker fallback where native BarcodeDetector support is unavailable.

Check-in has a shared Redis limit of 600 requests per minute per IP and route, allowing several staff devices on one connection. Revisit this measured limit if adding many gates or scanner automation. Guest QR possession does not grant staff access. QR screenshots can be copied: the live database prevents reuse, but cannot determine which holder of a copied ticket is its rightful owner.

## Verification

Automated coverage includes real QR decoding, PDF QR inclusion, current staff/account authorization, revocation, membership-independent staff access, audit preservation and competing scans through separate API processes. QR parsing rejects arbitrary links and oversized payloads.

Before production, verify on physical iPhone Safari and Android Chrome:

1. A free guest ticket, paid member ticket and multi-ticket order each display/download the correct individual QRs.
2. Scan from both another phone and paper, including dim light and a typical phone brightness level.
3. Two staff phones scan one ticket simultaneously: one admission succeeds and the other shows already used.
4. Wrong-event, reserved/unpaid, cancelled and refunded tickets are rejected. Revoking a logged-in staff member takes effect on the next request.
5. Camera denial offers manual entry. Closing the scanner releases the camera. Offline/timeout cases never show unconfirmed admission as success.
6. Guest tickets can be downloaded again using their existing private link. Old printed codes still work through manual entry.

Do not treat QR validity as identity or age verification.
