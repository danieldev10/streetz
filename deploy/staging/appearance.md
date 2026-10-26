# Appearance preview

The staging website supports Light, Dark and System under **My account → Settings
→ Appearance** (the profile/menu button on mobile). Guests and the login screen
have a settings control in the top-right corner. All theme choices live on the
dedicated `/settings` page, which is available to guests, members and admins.
Settings shows an Appearance row; selecting it opens a modal with the three
theme choices. The modal closes with its close button, Escape or the backdrop.

Light remains the default for new visitors. The choice is saved in this browser,
applies before the first paint, survives navigation and reloads, and syncs across
open tabs on the same domain. System follows changes to the device appearance.
If browser storage is unavailable, switching still works for the current page.
Staging and production preferences are separate because they use separate domains.

Dark mode uses the same layouts with charcoal/plum surfaces and purple accents.
Text, borders, inputs, status messages, navigation, dialogs, skeletons and chat
bubbles use semantic theme colours. Photos/flyers retain their original colours;
ticket QR canvases retain black modules on a white background.

The dark HTML/body canvas matches the mobile app surface (`#1d1822`) so Safari
does not pick up the darker desktop canvas for its surrounding areas. Light mode
keeps its white canvas. Safari still controls its own toolbar tint and materials;
the final status/address-bar appearance needs an on-device iPhone check.

Validation: web lint, typecheck, unit tests and production build; browser checks
at mobile and desktop sizes for guests, members and administrators, reloads,
multiple tabs, System changes, forms, checkout, tickets/QRs, profiles and chat.
This preview is published to staging only, pending design review.
