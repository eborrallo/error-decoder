# @abiregistry/error-decoder

Decode Solidity custom errors from raw revert data. Extracts errors from Foundry/Hardhat build artifacts, builds an O(1) selector registry, and produces human-readable output. Includes a viem plugin for transparent error decoding.

## Install

```bash
npm install @abiregistry/error-decoder viem
```

## Quick Start

```ts
import { createDecoder } from "@abiregistry/error-decoder";

const decoder = createDecoder({
  foundryOut: "./out",
});

const result = decoder.decode(revertData);

if (result) {
  console.log(result.name);           // "InsufficientBalance"
  console.log(result.args.user);      // "0x000...dEaD"
  console.log(result.args.requested); // 1000n
  console.log(result.args.available); // 500n
}
```

## Features

- **Viem plugin** — extend `PublicClient` / `WalletClient` for transparent error decoding
- **Foundry & Hardhat support** — scans `out/` or `artifacts/` directories
- **O(1) selector lookup** — Map-based registry, not linear ABI scan
- **Builtin error handling** — `Error(string)` and `Panic(uint256)` with human-readable panic descriptions
- **Multiple output formats** — one-line, detailed, and ANSI-colored
- **CLI tool** — generate TypeScript types, contract artifacts, and decode errors from the terminal
- **Runtime registration** — add ABIs dynamically
- **Tree-shakeable** — subpath exports for minimal bundles

## Viem Plugin

The plugin overrides `call`, `simulateContract`, `writeContract`, and `sendTransaction` so that reverts throw a `DecodedRevertError` instead of a generic viem error. Extend both public and wallet clients for full coverage.

### Setup

```ts
import { createPublicClient, createWalletClient, http } from "viem";
import { errorDecoder, DecodedRevertError } from "@abiregistry/error-decoder/viem";
import { ERROR_ABI } from "./generated/index.js";

const plugin = errorDecoder({ errorAbis: [ERROR_ABI] });

const client = createPublicClient({ chain, transport: http() }).extend(plugin);
const wallet = createWalletClient({ account, chain, transport: http() }).extend(plugin);
```

### Usage

Every revert is now a `DecodedRevertError` with `.decoded`, `.revertData`, and `.originalError`:

```ts
// simulateContract
try {
  await client.simulateContract({
    address, abi, functionName: "withdraw", args: [99999n], account,
  });
} catch (err) {
  if (err instanceof DecodedRevertError) {
    console.log(err.decoded.name);  // "InsufficientBalance"
    console.log(err.decoded.args);  // { user: "0x...", requested: 99999n, available: 5000n }
  }
}

// writeContract — wallet client is extended too
try {
  await wallet.writeContract({
    address, abi, functionName: "withdraw", args: [99999n],
  });
} catch (err) {
  if (err instanceof DecodedRevertError) {
    console.log(err.decoded.name);
  }
}

// raw call
try {
  await client.call({ to: address, data: calldata });
} catch (err) {
  if (err instanceof DecodedRevertError) {
    console.log(err.revertData); // raw hex
  }
}
```

### Helper Methods

The extended client also exposes utility methods:

```ts
client.decodeError(revertHex);       // DecodedError | null
client.tryDecodeError(revertHex);    // always returns something
client.formatError(revertHex);       // { oneline, detailed, colored }
client.logError(revertHex);          // prints colored output to console
client.registerErrorAbi(newAbi);     // register more ABIs at runtime
client.errorRegistrySize;            // number of registered selectors
```

### `DecodedRevertError`

```ts
class DecodedRevertError extends Error {
  decoded: DecodedError;    // name, selector, signature, args, rawArgs
  revertData: Hex;          // raw revert bytes
  originalError: unknown;   // the original viem error
}
```

## Standalone API

### `createDecoder(options)`

```ts
const decoder = createDecoder({
  foundryOut: "./out",             // Foundry out/ path
  hardhatArtifacts: "./artifacts", // Hardhat artifacts/ path
  abis: [myAbi],                  // Raw ABI arrays
  includeBuiltins: true,           // Error(string), Panic(uint256) — default: true
});
```

### `decoder.decode(data)`

Returns a `DecodedError` or `null`:

```ts
interface DecodedError {
  name: string;                       // "InsufficientBalance"
  selector: string;                   // "0xdb42144d"
  signature: string;                  // "InsufficientBalance(address,uint256,uint256)"
  args: Record<string, unknown>;      // { user: "0x...", requested: 1000n, available: 500n }
  rawArgs: readonly unknown[];        // ["0x...", 1000n, 500n]
  contractName?: string;              // "Vault"
}
```

### `decoder.tryDecode(data)`

Always returns something — `DecodedError` or `{ name: "UnknownError", selector, raw }`.

### `decoder.decodeAndFormat(data)`

Returns all three formatted representations:

```ts
interface FormattedError {
  oneline: string;   // "Vault.InsufficientBalance(user=0x..., requested=1000, available=500)"
  detailed: string;  // multi-line with labels
  colored: string;   // ANSI-colored for terminals
}
```

### `decoder.decodeAndLog(data)`

Decodes and logs to console with colors.

### `decoder.registerAbi(abi, contractName?)`

Register additional ABIs at runtime.

## CLI

### Generate TypeScript types and contract artifacts

```bash
npx @abiregistry/error-decoder generate --foundry ./out --output ./generated --contracts
```

This creates:
- `errors.types.ts` — TypeScript interfaces for every custom error
- `errors.abi.ts` — ABI registry you can import in your code
- `<ContractName>.ts` — per-contract ABI and bytecode (with `--contracts`)
- `index.ts` — barrel file re-exporting everything

### Decode from terminal

```bash
npx @abiregistry/error-decoder decode 0xdb42144d000...01f4 --foundry ./out
```

Output:
```
Vault.InsufficientBalance
  selector: 0xdb42144d
  signature: InsufficientBalance(address,uint256,uint256)
  args:
    user: "0x000000000000000000000000000000000000dEaD"
    requested: 1000
    available: 500
```

## Advanced Usage

### Direct imports (tree-shaking)

```ts
import { scanFoundryOut } from "@abiregistry/error-decoder/extract";
import { decodeRevertData } from "@abiregistry/error-decoder/decode";
import { formatError } from "@abiregistry/error-decoder/format";
```

### Build your own registry

```ts
import { ErrorRegistry } from "@abiregistry/error-decoder";

const registry = new ErrorRegistry();
registry.registerAbi(myContractAbi, "MyContract");

const entry = registry.getBySelector("0xdb42144d");
```

### Multi-protocol bot

```ts
const decoder = createDecoder({ includeBuiltins: true });

decoder.registerAbi(uniswapAbi, "Uniswap");
decoder.registerAbi(aaveAbi, "Aave");
decoder.registerAbi(compoundAbi, "Compound");

const error = decoder.decode(revertData);
```

## Panic Codes

Built-in `Panic(uint256)` codes are automatically annotated:

| Code | Description |
|------|-------------|
| 0x00 | Generic compiler panic |
| 0x01 | Assert failed |
| 0x11 | Arithmetic overflow/underflow |
| 0x12 | Division or modulo by zero |
| 0x21 | Conversion to invalid enum value |
| 0x22 | Incorrectly encoded storage byte array |
| 0x31 | pop() on empty array |
| 0x32 | Array index out of bounds |
| 0x41 | Too much memory allocated |
| 0x51 | Call to zero-initialized internal function |

## License

MIT
