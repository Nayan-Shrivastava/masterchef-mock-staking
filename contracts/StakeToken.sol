// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// StakeToken
contract StakeToken is Ownable, ERC20("StakeToken", "ST") {
    /// @dev Creates `_amount` token to `_to`. Must only be called by the owner (MasterChef).
    function mint(address _to, uint256 _amount) public onlyOwner {
        _mint(_to, _amount);
    }

    function safeStakeTokenTransfer(address _to, uint256 _amount)
        public
        onlyOwner
    {
        uint256 stakeBal = balanceOf(msg.sender);
        if (_amount > stakeBal) {
            _transfer(msg.sender, _to, stakeBal);
        } else {
            _transfer(msg.sender, _to, _amount);
        }
    }
}
