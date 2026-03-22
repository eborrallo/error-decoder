// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ProtocolErrorCodes} from "./ProtocolErrorCodes.sol";

contract Lending {
    error PositionNotFound(uint256 positionId);
    error HealthFactorTooLow(uint256 positionId, uint256 healthFactor, uint256 minHealthFactor);
    error CollateralNotSupported(address token);
    error BorrowCapExceeded(address token, uint256 cap, uint256 totalBorrowed);
    error OracleStale(address oracle, uint256 lastUpdate, uint256 maxAge);
    error LiquidationNotAllowed(uint256 positionId, uint256 healthFactor);
    error RepayExceedsDebt(uint256 positionId, uint256 repayAmount, uint256 debt);

    struct Position {
        address owner;
        address collateral;
        address debt;
        uint256 collateralAmount;
        uint256 debtAmount;
        bool active;
    }

    mapping(uint256 => Position) public positions;
    mapping(address => bool) public supportedCollateral;
    mapping(address => uint256) public borrowCaps;
    mapping(address => uint256) public totalBorrowed;
    uint256 public nextPositionId;

    function borrow(uint256 positionId, uint256 amount) external {
        Position storage pos = positions[positionId];
        if (!pos.active) {
            revert PositionNotFound(positionId);
        }

        uint256 newTotal = totalBorrowed[pos.debt] + amount;
        uint256 cap = borrowCaps[pos.debt];
        if (cap > 0 && newTotal > cap) {
            revert BorrowCapExceeded(pos.debt, cap, newTotal);
        }

        pos.debtAmount += amount;
        totalBorrowed[pos.debt] = newTotal;
    }

    function repay(uint256 positionId, uint256 amount) external {
        Position storage pos = positions[positionId];
        if (!pos.active) revert PositionNotFound(positionId);
        if (amount > pos.debtAmount) {
            revert RepayExceedsDebt(positionId, amount, pos.debtAmount);
        }
        pos.debtAmount -= amount;
    }

    /// @dev Demo: second library short code (`A2`) for on-chain decode checks.
    function demoShortStringProtocol2() external pure {
        revert(ProtocolErrorCodes.ErrorText2);
    }
}
