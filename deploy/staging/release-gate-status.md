# Release gate evidence — 8 October 2026

## Confirmed

- GitHub repository: `danieldev10/streetz`.
- `main` requires a pull request and an up-to-date, successful `Release checks` result from the GitHub Actions app (ID `15368`). Administrator enforcement is enabled; force pushes and branch deletion are disabled. No second reviewer is required for the current solo-owner workflow.
- The branch-protection settings were applied and independently read back through GitHub's API.
- The owner reports staging customer journeys working and Sentry alerts arriving by email. Exact tested API/web deployment SHAs have not yet been recorded.
- Staging web: `https://staging.crushclub.ng`; staging API: `https://crushclub-staging.up.railway.app`.

## CI is blocked before code executes

The [latest staging CI run](https://github.com/danieldev10/streetz/actions/runs/37700743207) is for commit `4d6a61aff26e218449f13c20380e448b9314832f`. GitHub's API and operational-job annotations both say:

> The job was not started because your account is locked due to a billing issue.

This is not a failing application test. The account owner must resolve the billing lock in GitHub account settings. No payment details or billing settings were changed during this work. Once unlocked, rerun the candidate branch's CI; if code errors then appear, fix them and run again. A green local run does not substitute for this hosted check.

## Railway dashboard steps

In **both** the staging and live projects, open the API service → Settings → Source and enable **Wait for CI**. Confirm the live service tracks `main` and staging tracks `staging`. Accept the Railway GitHub App's requested CI permissions if prompted.

Keep the existing pre-deploy certificate preparation/migration command and `/api/health/ready` deployment check. The workflow now finishes every push/dispatch CI run because Railway can allow a cancelled or skipped workflow to deploy; do not cancel required release runs manually.

Source: [Railway GitHub autodeploy documentation](https://docs.railway.com/deployments/github-autodeploys#wait-for-ci).

## Vercel dashboard steps

In **both** `crushclub` and `crushclub-staging`, open Settings → Deployment Checks → Add Checks → GitHub. Select **Release checks** as a required deployment check. Confirm the live project's Production branch is `main` and the staging project's Production branch is `staging`.

The staging project's Vercel Production tier serves staging users; it needs the gate too. Production builds may be created while CI runs, but their production domains must remain on the previous deployment until the check succeeds. If Deployment Checks are unavailable for the project, use deliberate promotion of a tested commit instead; do not claim provider gating is enabled.

Source: [Vercel Deployment Checks](https://vercel.com/docs/deployment-checks).

## Required proof before closing this item

1. A clean candidate runs all API, web and operational jobs on GitHub, with `Release checks` successful and zero skipped API tests.
2. A temporary, non-draft pull request containing an intentionally failing operational test has a failed `Release checks` result and GitHub reports it blocked from merging. Do not attempt a real merge. Close this proof PR afterward.
3. With staging's provider gates enabled, a staging-only failing commit must not replace the current Railway API or Vercel staging domain deployment. Record the failed CI run and the unchanged active deployment IDs. Restore the good staging commit without rewriting branch history and verify it can deploy.
4. Read back both live provider gate settings. Record the tested API/web SHAs and promote only an approved, passing release through the protected `main` branch.

Only GitHub branch protection is currently verified. Hosted passing CI, intentional failure proof, Railway Wait for CI, and Vercel Deployment Checks remain pending; no production deployment or failure drill has been performed.
