/**
 * Height of a full-bleed chat panel (rooms, matches, support threads).
 *
 * On mobile the panel fills the viewport minus the two pieces of app chrome that
 * sit outside it: the sticky mobile header (89px -- `py-4` around a 56px logo,
 * plus its 1px border) and the bottom-nav clearance the app shell reserves on
 * its content section (`5rem` plus the safe-area inset). Getting this wrong is
 * what used to leave these "fixed height" screens scrolling a few pixels.
 *
 * On desktop the panel fills the available height beneath the 80px page header
 * and 64px of vertical padding. Short windows retain a usable minimum height.
 */
export const CHAT_PANEL_HEIGHT =
  "h-[calc(100dvh-89px-5rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-9rem)] md:min-h-96";
