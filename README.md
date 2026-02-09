# Arbitrum Dependency Updater

A GitHub Action that automatically checks and updates Arbitrum-specific dependencies in your repos. Runs on a weekly cron schedule and opens a PR when updates are available.

## What it tracks

### Rust / Stylus (Cargo.toml)
- `stylus-sdk` — Arbitrum Stylus SDK
- `alloy-primitives` — Ethereum type primitives
- `alloy-sol-types` — Solidity type encoding
- `alloy` — Ethereum client library

### Frontend (package.json)
- `viem` — Ethereum/Arbitrum client library
- `wagmi` — React hooks for wallets and contracts
- `@tanstack/react-query` — Query caching for contract reads
- `@openzeppelin/contracts` — Smart contract library

### Solidity / Foundry (foundry.toml)
- `solc` compiler version
- `forge-std` library version

## Quick setup

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

## Inputs

| Input | Description | Default |
|-------|------------|---------|
| `token` | GitHub token for creating branches and PRs | `${{ github.token }}` |
| `branches` | Comma-separated branches to check and open PRs against | `main` |
| `create-pr` | Create a pull request with updates | `true` |
| `dry-run` | Only check for updates, don't modify files | `false` |
| `rust-deps` | Comma-separated Rust deps to track (overrides defaults) | *(built-in list)* |
| `js-deps` | Comma-separated JS deps to track (overrides defaults) | *(built-in list)* |
| `extra-rust-deps` | Additional Rust deps to track (added to defaults) | |
| `extra-js-deps` | Additional JS deps to track (added to defaults) | |
| `check-foundry` | Check Foundry/Solidity dependencies | `true` |

## Outputs

| Output | Description |
|--------|------------|
| `updates-available` | Whether any updates were found (`true`/`false`) |
| `update-count` | Total number of updates found across all branches |
| `pr-urls` | JSON array of created PR URLs (one per branch with updates) |
| `pr-numbers` | JSON array of created PR numbers (one per branch with updates) |

## Customization

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

### Check multiple branches

```yaml
- uses: hummusonrails/arbitrum-dep-updater@v1
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    branches: 'main,develop,workshop-v2'
```

Opens a separate PR per branch that has outdated dependencies.

### Dry run (check only, no PR)

```yaml
- uses: hummusonrails/arbitrum-dep-updater@v1
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    dry-run: true
```

## How it works

1. Scans the repo for `Cargo.toml`, `package.json`, and `foundry.toml` files
2. Extracts versions of tracked Arbitrum-ecosystem dependencies
3. Queries crates.io, npm, and GitHub for latest versions
4. Compares versions using semver
5. Updates files in-place, preserving formatting and range operators (`^`, `~`)
6. Creates a branch and opens a PR with a summary of all changes

## License

MIT
