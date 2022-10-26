// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// import "@nomiclabs/buidler/console.sol";

import "./StakeToken.sol";

contract MasterChefStake is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    struct UserInfo {
        uint256 amount;
        uint256 rewardDebt;
    }

    // Info of each pool.
    struct TokenInfo {
        IERC20 token; // Address of LP token contract.
        uint256 allocPoint; // How many allocation points assigned to this pool. CAKEs to distribute per block.
        uint256 lastRewardBlock; // Last block number that CAKEs distribution occurs.
        uint256 accStakePerShare; // Accumulated CAKEs per share, times 1e12. See below.
    }

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(
        address indexed user,
        uint256 indexed pid,
        uint256 amount
    );

    // The STAKE TOKEN!
    StakeToken public stakeToken;

    // CAKE tokens created per block.
    uint256 public stakeTokenPerBlock;

    // Bonus muliplier for early cake makers.
    uint256 public BONUS_MULTIPLIER = 1;

    // Info of each pool.
    TokenInfo[] public tokenInfo;

    // Info of each user that stakes LP tokens.
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    // Total allocation points. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint = 0;
    // The block number when CAKE mining starts.
    uint256 public startBlock;

    constructor(
        StakeToken _stakeToken,
        uint256 _stakeTokenPerBlock,
        uint256 _startBlock
    ) {
        stakeToken = _stakeToken;
        stakeTokenPerBlock = _stakeTokenPerBlock;
        startBlock = _startBlock;

        totalAllocPoint = 1000;
    }

    function add(
        uint256 _allocPoint,
        IERC20 _token
    ) public onlyOwner {
        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        tokenInfo.push(
            TokenInfo({token: _token, allocPoint: _allocPoint, lastRewardBlock: lastRewardBlock, accStakePerShare: 0})
        );
    }

    // Deposit ERC20 tokens to MasterChef for Stake allocation.
    function deposit(uint256 _tokenId, uint256 _amount) public {
        TokenInfo storage token = tokenInfo[_tokenId];
        UserInfo storage user = userInfo[_tokenId][msg.sender];
        updateTokenInfo(_tokenId);
        if (user.amount > 0) {
            uint256 pending = user
                .amount
                .mul(token.accStakePerShare)
                .div(1e12)
                .sub(user.rewardDebt);
            if (pending > 0) {
                stakeToken.safeStakeTokenTransfer(msg.sender, pending);
            }
        }
        if (_amount > 0) {
            token.token.safeTransferFrom(
                address(msg.sender),
                address(this),
                _amount
            );
            user.amount = user.amount.add(_amount);
        }
        user.rewardDebt = user.amount.mul(token.accStakePerShare).div(1e12);
        emit Deposit(msg.sender, _tokenId, _amount);
    }

    // Withdraw ERC20 tokens from MasterChef.
    function withdraw(uint256 _tokenId, uint256 _amount) public {
        TokenInfo storage token = tokenInfo[_tokenId];
        UserInfo storage user = userInfo[_tokenId][msg.sender];
        require(user.amount >= _amount, "withdraw: not good");

        updateTokenInfo(_tokenId);
        uint256 pending = user.amount.mul(token.accStakePerShare).div(1e12).sub(
            user.rewardDebt
        );
        if (pending > 0) {
            stakeToken.safeStakeTokenTransfer(msg.sender, pending);
        }
        if (_amount > 0) {
            user.amount = user.amount.sub(_amount);
            token.token.safeTransfer(address(msg.sender), _amount);
        }
        user.rewardDebt = user.amount.mul(token.accStakePerShare).div(1e12);
        emit Withdraw(msg.sender, _tokenId, _amount);
    }

    // Update reward variables of the given pool to be up-to-date.
    function updateTokenInfo(uint256 _tokenId) public {
        TokenInfo storage token = tokenInfo[_tokenId];
        if (block.number <= token.lastRewardBlock) {
            return;
        }
        uint256 tokenSupply = token.token.balanceOf(address(this));
        if (tokenSupply == 0) {
            token.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = getMultiplier(token.lastRewardBlock, block.number);
        uint256 stakeReward = multiplier
            .mul(stakeTokenPerBlock)
            .mul(token.allocPoint)
            .div(totalAllocPoint);

        stakeToken.mint(address(this), stakeReward);
        token.accStakePerShare = token.accStakePerShare.add(
            stakeReward.mul(1e12).div(tokenSupply)
        );
        token.lastRewardBlock = block.number;
    }

    // Return reward multiplier over the given _from to _to block.
    function getMultiplier(uint256 _from, uint256 _to) public view returns (uint256) {
        return _to.sub(_from).mul(BONUS_MULTIPLIER);
    }
}
