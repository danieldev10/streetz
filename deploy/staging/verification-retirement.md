# Identity verification retirement

Identity liveness verification was removed on 25 October 2026. Get Verified is now a grey, disabled menu button labelled Coming soon. `/profile/verify` redirects to `/profile`; it does not load a camera, identity SDK or verification API.

The API no longer registers `/api/verification/me`, `/api/verification/face-liveness/session` or `/api/verification/face-liveness/result`. Each returns 404. Session, discovery, messaging and room responses omit identity verification status and badges. Photo replacement no longer changes identity-check results. Ordinary account/profile eligibility, age limits, subscriptions, payment verification and guest email codes retain their existing rules.

The web Amplify packages and API Rekognition package have been removed. CSP no longer permits the retired model, identity, streaming or STS endpoints or the WASM evaluation exception.

No migration or new variables are needed. Historical identity-check columns and attempt rows remain inert in the database to avoid a destructive data migration; the application neither creates nor consumes them. Existing verification image objects, buckets and IAM resources are not deleted by this release.

The following obsolete variables may be removed from Railway API/worker and Vercel settings; leaving them present cannot enable the retired feature or prevent startup:

- `FACE_VERIFICATION_MODE`, `FACE_VERIFICATION_REQUIRED`, `FACE_VERIFICATION_LIVENESS_THRESHOLD`, `FACE_VERIFICATION_FACE_MATCH_THRESHOLD`.
- `AWS_REKOGNITION_REGION`, `AWS_VERIFICATION_BUCKET`, `AWS_VERIFICATION_PREFIX`, `AWS_VERIFICATION_ACCESS_KEY_ID`, `AWS_VERIFICATION_SECRET_ACCESS_KEY`.
- Historical `FACE_VERIFICATION_BUCKET`, `FACE_VERIFICATION_PREFIX`, `FACE_VERIFICATION_ACCESS_KEY_ID`, `FACE_VERIFICATION_SECRET_ACCESS_KEY` aliases.
- `NEXT_PUBLIC_AWS_LIVENESS_IDENTITY_POOL_ID`, `NEXT_PUBLIC_AWS_REKOGNITION_REGION`.

Keep credentials, region, bucket and CDN settings used for media storage and uploads. Any later AWS cleanup must distinguish dedicated identity-check resources from those still serving profile photos and event images.

The API's `/api/health/live` endpoint is an infrastructure health probe and remains enabled; it is unrelated to identity verification.
