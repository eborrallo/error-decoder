## error-decoder example contracts

- **`src/ProtocolErrorCodes.sol`** — short codes inside a **`library`** (`ErrorText1`…`"A3"`).
- **`src/FileLevelErrorCodes.sol`** — the same pattern as **file-level** `string constant` lines (no wrapper).
- **On-chain demos** (revert with gas-optimized `Error(string)`; decode with the generated map):
  - **`Vault.demoShortStringProtocol()`** → message `A1` (library constant `ErrorText1`)
  - **`DEX.demoShortStringFileLevel()`** → `P1` (`PlainErrorText1`, file-level)
  - **`Lending.demoShortStringProtocol2()`** → `A2` (`ErrorText2`)

- From the repo root, `npm run generate:short-codes` merges both `.sol` files into `example/generated/shortStringCodes.ts`:

  ```bash
  npm run generate:short-codes
  ```

  This writes `../example/generated/shortStringCodes.ts` (or your `-o` path). Import that map and pass `createShortStringResolver(SHORT_STRING_ERROR_CODES)` to `createDecoder` or `errorDecoder()`.

---

## Foundry

**Foundry is a blazing fast, portable and modular toolkit for Ethereum application development written in Rust.**

Foundry consists of:

- **Forge**: Ethereum testing framework (like Truffle, Hardhat and DappTools).
- **Cast**: Swiss army knife for interacting with EVM smart contracts, sending transactions and getting chain data.
- **Anvil**: Local Ethereum node, akin to Ganache, Hardhat Network.
- **Chisel**: Fast, utilitarian, and verbose solidity REPL.

## Documentation

https://book.getfoundry.sh/

## Usage

### Build

```shell
$ forge build
```

### Test

```shell
$ forge test
```

### Format

```shell
$ forge fmt
```

### Gas Snapshots

```shell
$ forge snapshot
```

### Anvil

```shell
$ anvil
```

### Deploy

```shell
$ forge script script/Counter.s.sol:CounterScript --rpc-url <your_rpc_url> --private-key <your_private_key>
```

### Cast

```shell
$ cast <subcommand>
```

### Help

```shell
$ forge --help
$ anvil --help
$ cast --help
```
