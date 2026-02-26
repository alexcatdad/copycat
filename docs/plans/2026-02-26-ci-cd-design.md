# CI/CD Pipeline Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement the corresponding implementation plan.

**Goal:** Automate testing, versioning, and deployment for CopyCat using GitHub Actions and GitHub Pages.

**Architecture:** Three separate workflows — CI (test gate), Deploy (GH Pages on every main push), and Release-Please (conventional-commit versioning with GitHub Releases). Standardized on bun as the sole package manager.

## Decisions

- **Package manager:** bun everywhere (local + CI). Delete `package-lock.json`, use `bun.lock`.
- **Versioning:** release-please with conventional commits. GitHub Releases only, no npm publishing.
- **Deploy trigger:** Every push to main deploys to GitHub Pages.
- **CI trigger:** PRs and pushes to main run tests + type-check + build.
- **GH Pages method:** Actions-based deployment (not legacy branch-based).

## Workflow 1: CI (`ci.yml`)

**Triggers:** `push` to `main`, `pull_request` to `main`

**Steps:**
1. Checkout code
2. Setup bun (`oven-sh/setup-bun`)
3. `bun install`
4. `bun run test` (vitest)
5. `bun run check` (svelte-check)
6. `bun run build` (vite build)

**Purpose:** Gate PRs and validate main pushes. All three checks must pass.

## Workflow 2: Deploy (`deploy.yml`)

**Triggers:** `push` to `main` (runs after CI via `needs`)

Actually implemented as a job within the CI workflow to avoid duplication: if CI passes on a main push, a deploy job runs.

**Steps:**
1. Checkout code
2. Setup bun
3. `bun install`
4. `bun run build`
5. Upload `dist/` as Pages artifact (`actions/upload-pages-artifact`)
6. Deploy to Pages (`actions/deploy-pages`)

**Requires:** GitHub Pages configured to use Actions source. Set via `gh api` or repo settings.

## Workflow 3: Release-Please (`release-please.yml`)

**Triggers:** `push` to `main`

**Steps:**
1. Run `googleapis/release-please-action`
2. Configured for `node` release type (bumps `package.json` version)
3. On merge of release PR: creates GitHub Release with tag, generates CHANGELOG.md

**No npm publish step.** Release-please only manages versioning, changelog, and GitHub Releases.

## Vite Config Change

Add `base: '/copycat/'` so built assets resolve correctly under `https://alexcatdad.github.io/copycat/`.

## Package Manager Migration

- Delete `package-lock.json`
- Run `bun install` to generate `bun.lock`
- Commit `bun.lock`, update `.gitignore` if needed

## GitHub Pages Setup

Enable Pages via Actions deployment source:
```bash
gh api repos/alexcatdad/copycat/pages -X PUT -f build_type=workflow
```
