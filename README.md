<p align="center">
  <img src=".github/banner.svg" alt="arbitrum-dep-updater" width="100%">
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square" alt="License: MIT"></a>
  <a href="https://github.com/features/actions"><img src="https://img.shields.io/badge/GitHub%20Actions-ready-2088FF.svg?style=flat-square&logo=githubactions&logoColor=white" alt="GitHub Actions"></a>
  <a href="https://arbitrum.io"><img src="https://img.shields.io/badge/Arbitrum-Stylus-28A0F0.svg?style=flat-square" alt="Arbitrum Stylus"></a>
  <a href="https://viem.sh"><img src="https://img.shields.io/badge/viem-supported-646CFF.svg?style=flat-square" alt="viem"></a>
  <a href="https://book.getfoundry.sh/"><img src="https://img.shields.io/badge/Built%20with-Foundry-FFDB1C.svg?style=flat-square" alt="Foundry"></a>
  <a href="http://makeapullrequest.com"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square" alt="PRs Welcome"></a>
</p>

<p align="center">
  <strong>A GitHub Action that automatically checks and updates Arbitrum-specific dependencies and opens a PR.</strong>
  <br>
  <a href="#quick-setup">Quick Setup</a> · <a href="#what-it-tracks">What It Tracks</a> · <a href="#customization">Customization</a> · <a href="https://github.com/hummusonrails/arbitrum-dep-updater/issues">Report a Bug</a>
</p>

## What it does

Drop this action into any Arbitrum repo and it will:

- **Scan** for `Cargo.toml`, `package.json`, and `foundry.toml` files
- **Check** Arbitrum-ecosystem dependency versions against crates.io, npm, and GitHub
- **Update** files in-place, preserving formatting and range operators (`^`, `~`)
- **Open a PR** with a clear summary of every change and a review checklist

Runs on a weekly cron schedule so your repos never fall behind.

## What it tracks

| Ecosystem | Dependencies | Registry |
|:----------|:-------------|:---------|
| Rust / Stylus | `stylus-sdk`, `alloy-primitives`, `alloy-sol-types`, `alloy` | crates.io |
| Frontend | `viem`, `wagmi`, `@tanstack/react-query`, `@openzeppelin/contracts` | npm |
| Solidity / Foundry | `solc` compiler version, `forge-std` | solc-bin, GitHub |

## Quick Setup

Add this workflow to any repo at `.github/workflows/arbitrum-dep-update.yml`:

```yaml
name: Arbitrum Dependency Update

on:
  schedule:
    - cron: '0 9 * * 1'  # Every Monday at 9:00 UTC
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  check-updates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: hummusonrails/arbitrum-dep-updater@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
```

That's it. The action will open a PR whenever updates are available.

> **Required repo setting:** Go to **Settings > Actions > General > Workflow permissions** and enable **"Allow GitHub Actions to create and approve pull requests"**. Without this, the action can detect and commit updates but cannot open PRs.

## Inputs

| Input | Description | Default |
|:------|:------------|:--------|
| `token` | GitHub token for creating branches and PRs | `${{ github.token }}` |
| `branches` | Comma-separated branches to check and open PRs against | *(auto-detects default branch)* |
| `create-pr` | Create a pull request with updates | `true` |
| `dry-run` | Only check for updates, don't modify files | `false` |
| `rust-deps` | Comma-separated Rust deps to track (overrides defaults) | *(built-in list)* |
| `js-deps` | Comma-separated JS deps to track (overrides defaults) | *(built-in list)* |
| `extra-rust-deps` | Additional Rust deps to track (added to defaults) | |
| `extra-js-deps` | Additional JS deps to track (added to defaults) | |
| `check-foundry` | Check Foundry/Solidity dependencies | `true` |

## Outputs

| Output | Description |
|:-------|:------------|
| `updates-available` | Whether any updates were found (`true`/`false`) |
| `update-count` | Total number of updates found across all branches |
| `pr-urls` | JSON array of created PR URLs (one per branch with updates) |
| `pr-numbers` | JSON array of created PR numbers (one per branch with updates) |

## Customization

### Check multiple branches

```yaml
- uses: hummusonrails/arbitrum-dep-updater@v1
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    branches: 'main,develop,workshop-v2'
```

Opens a separate PR per branch that has outdated dependencies.

### Track additional dependencies

```yaml
- uses: hummusonrails/arbitrum-dep-updater@v1
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    extra-rust-deps: 'tokio,eyre'
    extra-js-deps: '@rainbow-me/rainbowkit,ethers'
```

### Override the default dependency list

```yaml
- uses: hummusonrails/arbitrum-dep-updater@v1
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    rust-deps: 'stylus-sdk,alloy-primitives'
    js-deps: 'viem'
    check-foundry: false
```

### Dry run (check only, no PR)

```yaml
- uses: hummusonrails/arbitrum-dep-updater@v1
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    dry-run: true
```

## How it works

1. Auto-detects the repo's default branch (works with both `main` and `master`), or uses your configured list
2. Scans the repo for `Cargo.toml`, `package.json`, and `foundry.toml` files
3. Extracts versions of tracked Arbitrum-ecosystem dependencies
4. Queries crates.io, npm, and GitHub for the latest versions
5. Compares versions using semver
6. Updates files in-place, preserving formatting and range operators
7. Creates a branch and opens a PR with a summary of all changes

## Contributing

Contributions welcome. Open an [issue](https://github.com/hummusonrails/arbitrum-dep-updater/issues) or submit a [pull request](https://github.com/hummusonrails/arbitrum-dep-updater/pulls).

## License

[MIT](LICENSE)
