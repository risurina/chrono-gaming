# Phase 1 — Secret-Configured Repository Mirror

> Plan: [Secret-Configured Repository Mirror](./README.md)
> Priority: Medium
> Effort: Small
> Depends on: Plan acceptance or explicit authorization to execute

## Context

Chrono Gaming's root instructions require plan-first work for features and prohibit committed secrets. The mirror workflow must keep destination account details and token in GitHub Actions secrets and must fail safely if destination history has diverged.

## Files to Update

- `.github/workflows/mirror-repository.yml` (new)
- Repository engineering documentation location (confirm existing convention before creating a new document)

## Step-by-Step Tasks

- [ ] Inspect the repository's workflow and documentation conventions before implementation.
- [ ] Add a workflow triggered by push to `main` and `workflow_dispatch`.
- [ ] Read `MIRROR_REPOSITORY_OWNER`, `MIRROR_REPOSITORY_NAME`, and `MIRROR_REPOSITORY_TOKEN` only from GitHub Actions secrets.
- [ ] Validate required values and reject invalid or self-target destinations without printing secret values.
- [ ] Push source `main` to destination `main` using non-force semantics.
- [ ] Document token scope, secret creation, manual run, limitations, and recovery in the established docs location.
- [ ] Run available YAML/policy checks and safely verify success and failure cases.

## Acceptance Criteria

- [ ] Account/owner and token are not hardcoded or logged.
- [ ] Destination owner, repository, and token come exclusively from GitHub Actions secrets.
- [ ] Missing secrets and invalid/self-target destinations fail before push.
- [ ] The workflow syncs only `main` and never force-pushes.
- [ ] Divergent destination history fails safely.
- [ ] Existing CI and app runtime behavior are unchanged.

## Out of Scope

- Bidirectional sync, force push, branch deletion, tag sync, issue/PR/settings sync, automatic secret creation, and application/database changes.

## Execution Start Point

- Start file: `.github/workflows/mirror-repository.yml`
- Start location: trigger and preflight validation steps.

## Verification Commands

- Use the repository's available YAML/action validation.
- Run relevant CI checks.
- Run a manual workflow against a safe test destination and verify normal push plus expected preflight/divergence failures.

## Risks

- Repository secrets must be created manually by an administrator.
- The token must have write permission to the destination repository.
- Destination-only commits block the sync until a human reconciles history.
- Only `main` is synchronized.
