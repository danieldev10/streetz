# Release gate evidence — 8 October 2026

## Confirmed

- GitHub repository: `danieldev10/streetz`.
- `main` requires a pull request and an up-to-date, successful `Release checks` result from the GitHub Actions app (ID `15368`). Administrator enforcement is enabled; force pushes and branch deletion are disabled. No second reviewer is required for the current solo-owner workflow.
- The branch-protection settings were applied and independently read back through GitHub's API.
- The owner reports staging customer journeys working and Sentry alerts arriving by email. GitHub's provider records identify the staging baseline as `4d6a61aff26e218449f13c20380e448b9314832f`. A later cleanup commit with an identical source tree also passed CI and deployed, as recorded below.
- Staging web: `https://staging.crushclub.ng`; staging API: `https://crushclub-staging.up.railway.app`.
- The owner reports enabling Railway Wait for CI and Vercel Release checks for both live and staging projects. The supplied Vercel staging screenshot shows the GitHub `Release checks` entry scoped to its Production environment.

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

The owner reports **Wait for CI** enabled in both projects. Its location is API service → Settings → Source. Confirm the live service tracks `main` and staging tracks `staging`; accept the Railway GitHub App's requested CI permissions if prompted. The staging drill's dashboard skip reason is still awaiting confirmation.

Keep the existing pre-deploy certificate preparation/migration command and `/api/health/ready` deployment check. The workflow now finishes every push/dispatch CI run because Railway can allow a cancelled or skipped workflow to deploy; do not cancel required release runs manually.

Source: [Railway GitHub autodeploy documentation](https://docs.railway.com/deployments/github-autodeploys#wait-for-ci).

## Vercel dashboard steps

The owner reports the check added in **both** `crushclub` and `crushclub-staging`. Its location is Settings → Build and Deployment → Deployment Checks → Add Checks → GitHub. Select **Release checks** as a required deployment check. The owner used **Show All Checks** to find it; no specific SHA was needed for discovery. Confirm the live project's Production branch is `main` and the staging project's Production branch is `staging`.

The staging project's Vercel Production tier serves staging users; it needs the gate too. Production builds may be created while CI runs, but their production domains must remain on the previous deployment until the check succeeds. If Deployment Checks are unavailable for the project, use deliberate promotion of a tested commit instead; do not claim provider gating is enabled.

Source: [Vercel Deployment Checks](https://vercel.com/docs/deployment-checks).

## Staging deployment drill

The drill used only `staging`. `main` remained at `545bd0fbb2919ccba48aaf9ddc24337c580e62a0`; production was not released.

1. **Baseline:** [staging CI attempt 2](https://github.com/danieldev10/streetz/actions/runs/37700743207/attempts/2) passed at `4d6a61aff26e218449f13c20380e448b9314832f`. The direct API and web-to-API readiness endpoints returned 200, and public smoke checks passed. GitHub provider statuses identified Railway deployment `30d6bf19-d6c0-4750-b377-619ff9a58cb1` and Vercel staging deployment `7uhNjSYcnmfkLnmnVnEj7k6bHjw5`.
2. **Deliberate failure:** commit `9ccb4c5e8b87427b350d028741149bcc54da81b8` added one failing operational test and harmless detection markers in both app directories. The [CI run](https://github.com/danieldev10/streetz/actions/runs/37755305941) passed API/web jobs and failed only the intentional operational assertion and aggregate Release checks. Vercel reported **Checks for Deployment have failed** for [staging deployment EZ1aM1oNRSTRPMS7Aruuq61GMXBh](https://vercel.com/tankos-projects-45b0e324/crushclub-staging/EZ1aM1oNRSTRPMS7Aruuq61GMXBh). GitHub deployment record `6931725560` also reported that failure.
3. **Existing staging stayed healthy:** at 10:16:58 WAT on 8 October 2026, both readiness endpoints returned 200 without the new `X-Crushclub-Gate-Proof` header; the new public marker URL returned 404. Thus neither test marker was served by the canonical staging endpoints while the failed commit was the branch head.
4. **Railway reporting limitation:** GitHub deployment record `6931696679` became inactive at 10:16:18 WAT, before the cleanup push. Its commit status nevertheless said Success and linked Railway deployment `af5134af-f10f-41be-bfdf-4f99bee06ffb`. The API marker was absent, but these GitHub records do not disclose the skip reason. The owner was asked to confirm this deployment says **Skipped because CI failed** in Railway. That confirmation remains pending.
5. **Cleanup and positive release:** revert commit `139b89a8dd1818595d685d96bf5e838715e6a702` removed all three temporary changes. Its complete tracked source tree is identical to the baseline, verified with `git diff --exit-code`. Its [CI run](https://github.com/danieldev10/streetz/actions/runs/37755678437) passed every job. Vercel first reported **Waiting for checks to complete**, then success for [staging deployment 3Tq31WbJ5pHKaMWK2ubgGUUjmqh1](https://vercel.com/tankos-projects-45b0e324/crushclub-staging/3Tq31WbJ5pHKaMWK2ubgGUUjmqh1). Railway reported success for deployment `613c823e-88ad-4ad1-a2aa-a461756dde02`. The restored staging readiness, marker absence and public smoke checks passed.

The failed test and markers exist only in the drill's history; they are absent from the current staging source and from PR #4. Cleanup preserved branch history rather than force-pushing it away. The local staging branch was fast-forwarded to the cleanup commit with all pre-existing uncommitted work preserved.

## Remaining release work

- Confirm Railway's failed-commit deployment skip reason. Vercel's staging rejection and subsequent passing release have been demonstrated; Railway's prior API stayed healthy and subsequent passing release succeeded, but its exact negative conclusion needs dashboard confirmation.
- Live provider settings are owner-confirmed; direct authenticated dashboard/API readback and a live failure drill have not been performed. A failed live release is not needed for the staging test.
- Review and approve PR #4 before merging to `main`, which will install this reliability batch and CI workflow on the live branch and trigger provider release checks. Record the live API/web deployment SHAs and readiness results after the approved promotion. No production merge was performed during this drill.
- Continuous uptime notifications, provider backup/restore and previous-deployment rollback remain separate, unfinished initial-batch items. This CI deployment drill does not prove database recovery or a rollback across schema changes.

## Candidate and isolated proof

- [Candidate PR #4](https://github.com/danieldev10/streetz/pull/4) contains the initial reliability batch, CI concurrency change and evidence. It has not been merged or deployed to `main`/`staging` by this work. Subsequent candidate commits, including evidence updates, must also pass CI before merging.
- [Proof PR #5](https://github.com/danieldev10/streetz/pull/5) is closed and was never merged. Its run history retains the deliberately failed check and the proof assertion.
- Local operational tests and workflow structure validation passed before hosted execution. See [local-validation.md](local-validation.md) for the first batch's earlier local database, health and recovery checks.
