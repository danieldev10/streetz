# Appearance preview

The staging website supports Light, Dark and System under **My account → Change
Theme** (the profile/menu button on mobile). Guests and the login screen have a
sun/moon control in the top-right corner.

Light remains the default for new visitors. The choice is saved in this browser,
applies before the first paint, survives navigation and reloads, and syncs across
open tabs on the same domain. System follows changes to the device appearance.
If browser storage is unavailable, switching still works for the current page.
Staging and production preferences are separate because they use separate domains.

Dark mode uses the same layouts with charcoal/plum surfaces and purple accents.
Text, borders, inputs, status messages, navigation, dialogs, skeletons and chat
bubbles use semantic theme colours. Photos/flyers retain their original colours;
ticket QR canvases retain black modules on a white background.

Validation: web lint, typecheck, unit tests and production build; browser checks
at mobile and desktop sizes for guests, members and administrators, reloads,
multiple tabs, System changes, forms, checkout, tickets/QRs, profiles and chat.
This preview is published to staging only, pending design review.
