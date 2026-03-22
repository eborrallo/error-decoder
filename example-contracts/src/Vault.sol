// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ProtocolErrorCodes} from "./ProtocolErrorCodes.sol";

contract Vault {
    error InsufficientBalance(address user, uint256 requested, uint256 available);
    error Unauthorized(address caller, address required);
    error VaultLocked(uint256 unlockTime);
    error ZeroAmount();
    error InvalidToken(address token);
    error SlippageExceeded(uint256 expected, uint256 actual, uint256 maxSlippage);

    mapping(address => uint256) public balances;
    address public owner;
    uint256 public unlockTime;
    bool public locked;

    constructor() {
        owner = msg.sender;
    }

    function deposit() external payable {
        if (msg.value == 0) revert ZeroAmount();
        balances[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external {
        if (locked && block.timestamp < unlockTime) {
            revert VaultLocked(unlockTime);
        }
        if (balances[msg.sender] < amount) {
            revert InsufficientBalance(msg.sender, amount, balances[msg.sender]);
        }
        balances[msg.sender] -= amount;
        payable(msg.sender).transfer(amount);
    }

    function adminWithdraw(uint256 amount) external {
        if (msg.sender != owner) {
            revert Unauthorized(msg.sender, owner);
        }
        payable(owner).transfer(amount);
    }

    function lock(uint256 duration) external {
        if (msg.sender != owner) {
            revert Unauthorized(msg.sender, owner);
        }
        locked = true;
        unlockTime = block.timestamp + duration;
    }

    /// @dev Demo: short-string revert from `ProtocolErrorCodes` library (`Error(string)` with message `A1`).
    function demoShortStringProtocol() external pure {
        revert(ProtocolErrorCodes.ErrorText1);
    }
}
