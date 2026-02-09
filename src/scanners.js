const fs = require('fs');
const path = require('path');
const glob = require('@actions/glob');
const TOML = require('smol-toml');


// Find all Cargo.toml files in the repo (excluding target/ directories).
async function findCargoFiles(rootDir) {
  const globber = await glob.create(
    path.join(rootDir, '**/Cargo.toml'),
    { implicitDescendants: false }
  );
  const files = await globber.glob();
  return files.filter(f => !f.includes('/target/') && !f.includes('/node_modules/'));
}

// Find all package.json files (excluding node_modules/).
async function findPackageJsonFiles(rootDir) {
  const globber = await glob.create(
    path.join(rootDir, '**/package.json'),
    { implicitDescendants: false }
  );
  const files = await globber.glob();
  return files.filter(f => !f.includes('/node_modules/'));
}

// Find all foundry.toml files.
async function findFoundryFiles(rootDir) {
  const globber = await glob.create(
    path.join(rootDir, '**/foundry.toml'),
    { implicitDescendants: false }
  );
  const files = await globber.glob();
  return files.filter(f => !f.includes('/node_modules/') && !f.includes('/target/'));
}

// Parse a Cargo.toml and extract versions of tracked dependencies.
// Returns { depName: { version, section, style } }
//   section: 'dependencies' | 'dev-dependencies' | 'build-dependencies'
//   style: 'inline' ("0.10.0") | 'table' ({ version = "0.10.0", ... })
function parseCargoToml(filePath, trackedDeps) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = TOML.parse(content);
  const found = {};

  for (const section of ['dependencies', 'dev-dependencies', 'build-dependencies']) {
    const deps = parsed[section];
    if (!deps) continue;
    for (const depName of trackedDeps) {
      if (!(depName in deps)) continue;
      const val = deps[depName];
      if (typeof val === 'string') {
        found[`${section}/${depName}`] = {
          depName,
          version: val,
          section,
          style: 'inline',
        };
      } else if (val && typeof val === 'object' && val.version) {
        found[`${section}/${depName}`] = {
          depName,
          version: val.version,
          section,
          style: 'table',
        };
      }
    }
  }

  return found;
}

// Parse a package.json and extract versions of tracked dependencies.
function parsePackageJson(filePath, trackedDeps) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(content);
  const found = {};

  for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const deps = parsed[section];
    if (!deps) continue;
    for (const depName of trackedDeps) {
      if (!(depName in deps)) continue;
      found[`${section}/${depName}`] = {
        depName,
        version: deps[depName],
        section,
      };
    }
  }

  return found;
}

// Parse a foundry.toml and extract the solc version.
function parseFoundryToml(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = TOML.parse(content);
  const found = {};

  const defaultProfile = parsed.profile?.default || parsed;
  if (defaultProfile.solc) {
    found['solc'] = {
      depName: 'solc',
      version: defaultProfile.solc,
    };
  }

  return found;
}

// Find forge-std git submodule or lib dependency and extract its version tag.
async function findForgeStdVersion(rootDir) {
  // Check .gitmodules for forge-std
  const gitmodulesPath = path.join(rootDir, '.gitmodules');
  if (fs.existsSync(gitmodulesPath)) {
    const content = fs.readFileSync(gitmodulesPath, 'utf-8');
    if (content.includes('forge-std')) {
      // Try to get the tag from the submodule
      const libPath = path.join(rootDir, 'lib', 'forge-std');
      if (fs.existsSync(libPath)) {
        return { type: 'submodule', path: libPath };
      }
    }
  }

  // Check if forge-std is referenced in any foundry config or remappings
  const remappingsPath = path.join(rootDir, 'remappings.txt');
  if (fs.existsSync(remappingsPath)) {
    const content = fs.readFileSync(remappingsPath, 'utf-8');
    if (content.includes('forge-std')) {
      return { type: 'remapping' };
    }
  }

  // Check package.json for forge-std as a GitHub dependency
  const globber = await glob.create(
    path.join(rootDir, '**/package.json'),
    { implicitDescendants: false }
  );
  const files = await globber.glob();
  for (const file of files) {
    if (file.includes('/node_modules/')) continue;
    const content = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(content);
    for (const section of ['dependencies', 'devDependencies']) {
      const deps = parsed[section];
      if (!deps) continue;
      if (deps['forge-std']) {
        const val = deps['forge-std'];
        // GitHub dependency: "github:foundry-rs/forge-std#v1.9.5"
        const match = val.match(/#v?([\d.]+)/);
        if (match) {
          return {
            type: 'package-json',
            file,
            section,
            version: match[1],
            raw: val,
          };
        }
      }
    }
  }

  return null;
}

module.exports = {
  findCargoFiles,
  findPackageJsonFiles,
  findFoundryFiles,
  parseCargoToml,
  parsePackageJson,
  parseFoundryToml,
  findForgeStdVersion,
};
