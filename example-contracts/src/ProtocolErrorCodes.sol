// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

/// @dev Example: constants inside a `library` (same pattern works inside a `contract`).
/// File-level `string constant ...` (no wrapper) is supported too — see `FileLevelErrorCodes.sol`; merge both via comma-separated `--input` when generating TS.

library ProtocolErrorCodes {
    /// @dev `public` so other contracts can `revert(ProtocolErrorCodes.ErrorTextN)`.
    string public constant ErrorText1 = "A1";
    string public constant ErrorText2 = "A2";
    string public constant ErrorText3 = "A3";
}
