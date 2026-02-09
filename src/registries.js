const https = require('https');
const semver = require('semver');

// Make an HTTPS GET request and return the JSON response.
function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      'User-Agent': 'arbitrum-dep-updater-action/1.0',
      'Accept': 'application/json',
      ...headers,
    };
    https.get(url, { headers: defaultHeaders }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}: ${data.slice(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Get the latest version of a crate from crates.io.
async function getLatestCrateVersion(crateName) {
  const url = `https://crates.io/api/v1/crates/${crateName}`;
  const data = await fetchJson(url);
  if (!data.crate || !data.crate.newest_version) {
    throw new Error(`Could not find crate: ${crateName}`);
  }
  return data.crate.newest_version;
}

// Get the latest version of an npm package.
async function getLatestNpmVersion(packageName) {
  const encodedName = packageName.replace('/', '%2f');
  const url = `https://registry.npmjs.org/${encodedName}/latest`;
  const data = await fetchJson(url);
  if (!data.version) {
    throw new Error(`Could not find npm package: ${packageName}`);
  }
  return data.version;
}

// Get the latest release tag for a GitHub repo (e.g., forge-std).
async function getLatestGitHubRelease(owner, repo, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  const headers = {};
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }
  const data = await fetchJson(url, headers);
  if (!data.tag_name) {
    throw new Error(`Could not find latest release for ${owner}/${repo}`);
  }
  return data.tag_name.replace(/^v/, '');
}

// Get the latest stable Solidity compiler version from solc-bin.
async function getLatestSolcVersion() {
  const url = 'https://binaries.soliditylang.org/bin/list.json';
  const data = await fetchJson(url);
  if (!data.latestRelease) {
    throw new Error('Could not determine latest solc version');
  }
  // latestRelease is like "0.8.28"
  return data.latestRelease;
}

// Compare two version strings. Returns true if latest is newer than current.
// Handles versions with and without ^ or ~ prefixes.
function isNewer(currentRaw, latest) {
  // Strip semver range operators
  const current = currentRaw.replace(/^[\^~>=<]+/, '');
  const cleanCurrent = semver.coerce(current);
  const cleanLatest = semver.coerce(latest);
  if (!cleanCurrent || !cleanLatest) {
    // Fall back to string comparison for non-semver versions
    return current !== latest;
  }
  return semver.gt(cleanLatest, cleanCurrent);
}

// Determine the updated version string preserving range operators.
// e.g., "^2.29.4" with latest "2.33.0" → "^2.33.0"
function updatedVersionString(currentRaw, latest) {
  const match = currentRaw.match(/^([\^~>=<]*)/);
  const prefix = match ? match[1] : '';
  return `${prefix}${latest}`;
}

module.exports = {
  getLatestCrateVersion,
  getLatestNpmVersion,
  getLatestGitHubRelease,
  getLatestSolcVersion,
  isNewer,
  updatedVersionString,
};
