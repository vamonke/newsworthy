# Production

Newsworthy is live at https://newsworthy.vamonke.com on a Cloudflare Worker (`worker/`). Before deploying, or changing anything about the API, live sessions, keys, limits or the domain, read `DEPLOYMENT.md`. Deploy only from a clean worktree of `origin/main`. To play the live game from an agent browser (Turnstile blocks those), see "Playing in production (agents)" in `DEPLOYMENT.md`.

# Shared-checkout coordination

This repository permits multiple coding agents to work concurrently in the same checkout. Concurrent work is allowed only when the claimed scopes do not overlap.

## Before editing

1. Read this file and run `git status --short --branch`.
2. Inspect every file in `.codex-work/claims/`.
3. Create `.codex-work/claims/<task-slug>.md` before making changes. Record the task or thread name, start time, status, and the exact files or components you intend to edit.
4. If an active claim overlaps your intended work, coordinate with that task or wait. Do not overwrite, revert, stage, or commit overlapping work by assumption.
5. Treat existing uncommitted changes as another agent's work unless the task context clearly assigns them to you.

Claims are local coordination state and are intentionally ignored by Git. Remove your claim when the work is complete. If a claim appears stale, verify the owning task is inactive before removing or superseding it.

## While working

- Keep edits inside the claimed scope. Update the claim before expanding scope.
- Recheck `git status --short` before broad refactors, formatting, dependency updates, pulls, rebases, branch switches, or other operations that may affect shared state.
- Do not run repository-wide formatting or cleanup while another claim is active unless every affected scope is coordinated.
- Never discard or rewrite another task's changes.

## Committing

1. Stage only files or hunks owned by your claim. Never use `git add -A`, `git add .`, or `git commit -a` in the shared checkout.
2. Inspect `git diff --cached --check` and the complete `git diff --cached` before committing.
3. Confirm the staged diff contains no other task's work.
4. After committing, verify `git status --short --branch` and report any remaining changes as belonging to other active work.
