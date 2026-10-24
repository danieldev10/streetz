# Social discovery

Discover now helps members find people to socialize with. There is no mandatory age/gender preference setup or reciprocal demographic matching.

## Controls and eligibility

Members choose their state, set their current status, and enter or withdraw from the pool. Changing status refreshes the suggestions automatically. Gender and sexuality are optional profile details; gender visibility can be changed in Edit Profile.

Discover, individual profile viewing, and new message requests require:

- An active user account and unexpired, active membership.
- A complete profile: an adult birth date, bio, city/state, status, interests, and a profile photo.
- Pool visibility. Both participants must be in the pool for a new message request.
- The same selected state, compared without case sensitivity.
- No block in either direction or closed/declined/unmatched/blocked conversation between the two members.

Withdrawing does not close existing conversations. Existing request limits and recipient acceptance remain in place.

Identity liveness verification has been retired. Get Verified is a disabled Coming soon menu item. Discovery eligibility, profile viewing, messaging, photo changes and badges do not use historical verification results. The old verification endpoints no longer exist and old verification links redirect to Profile. No face verification settings or identity SDKs are required. See [retirement notes](verification-retirement.md).

Guests still see a limited preview with only basic card fields and a thumbnail. It uses the same account/profile eligibility, without requiring preferences. Guests cannot send requests or access full member profiles. Guest preview has no viewer-specific ranking or block history.

## Suggestions

Profiles in the selected state are ordered by a simple score:

| Signal | Weight | Behavior |
| --- | --- | --- |
| Shared interests | 40% | Up to three distinct overlaps; case and surrounding spaces are ignored. |
| Status | 25% | Same status scores highest; Open to Anything gives a partial match. |
| Recent Discover activity | 15% | Gradually decreases over 30 days. |
| New account | 10% | Gradually decreases over 14 days. |
| Variety | 10% | A reproducible daily value for each viewer/profile pair. |

These signals only change ordering. Having different interests or statuses never removes an otherwise eligible adult. Age, gender, sexuality, photo count, and bio length are not relevance signals. The algorithm identifier is `social-v1`.

The member list ranks in PostgreSQL and returns 20 profiles per page. It can browse beyond the former 100-profile cap while loading photos/details only for the current page. Legacy candidate decks retain their bounded nearby/exploration behavior and use the social score.

## Compatibility and rollout

No database migration or new environment variables are required. The existing preference table and endpoints remain for cached clients and rollback; `needsConfirmation` is always false, and saved age/gender preferences have no effect on eligibility or ranking. The new website removes the preferences form and menu entry.

Deploy the API before the website on staging, then verify a newly created member can finish setup, open Discover automatically, view a profile, send one introduction, change status/state, load another page, and withdraw/re-enter. Verify guest preview and a previously saved restrictive preference as well. Promote through the normal CI and staging gates.

`apps/api/test/social-discovery-integration.test.js` exercises real PostgreSQL ranking, more than 100 eligible profiles, legacy PostGIS discovery, preference-free introductions, privacy, pagination, and the safety exclusions. Run it through `npm run test:ci` with the disposable database and Redis described in the CI setup. Website lint, types, tests, and production build must also pass.

Ordering reflects current activity and eligibility. A profile that leaves the pool can invalidate an existing cursor; refresh starts a new search. Daily variety and profile/activity changes can also move suggestions during browsing.
