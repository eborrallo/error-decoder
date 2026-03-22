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
- **Short string revert codes** — CLI generates a lookup map in **your** repo; pass `createShortStringResolver(map)` to `createDecoder` / the viem plugin (nothing bundled in the SDK)
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

For gas-optimized `Error(string)` short codes, pass `resolveShortStringMessage` (see [Short string revert codes](#short-string-revert-codes)) — same option as `createDecoder`.

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
  resolveShortStringMessage: createShortStringResolver(SHORT_STRING_ERROR_CODES), // optional, client-generated map
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
- `index.ts` — barrel file re-exporting everything (also re-exports `SHORT_STRING_ERROR_CODES` if you generate `shortStringCodes.ts` into the same output directory first; see `generate-short-codes` below)

### Generate short-string lookup map

```bash
npx error-decoder generate-short-codes --input ./contracts/Codes.sol --output ./generated/shortStringCodes.ts
```

See [Short string revert codes](#short-string-revert-codes) for Solidity shapes and merging multiple files.

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

## Short string revert codes

Contracts sometimes use **short revert strings** (for example `revert("A1")`) to save gas, with the meaning defined beside them in Solidity as `string constant ErrorText1 = "A1";`.

The SDK **does not ship** a generated protocol table — only **CLI** (`generate-short-codes`) and **helpers** (`createShortStringResolver`, Solidity→TS codegen in `src/helpers/`). Generate the map **in your app** (or in this repo under **`example/`**), then pass a resolver into the decoder.

### Layout in this repo

| Path | Role |
|------|------|
| `src/cli/` | CLI entry (`error-decoder` binary) |
| `src/helpers/` | Short-string codegen + `createShortStringResolver` |
| `example/` | Demos; `example/tsconfig.json` maps `@example/*` → this folder and `@example-contracts/*` → `../example-contracts` |
| `example/run.ts` | End-to-end script: `createDecoder`, raw `eth_call`, short-string reverts (`npm run example` after generate) |
| `example/viem_run.ts` | Same contracts via `viem` + `errorDecoder()` (`npx tsx example/viem_run.ts`) |
| `tests/e2e.test.ts` | Vitest: Foundry `out/` + `SHORT_STRING_ERROR_CODES` on `Error(string)` (`_shortStringDescription`) |
| `example-contracts/` | Sample Foundry project (`ProtocolErrorCodes.sol` in a `library`, `FileLevelErrorCodes.sol` at file scope) |

**Generate example artifacts (from repo root):** run `forge build` in `example-contracts/`, then `npm run build && npm run example:generate`. That runs `generate:short-codes` (writes `example/generated/shortStringCodes.ts`) and the main `generate` command (error ABI + contract ABIs/bytecode). Then `npm run example` or `npx tsx example/viem_run.ts`.

### CLI: generate `SHORT_STRING_ERROR_CODES`

Supported Solidity shapes (scanner walks the whole file):

- **File-level:** `string constant Name = "A1";` (after `pragma`)
- **Library / contract:** `string internal|public|private constant Name = "A1";`

Merge multiple files (e.g. library in one file, file-level codes in another) with a **comma-separated** `--input`:

```bash
npx error-decoder generate-short-codes \
  --input ./contracts/LibraryCodes.sol,./contracts/FileLevelCodes.sol \
  --output ./src/generated/shortStringCodes.ts
```

```bash
npx error-decoder generate-short-codes \
  --input ./contracts/ProtocolErrorCodes.sol \
  --output ./src/generated/shortStringCodes.ts
```

In this repository, `npm run generate:short-codes` merges **`example-contracts/src/ProtocolErrorCodes.sol`** (library) and **`example-contracts/src/FileLevelErrorCodes.sol`** (file-level) into **`example/generated/shortStringCodes.ts`**.

This writes a module that exports `SHORT_STRING_ERROR_CODES` (short code → constant name). Regenerate whenever the `.sol` file(s) change.

### Use with `createDecoder`

```ts
import {
	createDecoder,
	createShortStringResolver,
} from "@abiregistry/error-decoder";
import { SHORT_STRING_ERROR_CODES } from "./generated/shortStringCodes.js";
// In this repo’s example: `from "@example/generated/shortStringCodes.js"` (see example/tsconfig.json)

const decoder = createDecoder({
	foundryOut: "./out",
	resolveShortStringMessage: createShortStringResolver(SHORT_STRING_ERROR_CODES),
});
```

### Viem plugin

```ts
import { errorDecoder } from "@abiregistry/error-decoder/viem";
import { createShortStringResolver } from "@abiregistry/error-decoder";
import { SHORT_STRING_ERROR_CODES } from "./generated/shortStringCodes.js";

const plugin = errorDecoder({
	errorAbis: [ERROR_ABI],
	resolveShortStringMessage: createShortStringResolver(SHORT_STRING_ERROR_CODES),
});
```

When a builtin `Error(string)` message matches a key in your map, decoding adds `_shortStringDescription`, and formatters append a `[short: …]` line.

### Low-level API

`decodeRevertData(data, registry, { resolveShortStringMessage })` accepts the same optional resolver.

## License

MIT
