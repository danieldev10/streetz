# Sized table tickets

Admin → Events → Create/Edit has a Tables section with Table of 4, 5, 6, 8 and 10. Each size has a separate whole-table price, stock count and maximum tables per person. An empty price leaves that size off sale. Existing Early Bird, Regular and VIP settings continue to work; an event with no paid prices remains a free Regular event.

One purchase unit reserves one whole table. For example, two Table of 6 tickets at ₦100,000 each cost ₦200,000 and consume two tables from that size's stock. Capacity and ownership limits apply separately to each size. The existing limit of 20 units per checkout still applies.

Each purchased table has one QR/code. Its ticket PDF and staff scanner show the number of people admitted. The group checks in together once; separate or partial guest arrivals are not tracked. Repeated scans remain blocked. Event capacity, booked and ticket counts remain counts of purchase units; they are not a venue headcount when table tickets are included.

Old generic Tables offers and purchased tickets retain their IDs, prices and history. The generic row appears when editing an event that already has that option. No table size is guessed for historical tickets and no existing event prices are changed automatically. As before, offers with reservations or ticket history cannot be deleted by clearing their price.

TicketType already stores separate named offers, so no schema migration or new Railway/Vercel variable is needed. Both API and web must be deployed before an admin configures the new sizes. API and web regression tests cover create/edit round trips, name handling, independent limits, stock races, exact checkout amounts, PDFs and legacy compatibility.
