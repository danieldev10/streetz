# Desktop preview: first pass

Prepared 17 October 2026 for review on `https://staging.crushclub.ng`.

## Included

- Guest, member, admin, and loading shells share a desktop frame up to 1440px
  wide, a persistent sidebar, a page header, and consistent content spacing.
- Member/admin account options open in a compact dropdown beneath the desktop
  account button. It closes on outside click, Escape, or focus leaving the menu;
  logout still requires confirmation. Mobile keeps its existing avatar drawer,
  header, and bottom navigation.
- Events use one column on narrow layouts, two from 960px, and three from
  1360px. Categories stay in one horizontally scrolling row, with previous/next
  buttons on desktop. The Events/Tickets/History controls are centered, and the
  event count sits immediately to the left of the location filter on that row.
  There is no introductory marketing heading. Card actions align at the bottom
  of each row.
- Event details place the full flier beside the event information from 1024px.
  Ticket actions stay in the top row and open the existing checkout modal.
- Discover uses an inline desktop toolbar for entering/withdrawing and opening
  filters/status, plus two profile columns from 1200px. The floating mobile
  buttons and existing pool/permission behavior remain in place.
- Existing desktop chat panels fit the height beneath the new header instead of
  using a fixed 720px height.

This pass does not introduce a split conversation-list/chat layout. Messaging,
rooms, profile forms, and admin page content can receive their dedicated desktop
layouts after review of this direction.

## Verification

The local browser checks use synthetic accounts, events, and API responses, with
external browser requests blocked. They exercise guest/member Events, event
details, checkout dialogs, and Discover at 320, 390, 768, 1024, 1440, and 1920px.
Checks include column layouts, readable card widths, horizontal overflow,
discovery controls staying clear of the sidebar, dialog closing, pool
withdrawal/re-entry, category scrolling/filtering, centered subtabs and count
alignment, and member/admin account menus (dismissal, focus restoration, logout
confirmation, and the mobile drawer). Screenshots were reviewed at phone and
desktop sizes.

Run the existing web checks before deployment:

```sh
npm --prefix apps/web run lint
npm --prefix apps/web run typecheck
npm --prefix apps/web run build
npm --prefix apps/web test
```

No database migration or provider-variable changes are required. Deploy the
preview to `staging` and retain it there for review before production promotion.
