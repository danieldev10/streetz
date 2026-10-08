# Release gate evidence — 8 October 2026

## Confirmed

- GitHub repository: `danieldev10/streetz`.
- `main` requires a pull request and an up-to-date, successful `Release checks` result from the GitHub Actions app (ID `15368`). Administrator enforcement is enabled; force pushes and branch deletion are disabled. No second reviewer is required for the current solo-owner workflow.
- The branch-protection settings were applied and independently read back through GitHub's API.
- The owner reports staging customer journeys working and Sentry alerts arriving by email. Exact tested API/web deployment SHAs have not yet been recorded.
- Staging web: `https://staging.crushclub.ng`; staging API: `https://crushclub-staging.up.railway.app`.

## Hosted CI passed

The owner resolved GitHub's billing restriction on 8 October 2026. The candidate at commit `60dfd75e5816a49c946e1659b23dfc8c105f1bd8` then passed both the [push CI run](https://github.com/danieldev10/streetz/actions/runs/37743865295/attempts/2) and the [pull-request CI run](https://github.com/danieldev10/streetz/actions/runs/37743875493/attempts/2), completing at 07:44 UTC:

- API: Prisma validation/generation, all 57 migrations applied to disposable PostgreSQL/PostGIS, lint/build, and 67 tests passed with zero failures or skips.
- Web: lint, TypeScript checks and the Next.js production build passed.
- Operational checks: all four tests passed.
- The aggregate `Release checks` job succeeded in both runs.

Earlier runs failed before jobs started because of the account restriction. The completed reruns above supersede that blocker. No billing settings were changed during this work.

## Failed-check merge block demonstrated

[Temporary proof PR #5](https://github.com/danieldev10/streetz/pull/5), at commit `62cec9ea1c319a9b90ed5cc84df7444b016e6c33`, added one intentionally failing operational test. The [push run](https://github.com/danieldev10/streetz/actions/runs/37743395818/attempts/2) and [pull-request run](https://github.com/danieldev10/streetz/actions/runs/37743478050/attempts/2) executed it on GitHub:

- API and web checks passed; the four normal operational tests passed.
- The temporary fifth test failed with `ERR_ASSERTION`: `Expected gate-proof failure: Release checks must prevent this branch from merging.`
- `Release checks` failed because the operational job failed.
- GitHub reported `isDraft=false`, `mergeable=MERGEABLE` (no conflicts), and `mergeStateStatus=BLOCKED`, with both required-check results completed and failed. A draft restriction or merge conflict did not cause the block.
- No merge was attempted. After capturing this evidence, PR #5 was closed and its remote branch deleted. The intentional failure is absent from the candidate.

Main's required check, strict up-to-date requirement, pull-request requirement and administrator enforcement were independently read back after the drill. This proves the GitHub merge gate; it does not prove Railway or Vercel deployment gates.

## Railway dashboard steps

In **both** the staging and live projects, open the API service → Settings → Source and enable **Wait for CI**. Confirm the live service tracks `main` and staging tracks `staging`. Accept the Railway GitHub App's requested CI permissions if prompted.

Keep the existing pre-deploy certificate preparation/migration command and `/api/health/ready` deployment check. The workflow now finishes every push/dispatch CI run because Railway can allow a cancelled or skipped workflow to deploy; do not cancel required release runs manually.

Source: [Railway GitHub autodeploy documentation](https://docs.railway.com/deployments/github-autodeploys#wait-for-ci).

## Vercel dashboard steps

In **both** `crushclub` and `crushclub-staging`, open Settings → Deployment Checks → Add Checks → GitHub. Select **Release checks** as a required deployment check. Confirm the live project's Production branch is `main` and the staging project's Production branch is `staging`.

The staging project's Vercel Production tier serves staging users; it needs the gate too. Production builds may be created while CI runs, but their production domains must remain on the previous deployment until the check succeeds. If Deployment Checks are unavailable for the project, use deliberate promotion of a tested commit instead; do not claim provider gating is enabled.

Source: [Vercel Deployment Checks](https://vercel.com/docs/deployment-checks).

## Remaining provider proof

1. Read back Railway's Wait for CI and Vercel's Release checks settings for both live and staging projects. These dashboards have not been accessible through this session.
2. With staging's provider gates enabled, a staging-only failing commit must not replace the current Railway API or Vercel staging domain deployment. Record the failed CI run and the unchanged active deployment IDs. Restore the good staging commit without rewriting branch history and verify it can deploy.
3. Record the tested API/web deployment SHAs and promote only an approved, passing release through the protected `main` branch.

Hosted passing CI and the intentional GitHub merge-block proof are complete. Railway Wait for CI, Vercel Deployment Checks and the staging provider failure drill remain unverified; no production release has been performed.

## Candidate and isolated proof

- [Candidate PR #4](https://github.com/danieldev10/streetz/pull/4) contains the initial reliability batch, CI concurrency change and evidence. It has not been merged or deployed to `main`/`staging` by this work. Subsequent candidate commits, including evidence updates, must also pass CI before merging.
- [Proof PR #5](https://github.com/danieldev10/streetz/pull/5) is closed and was never merged. Its run history retains the deliberately failed check and the proof assertion.
- Local operational tests and workflow structure validation passed before hosted execution. See [local-validation.md](local-validation.md) for the first batch's earlier local database, health and recovery checks.
