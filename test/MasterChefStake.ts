import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { MasterChefStake, StakeToken } from "../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

async function deployStakeToken() {
  const StakeToken = await ethers.getContractFactory("StakeToken");
  const stakeToken = await StakeToken.deploy();
  return stakeToken;
}

async function mineNBlocks(n: number) {
  for (let index = 0; index < n; index++) {
    await ethers.provider.send("evm_mine", []);
  }
}

describe("MasterChefStake", function () {
  async function deployMasterChefStake() {
    const stakeToken = await deployStakeToken();

    const [owner, otherAccount] = await ethers.getSigners();
    const MasterChefStake = await ethers.getContractFactory("MasterChefStake");
    const startBlock = await ethers.provider.getBlockNumber();
    const stakeTokenPerBlock = 100000;
    const masterChefStake = await MasterChefStake.deploy(
      stakeToken.address,
      stakeTokenPerBlock,
      startBlock
    );

    await stakeToken.connect(owner).transferOwnership(masterChefStake.address);
    return {
      owner,
      masterChefStake,
      otherAccount,
      stakeToken,
      startBlock,
      stakeTokenPerBlock,
    };
  }

  describe("Deployment", function () {
    it("Should set the right stakeTokenPerBlock, startBlock, totalAllocPoint and stakeToken", async function () {
      const { masterChefStake, stakeToken, startBlock, stakeTokenPerBlock } =
        await loadFixture(deployMasterChefStake);

      expect(await masterChefStake.stakeToken()).to.equal(stakeToken.address);
      expect(await masterChefStake.stakeTokenPerBlock()).to.equal(
        stakeTokenPerBlock
      );
      expect(await masterChefStake.startBlock()).to.equal(startBlock);
      expect(await masterChefStake.totalAllocPoint()).to.equal(1000);
    });

    it("StakeToke Should have masterChefStake as owner", async function () {
      const { masterChefStake, stakeToken } = await loadFixture(
        deployMasterChefStake
      );
      expect(await stakeToken.owner()).to.equal(masterChefStake.address);
    });
  });

  describe("Deployment", function () {
    let masterChefStake: MasterChefStake,
      owner: SignerWithAddress,
      stakeToken: StakeToken,
      startBlock: number,
      stakeTokenPerBlock: number,
      erc20Token: StakeToken,
      currentBlock: number;
    this.beforeEach(async () => {
      const data = await loadFixture(deployMasterChefStake);
      masterChefStake = data.masterChefStake;
      owner = data.owner;
      stakeToken = data.stakeToken;
      startBlock = data.startBlock;
      stakeTokenPerBlock = data.stakeTokenPerBlock;
      erc20Token = await deployStakeToken();
      await erc20Token
        .connect(owner)
        .mint(owner.address, "1000000000000000000000");
      currentBlock = (await ethers.provider.getBlockNumber()) + 1;
    });

    it("masterChefStake Should add token in tokenInfo", async function () {
      await masterChefStake.connect(owner).add(100, erc20Token.address);

      const { token, allocPoint, lastRewardBlock, accStakePerShare } =
        await masterChefStake.tokenInfo(0);

      expect(token).to.equal(erc20Token.address);
      expect(allocPoint).to.equal(BigNumber.from(100));
      expect(lastRewardBlock).to.equal(
        BigNumber.from(currentBlock > startBlock ? currentBlock : startBlock)
      );
      expect(accStakePerShare).to.be.equal(BigNumber.from(0));
    });

    it("masterChefStake Should deposit token", async function () {
      await masterChefStake.connect(owner).add(100, erc20Token.address);

      const depositAmount = 10000000000000;
      let currentBalance = await erc20Token.balanceOf(owner.address);
      await erc20Token
        .connect(owner)
        .approve(masterChefStake.address, depositAmount);

      await expect(
        masterChefStake.connect(owner).deposit(0, depositAmount)
      ).to.emit(masterChefStake, "Deposit");

      const updatedBalance = await erc20Token.balanceOf(owner.address);
      const userInfo = await masterChefStake.userInfo(0, owner.address);
      const tokenInfo = await masterChefStake.tokenInfo(0);

      expect(BigNumber.from(updatedBalance)).to.equal(
        BigNumber.from(currentBalance).sub(depositAmount)
      );
      expect(BigNumber.from(userInfo.amount)).to.equal(
        BigNumber.from(depositAmount)
      );
      expect(BigNumber.from(userInfo.rewardDebt)).to.equal(
        BigNumber.from(tokenInfo.accStakePerShare).mul(depositAmount).div(1e12)
      );

      await mineNBlocks(1000);

      currentBalance = await erc20Token.balanceOf(owner.address);
      await erc20Token
        .connect(owner)
        .approve(masterChefStake.address, depositAmount);
      const stakeBalance = await stakeToken.balanceOf(owner.address);
      await masterChefStake.connect(owner).deposit(0, depositAmount);
      const updatedStakeBalance = await stakeToken.balanceOf(owner.address);

      expect(updatedStakeBalance).to.be.gt(stakeBalance);
    });

    it("masterChefStake Should withdraw token", async function () {
      await masterChefStake.connect(owner).add(100, erc20Token.address);

      const depositAmount = 10000000000000;
      await erc20Token
        .connect(owner)
        .approve(masterChefStake.address, depositAmount);

      await masterChefStake.connect(owner).deposit(0, depositAmount);

      const depositUserInfo = await masterChefStake.userInfo(0, owner.address);
      const depositTokenInfo = await masterChefStake.tokenInfo(0);

      await mineNBlocks(1000);

      const currentBlock = await ethers.provider.getBlockNumber();
      const multiplier = await masterChefStake.getMultiplier(
        currentBlock - 1000,
        currentBlock + 1
      );

      const totalAllocPoint = await masterChefStake.totalAllocPoint();
      const stakeReward = BigNumber.from(multiplier)
        .mul(stakeTokenPerBlock)
        .mul(depositTokenInfo.allocPoint)
        .div(totalAllocPoint);

      const tokenSupply = await erc20Token.balanceOf(masterChefStake.address);

      const accStakePerShare = depositTokenInfo.accStakePerShare.add(
        stakeReward.mul(1e12).div(tokenSupply)
      );

      await expect(
        masterChefStake.connect(owner).withdraw(0, depositAmount / 2)
      ).to.emit(masterChefStake, "Withdraw");

      const withdrawTokenInfo = await masterChefStake.tokenInfo(0);
      const withdrawUserInfo = await masterChefStake.userInfo(0, owner.address);

      expect(withdrawTokenInfo.accStakePerShare).to.equal(accStakePerShare);

      expect(withdrawUserInfo.rewardDebt).to.equal(
        depositUserInfo.amount
          .div(2)
          .mul(withdrawTokenInfo.accStakePerShare)
          .div(1e12)
      );
    });
  });
});
