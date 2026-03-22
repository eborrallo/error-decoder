// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {PlainErrorText1} from "./FileLevelErrorCodes.sol";

contract DEX {
    error PairNotFound(address tokenA, address tokenB);
    error InsufficientLiquidity(address pool, uint256 required, uint256 available);
    error DeadlineExpired(uint256 deadline, uint256 currentTime);
    error PriceImpactTooHigh(uint256 impactBps, uint256 maxBps);
    error InvalidPath(address[] path);
    error SwapFailed(bytes reason);

    struct Pool {
        address tokenA;
        address tokenB;
        uint256 reserveA;
        uint256 reserveB;
    }

    mapping(bytes32 => Pool) public pools;

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline
    ) external returns (uint256) {
        if (block.timestamp > deadline) {
            revert DeadlineExpired(deadline, block.timestamp);
        }

        bytes32 pairId = keccak256(abi.encodePacked(tokenIn, tokenOut));
        Pool storage pool = pools[pairId];

        if (pool.tokenA == address(0)) {
            revert PairNotFound(tokenIn, tokenOut);
        }

        if (pool.reserveB < minAmountOut) {
            revert InsufficientLiquidity(address(this), minAmountOut, pool.reserveB);
        }

        uint256 amountOut = (amountIn * pool.reserveB) / (pool.reserveA + amountIn);

        uint256 impactBps = ((pool.reserveB - amountOut) * 10000) / pool.reserveB;
        if (impactBps > 500) {
            revert PriceImpactTooHigh(impactBps, 500);
        }

        return amountOut;
    }

    /// @dev Demo: file-level short-string constant (`Error(string)` with message `P1`).
    function demoShortStringFileLevel() external pure {
        revert(PlainErrorText1);
    }
}
