const fs = require('fs');
const TOML = require('smol-toml');

// Update a dependency version in a Cargo.toml file.
function updateCargoToml(filePath, depName, section, oldVersion, newVersion, style) {
  let content = fs.readFileSync(filePath, 'utf-8');

  if (style === 'inline') {
    // Pattern: dep_name = "0.10.0"
    // Need to be careful to match within the right [section]
    const escapedDep = depName.replace(/-/g, '[-_]');
    const pattern = new RegExp(
      `(${escapedDep}\\s*=\\s*)"${escapeRegex(oldVersion)}"`,
      'g'
    );
    content = content.replace(pattern, `$1"${newVersion}"`);
  } else if (style === 'table') {
    // Pattern: dep_name = { version = "0.10.0", ... }
    const escapedDep = depName.replace(/-/g, '[-_]');
    const pattern = new RegExp(
      `(${escapedDep}\\s*=\\s*\\{[^}]*version\\s*=\\s*)"${escapeRegex(oldVersion)}"`,
      'g'
    );
    content = content.replace(pattern, `$1"${newVersion}"`);
  }

  fs.writeFileSync(filePath, content, 'utf-8');
}

// Update a dependency version in a package.json file.
function updatePackageJson(filePath, depName, section, newVersionString) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(content);

  if (parsed[section] && parsed[section][depName]) {
    parsed[section][depName] = newVersionString;
  }

  // Detect indent style from original file
  const indentMatch = content.match(/^(\s+)"/m);
  const indent = indentMatch ? indentMatch[1] : '  ';
  fs.writeFileSync(filePath, JSON.stringify(parsed, null, indent) + '\n', 'utf-8');
}

// Update the solc version in a foundry.toml file.
function updateFoundryToml(filePath, oldVersion, newVersion) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const pattern = new RegExp(
    `(solc\\s*=\\s*)"${escapeRegex(oldVersion)}"`,
    'g'
  );
  content = content.replace(pattern, `$1"${newVersion}"`);
  fs.writeFileSync(filePath, content, 'utf-8');
}

// Update forge-std version in package.json (GitHub dependency).
function updateForgeStdInPackageJson(filePath, section, oldRaw, newVersion) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(content);

  if (parsed[section] && parsed[section]['forge-std']) {
    // Replace the version tag in the GitHub reference
    const newRef = oldRaw.replace(/#v?[\d.]+/, `#v${newVersion}`);
    parsed[section]['forge-std'] = newRef;
  }

  const indentMatch = content.match(/^(\s+)"/m);
  const indent = indentMatch ? indentMatch[1] : '  ';
  fs.writeFileSync(filePath, JSON.stringify(parsed, null, indent) + '\n', 'utf-8');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  updateCargoToml,
  updatePackageJson,
  updateFoundryToml,
  updateForgeStdInPackageJson,
};
