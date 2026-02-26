# CI/CD Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up GitHub Actions CI, GitHub Pages deployment, and release-please versioning with bun as the sole package manager.

**Architecture:** Two workflow files — `ci.yml` (test + deploy jobs) and `release-please.yml` (versioning). Bun replaces npm everywhere. Vite config updated with GH Pages base path.

**Tech Stack:** GitHub Actions, bun, oven-sh/setup-bun@v2, googleapis/release-please-action@v4, actions/deploy-pages@v4

---

### Task 1: Migrate from npm to bun

**Files:**
- Delete: `package-lock.json`
- Create: `bun.lock` (auto-generated)
- Modify: `.gitignore`

**Step 1: Delete package-lock.json**

```bash
rm package-lock.json
```

**Step 2: Generate bun.lock**

```bash
bun install
```

Expected: Creates `bun.lock` in project root. All dependencies install successfully.

**Step 3: Verify tests still pass with bun**

Run: `bun run test`
Expected: 17 test files, 51 tests, all passing.

**Step 4: Verify build still works**

Run: `bun run build`
Expected: Build succeeds, outputs to `dist/`.

**Step 5: Commit**

```bash
git add -A package-lock.json bun.lock .gitignore
git commit -m "chore: migrate from npm to bun"
```

---

### Task 2: Add Vite base path for GitHub Pages

**Files:**
- Modify: `vite.config.ts:4`

**Step 1: Add base config to vite.config.ts**

Change `vite.config.ts` to add the `base` property. The full file should be:

```typescript
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  base: '/copycat/',
  plugins: [svelte()],
  resolve: {
    conditions: ['browser'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
```

**Step 2: Verify build with new base path**

Run: `bun run build`
Expected: Build succeeds. Check that `dist/index.html` contains `/copycat/` in asset paths:
```bash
grep '/copycat/' dist/index.html
```
Expected: Should show script/link tags with `/copycat/assets/...` paths.

**Step 3: Verify tests still pass**

Run: `bun run test`
Expected: All 51 tests pass (base path shouldn't affect tests).

**Step 4: Commit**

```bash
git add vite.config.ts
git commit -m "chore: add vite base path for GitHub Pages"
```

---

### Task 3: Create CI + Deploy workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1: Create the .github/workflows directory**

```bash
mkdir -p .github/workflows
```

**Step 2: Create ci.yml**

Create `.github/workflows/ci.yml` with this exact content:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Run tests
        run: bun run test

      - name: Type check
        run: bun run check

      - name: Build
        run: bun run build

  deploy:
    needs: ci
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest

    permissions:
      pages: write
      id-token: write

    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Build
        run: bun run build

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v4
        with:
          path: dist

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

**Step 3: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "YAML valid"`

If python yaml not available, try: `bun -e "console.log('valid')"`
Expected: No syntax errors.

**Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add CI workflow with testing and GH Pages deploy"
```

---

### Task 4: Create release-please workflow

**Files:**
- Create: `.github/workflows/release-please.yml`

**Step 1: Create release-please.yml**

Create `.github/workflows/release-please.yml` with this exact content:

```yaml
name: Release Please

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          release-type: node
```

That's it. release-please will:
- Detect `feat:` commits → bump minor version
- Detect `fix:` commits → bump patch version
- Detect `BREAKING CHANGE:` → bump major version
- Create/update a Release PR with CHANGELOG
- On merge of Release PR → create GitHub Release with tag

No npm publish. No extra config files needed for a single-package repo.

**Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release-please.yml'))" && echo "YAML valid"`
Expected: No syntax errors.

**Step 3: Commit**

```bash
git add .github/workflows/release-please.yml
git commit -m "ci: add release-please for automatic versioning"
```

---

### Task 5: Enable GitHub Pages and push

**Step 1: Enable GitHub Pages with Actions source**

```bash
gh api repos/alexcatdad/copycat/pages -X PUT -f build_type=workflow
```

Expected: Response with `"build_type": "workflow"`. If Pages already exists, might need:
```bash
gh api repos/alexcatdad/copycat/pages -X PUT -f build_type=workflow -H "Accept: application/vnd.github+json"
```

If it returns 409 (already exists), update instead:
```bash
gh api repos/alexcatdad/copycat/pages -X PUT --input - <<< '{"build_type":"workflow"}'
```

**Step 2: Push all commits to main**

```bash
git push origin main
```

**Step 3: Verify CI workflow starts**

```bash
gh run list --limit 3
```

Expected: Should see a CI run triggered by the push. Wait for it:
```bash
gh run watch
```

**Step 4: Verify deployment**

After the CI run completes successfully, check the Pages URL:
```bash
gh api repos/alexcatdad/copycat/pages --jq '.html_url'
```

Expected: `https://alexcatdad.github.io/copycat/`

**Step 5: Commit any remaining changes (if needed)**

If any adjustments were needed during verification, commit them:
```bash
git add -A && git commit -m "fix: adjust CI config" && git push origin main
```
