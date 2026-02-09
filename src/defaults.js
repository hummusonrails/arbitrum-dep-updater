// Default Arbitrum-ecosystem dependencies to track. 

const RUST_DEPS = [
  'stylus-sdk',
  'alloy-primitives',
  'alloy-sol-types',
  'alloy',
];

const JS_DEPS = [
  'viem',
  'wagmi',
  '@tanstack/react-query',
  '@openzeppelin/contracts',
];

const FOUNDRY_DEPS = {
  solcVersionKey: 'solc',
  forgeStdRepo: 'foundry-rs/forge-std',
};

module.exports = { RUST_DEPS, JS_DEPS, FOUNDRY_DEPS };
