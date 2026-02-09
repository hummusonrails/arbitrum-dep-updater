const core = require('@actions/core');
const github = require('@actions/github');
const exec = require('@actions/exec');
const path = require('path');

const { RUST_DEPS, JS_DEPS } = require('./defaults');
const {
  findCargoFiles,
  findPackageJsonFiles,
  findFoundryFiles,
  parseCargoToml,
  parsePackageJson,
  parseFoundryToml,
  findForgeStdVersion,
} = require('./scanners');
const {
  getLatestCrateVersion,
  getLatestNpmVersion,
  getLatestGitHubRelease,
  getLatestSolcVersion,
  isNewer,
  updatedVersionString,
} = require('./registries');
const {
  updateCargoToml,
  updatePackageJson,
  updateFoundryToml,
  updateForgeStdInPackageJson,
} = require('./updater');

async function run() {
  try {
    const token = core.getInput('token', { required: true });
    const branches = parseList(core.getInput('branches')) || ['main'];
    const createPr = core.getBooleanInput('create-pr');
    const dryRun = core.getBooleanInput('dry-run');

    const rustDeps = parseList(core.getInput('rust-deps')) || RUST_DEPS;
    const jsDeps = parseList(core.getInput('js-deps')) || JS_DEPS;
    const checkFoundry = core.getBooleanInput('check-foundry');
    const extraRustDeps = parseList(core.getInput('extra-rust-deps')) || [];
    const extraJsDeps = parseList(core.getInput('extra-js-deps')) || [];

    const allRustDeps = [...new Set([...rustDeps, ...extraRustDeps])];
    const allJsDeps = [...new Set([...jsDeps, ...extraJsDeps])];

    const rootDir = process.env.GITHUB_WORKSPACE || process.cwd();

    core.info('=== Arbitrum Dependency Updater ===');
    core.info(`Root directory: ${rootDir}`);
    core.info(`Branches: ${branches.join(', ')}`);
    core.info(`Tracking Rust deps: ${allRustDeps.join(', ')}`);
    core.info(`Tracking JS deps: ${allJsDeps.join(', ')}`);
    core.info(`Check Foundry: ${checkFoundry}`);

    // Configure git once
    await exec.exec('git', ['config', 'user.name', 'arbitrum-dep-updater[bot]']);
    await exec.exec('git', ['config', 'user.email', 'arbitrum-dep-updater[bot]@users.noreply.github.com']);

    // Fetch all remote branches so we can check them out
    await exec.exec('git', ['fetch', 'origin']);

    const allPrUrls = [];
    const allPrNumbers = [];
    let totalUpdateCount = 0;

    for (const branch of branches) {
      core.info(`\n========================================`);
      core.info(`Checking branch: ${branch}`);
      core.info(`========================================`);

      // Checkout the branch
      try {
        await exec.exec('git', ['checkout', branch]);
        await exec.exec('git', ['reset', '--hard', `origin/${branch}`]);
      } catch (err) {
        core.warning(`Could not checkout branch '${branch}': ${err.message}. Skipping.`);
        continue;
      }

      const updates = await scanForUpdates(rootDir, allRustDeps, allJsDeps, checkFoundry, token);
      totalUpdateCount += updates.length;

      if (updates.length === 0) {
        core.info(`No updates found for branch '${branch}'.`);
        continue;
      }

      const summary = buildSummaryTable(updates);
      core.info('\n' + summary);

      if (dryRun) {
        core.info(`Dry run — skipping file updates for branch '${branch}'.`);
        continue;
      }

      applyUpdates(updates);

      if (!createPr) {
        core.info(`PR creation disabled. Updates applied for branch '${branch}'.`);
        continue;
      }

      const { prUrl, prNumber } = await createPullRequest(
        token, rootDir, branch, updates, summary
      );
      if (prUrl) {
        allPrUrls.push(prUrl);
        allPrNumbers.push(prNumber);
      }

      // Clean up: go back to a clean state for the next branch
      await exec.exec('git', ['checkout', branch]);
      await exec.exec('git', ['reset', '--hard', `origin/${branch}`]);
    }

    // Set outputs
    core.setOutput('updates-available', String(totalUpdateCount > 0));
    core.setOutput('update-count', String(totalUpdateCount));
    core.setOutput('pr-urls', JSON.stringify(allPrUrls));
    core.setOutput('pr-numbers', JSON.stringify(allPrNumbers));

  } catch (error) {
    core.setFailed(error.message);
  }
}

// Scan the working tree for outdated Arbitrum dependencies.
async function scanForUpdates(rootDir, rustDeps, jsDeps, checkFoundry, token) {
  const updates = [];

  // Cargo.toml files
  const cargoFiles = await findCargoFiles(rootDir);
  core.info(`Found ${cargoFiles.length} Cargo.toml file(s)`);

  for (const file of cargoFiles) {
    const relPath = path.relative(rootDir, file);
    core.info(`  Scanning ${relPath}...`);
    const deps = parseCargoToml(file, rustDeps);

    for (const [key, info] of Object.entries(deps)) {
      try {
        const latest = await getLatestCrateVersion(info.depName);
        if (isNewer(info.version, latest)) {
          core.info(`    ${info.depName}: ${info.version} → ${latest}`);
          updates.push({
            type: 'cargo', file, relPath,
            depName: info.depName, section: info.section,
            oldVersion: info.version, newVersion: latest, style: info.style,
          });
        } else {
          core.info(`    ${info.depName}: ${info.version} (up to date)`);
        }
      } catch (err) {
        core.warning(`    Failed to check ${info.depName}: ${err.message}`);
      }
    }
  }

  // package.json files
  const packageFiles = await findPackageJsonFiles(rootDir);
  core.info(`Found ${packageFiles.length} package.json file(s)`);

  for (const file of packageFiles) {
    const relPath = path.relative(rootDir, file);
    core.info(`  Scanning ${relPath}...`);
    const deps = parsePackageJson(file, jsDeps);

    for (const [key, info] of Object.entries(deps)) {
      try {
        const latest = await getLatestNpmVersion(info.depName);
        if (isNewer(info.version, latest)) {
          const newVer = updatedVersionString(info.version, latest);
          core.info(`    ${info.depName}: ${info.version} → ${newVer}`);
          updates.push({
            type: 'package-json', file, relPath,
            depName: info.depName, section: info.section,
            oldVersion: info.version, newVersion: newVer, newVersionRaw: latest,
          });
        } else {
          core.info(`    ${info.depName}: ${info.version} (up to date)`);
        }
      } catch (err) {
        core.warning(`    Failed to check ${info.depName}: ${err.message}`);
      }
    }
  }

  // foundry.toml files
  if (checkFoundry) {
    const foundryFiles = await findFoundryFiles(rootDir);
    core.info(`Found ${foundryFiles.length} foundry.toml file(s)`);

    for (const file of foundryFiles) {
      const relPath = path.relative(rootDir, file);
      core.info(`  Scanning ${relPath}...`);
      const deps = parseFoundryToml(file);

      if (deps.solc) {
        try {
          const latest = await getLatestSolcVersion();
          if (isNewer(deps.solc.version, latest)) {
            core.info(`    solc: ${deps.solc.version} → ${latest}`);
            updates.push({
              type: 'foundry', file, relPath,
              depName: 'solc', oldVersion: deps.solc.version, newVersion: latest,
            });
          } else {
            core.info(`    solc: ${deps.solc.version} (up to date)`);
          }
        } catch (err) {
          core.warning(`    Failed to check solc: ${err.message}`);
        }
      }
    }

    const forgeStd = await findForgeStdVersion(rootDir);
    if (forgeStd && forgeStd.version) {
      try {
        const latest = await getLatestGitHubRelease('foundry-rs', 'forge-std', token);
        if (isNewer(forgeStd.version, latest)) {
          core.info(`    forge-std: ${forgeStd.version} → ${latest}`);
          updates.push({
            type: 'forge-std',
            file: forgeStd.file,
            relPath: forgeStd.file ? path.relative(rootDir, forgeStd.file) : '',
            depName: 'forge-std', oldVersion: forgeStd.version,
            newVersion: latest, forgeStdInfo: forgeStd,
          });
        } else {
          core.info(`    forge-std: ${forgeStd.version} (up to date)`);
        }
      } catch (err) {
        core.warning(`    Failed to check forge-std: ${err.message}`);
      }
    }
  }

  core.info(`Found ${updates.length} update(s) available`);
  return updates;
}

// Apply all updates to files on disk.
function applyUpdates(updates) {
  core.info('Applying updates...');
  for (const update of updates) {
    core.info(`  Updating ${update.depName} in ${update.relPath}...`);
    switch (update.type) {
      case 'cargo':
        updateCargoToml(
          update.file, update.depName, update.section,
          update.oldVersion, update.newVersion, update.style
        );
        break;
      case 'package-json':
        updatePackageJson(
          update.file, update.depName, update.section, update.newVersion
        );
        break;
      case 'foundry':
        updateFoundryToml(update.file, update.oldVersion, update.newVersion);
        break;
      case 'forge-std':
        if (update.forgeStdInfo.type === 'package-json') {
          updateForgeStdInPackageJson(
            update.forgeStdInfo.file, update.forgeStdInfo.section,
            update.forgeStdInfo.raw, update.newVersion
          );
        }
        break;
    }
  }
}

// Create a feature branch, commit, push, and open a PR against the target branch.
async function createPullRequest(token, rootDir, targetBranch, updates, summary) {
  const date = new Date().toISOString().slice(0, 10);
  const branchName = `arbitrum-dep-update/${targetBranch}/${date}`;

  core.info(`Creating PR: ${branchName} → ${targetBranch}`);

  await exec.exec('git', ['checkout', '-b', branchName]);
  await exec.exec('git', ['add', '-A']);

  const commitMsg = buildCommitMessage(updates, targetBranch);
  await exec.exec('git', ['commit', '-m', commitMsg]);
  await exec.exec('git', ['push', '--set-upstream', 'origin', branchName]);

  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;

  const prBody = buildPrBody(updates, summary, targetBranch);
  const pr = await octokit.rest.pulls.create({
    owner,
    repo,
    title: `chore(deps): update Arbitrum dependencies (${targetBranch})`,
    body: prBody,
    head: branchName,
    base: targetBranch,
  });

  core.info(`PR created: ${pr.data.html_url}`);
  return { prUrl: pr.data.html_url, prNumber: pr.data.number };
}

function parseList(input) {
  if (!input || input.trim() === '') return null;
  return input.split(',').map(s => s.trim()).filter(Boolean);
}

function buildSummaryTable(updates) {
  const lines = updates.map(u =>
    `| ${u.depName} | ${u.oldVersion} | ${u.newVersion} | ${u.relPath} |`
  );
  return [
    '| Dependency | Current | Latest | File |',
    '|-----------|---------|--------|------|',
    ...lines,
  ].join('\n');
}

function buildCommitMessage(updates, branch) {
  const lines = [`chore(deps): update Arbitrum dependencies (${branch})\n`];
  lines.push('Updated dependencies:');
  for (const update of updates) {
    lines.push(`  - ${update.depName}: ${update.oldVersion} → ${update.newVersion}`);
  }
  return lines.join('\n');
}

function buildPrBody(updates, summary, branch) {
  const rustUpdates = updates.filter(u => u.type === 'cargo');
  const jsUpdates = updates.filter(u => u.type === 'package-json');
  const foundryUpdates = updates.filter(u => u.type === 'foundry' || u.type === 'forge-std');

  const sections = [];

  sections.push(`## Arbitrum Dependency Updates (\`${branch}\`)\n`);
  sections.push('This PR was automatically generated by [arbitrum-dep-updater](https://github.com/hummusonrails/arbitrum-dep-updater).\n');
  sections.push(summary);

  if (rustUpdates.length > 0) {
    sections.push('\n### Rust / Stylus');
    sections.push('These updates affect Stylus smart contracts and related Rust tooling.');
    for (const u of rustUpdates) {
      sections.push(`- **${u.depName}**: \`${u.oldVersion}\` → \`${u.newVersion}\` (in \`${u.relPath}\`)`);
    }
  }

  if (jsUpdates.length > 0) {
    sections.push('\n### Frontend / JavaScript');
    sections.push('These updates affect the web frontend and JavaScript tooling.');
    for (const u of jsUpdates) {
      sections.push(`- **${u.depName}**: \`${u.oldVersion}\` → \`${u.newVersion}\` (in \`${u.relPath}\`)`);
    }
  }

  if (foundryUpdates.length > 0) {
    sections.push('\n### Solidity / Foundry');
    sections.push('These updates affect Solidity contracts and Foundry tooling.');
    for (const u of foundryUpdates) {
      sections.push(`- **${u.depName}**: \`${u.oldVersion}\` → \`${u.newVersion}\``);
    }
  }

  sections.push('\n### Review Checklist');
  sections.push('- [ ] Check for breaking changes in updated dependencies');
  sections.push('- [ ] Run tests locally to verify compatibility');
  sections.push('- [ ] Verify Stylus contracts still compile with `cargo stylus check`');
  sections.push('- [ ] Verify Solidity contracts still compile with `forge build`');
  sections.push('- [ ] Test frontend builds successfully');

  return sections.join('\n');
}

run();
