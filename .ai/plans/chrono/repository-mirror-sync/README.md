# Secret-Configured Repository Mirror — Plan

> Status: Planning
> Created: 2026-10-09
> Priority: Medium

## Problem

A repository mirror/synchronization workflow needs to push source changes to a configurable destination without hardcoding a GitHub account/owner or access token in tracked files. Credentials must remain in GitHub Actions secrets. Unsafe mirroring can overwrite destination-only commits.

## Solution

Add a GitHub Actions workflow in Chrono Gaming that synchronizes the source repository's `main` branch to a configured destination repository. Read the destination owner/account, destination repository name, and write token exclusively from GitHub Actions secrets. Validate configuration before attempting a push and use non-force semantics so divergent destination history is not silently overwritten. Document setup and recovery.

## Non-Goals

- No bidirectional synchronization.
- No force-push or automatic overwrite of destination-only commits.
- No issue, pull request, repository setting, Actions secret, deployment, or project-board synchronization.
- No automated creation of GitHub secrets.
- No app runtime, database, or deployment changes.
- No synchronization of tags or branches other than `main`.

## Required GitHub Actions Secrets

| Secret | Purpose |
| --- | --- |
| `MIRROR_REPOSITORY_OWNER` | Destination GitHub user or organization |
| `MIRROR_REPOSITORY_NAME` | Destination repository name |
| `MIRROR_REPOSITORY_TOKEN` | Token with minimum required write access to the destination repository |

Never place token values in workflow YAML, documentation, repository URLs, commit messages, or logs. Secrets must be created by a repository administrator in GitHub repository settings. Prefer a fine-grained token limited to the destination repository with Contents: Read and write (or the minimum permission GitHub requires for pushing).

## Phase Map

| Phase | File | Scope |
| --- | --- | --- |
| 1 | [phase-01-secret-configured-mirror.md](./phase-01-secret-configured-mirror.md) | Workflow and operator documentation |

## Expected Files

- `.github/workflows/mirror-repository.yml` — push to source `main` and manual dispatch triggers.
- `apps/chrono-docs` or the repository's established engineering-doc location — document setup, token scope, safe failure, and recovery. Confirm the correct location before implementation.

## Safety Requirements

- Fail clearly if any required secret is missing, without printing secret values.
- Validate owner/repository format and reject a destination equal to the source repository.
- Push only source `main` to destination `main`.
- Never use `--force` or an all-refs mirror in this initial implementation.
- A non-fast-forward rejection must be surfaced for manual reconciliation.
- Keep the source repository's existing CI workflow behavior unchanged.

## Acceptance Criteria

- Destination account/owner, repository name, and token are sourced only from GitHub Actions secrets.
- Missing secrets, invalid configuration, and self-target configuration fail before pushing.
- The workflow updates destination `main` on source-main pushes and can be run manually.
- Divergent destination history is not overwritten.
- Documentation explains secret setup, permissions, limitations, and recovery.
- No credentials or unrelated runtime changes are committed.

## Verification

- Validate workflow YAML and relevant repository policy checks.
- Review workflow permissions and ensure secrets are not echoed.
- Run against a safe test destination to verify success, missing-secret failure, self-target rejection, and divergent-history failure.
- Do not claim checks passed unless they were actually run.

## Rollback

Disable the workflow to stop future syncs. Revoke the destination token in GitHub if exposure is suspected. The feature does not modify application runtime or database state.

## Open Decision

This plan assumes a one-way, main-only sync to a destination specified by secrets. Broader branch/tag mirroring or destructive overwrite behavior is out of scope unless explicitly requested.
