/**
 * Height of a full-bleed chat panel (rooms, matches, support threads).
 *
 * On mobile the panel fills the viewport minus the two pieces of app chrome that
 * sit outside it: the sticky mobile header (89px -- `py-4` around a 56px logo,
 * plus its 1px border) and the bottom-nav clearance the app shell reserves on
 * its content section (`5rem` plus the safe-area inset). Getting this wrong is
 * what used to leave these "fixed height" screens scrolling a few pixels.
 *
 * On desktop the panel is a fixed 720px card (`h-180`) and the mobile chrome is
 * not rendered at all.
 */
export const CHAT_PANEL_HEIGHT =
  "h-[calc(100dvh-89px-5rem-env(safe-area-inset-bottom))] md:h-180";
