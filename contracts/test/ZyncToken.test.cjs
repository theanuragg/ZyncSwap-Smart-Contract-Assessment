const { expect } = require("chai");
const hre = require("hardhat");

describe("ZyncToken", function () {
  async function deployToken() {
    const [owner, holder, spender] = await hre.ethers.getSigners();
    const price = hre.ethers.parseEther("0.001");
    const Z = await hre.ethers.getContractFactory("ZyncToken");
    const token = await Z.deploy(price);
    await token.waitForDeployment();
    return { token, owner, holder, spender, price };
  }

  it("mints ZYNC for ETH at the public price", async function () {
    const { token, holder: buyer, price } = await deployToken();

    const tx = await token.connect(buyer).mintWithEth({ value: price });
    await tx.wait();

    const bal = await token.balanceOf(buyer.address);
    expect(bal).to.equal(hre.ethers.parseEther("1"));

    expect(await hre.ethers.provider.getBalance(await token.getAddress())).to.equal(price);
  });

  describe("burn", function () {
    it("burns caller tokens and reduces total supply", async function () {
      const { token, owner, holder } = await deployToken();
      const minted = hre.ethers.parseEther("100");
      const burned = hre.ethers.parseEther("25");
      await token.connect(owner).mintTo(holder.address, minted);

      await expect(token.connect(holder).burn(burned))
        .to.emit(token, "Burned")
        .withArgs(holder.address, burned);

      expect(await token.balanceOf(holder.address)).to.equal(minted - burned);
      expect(await token.totalSupply()).to.equal(minted - burned);
      expect(await token.totalBurned()).to.equal(burned);
    });

    it("reverts when burn amount is zero", async function () {
      const { token, holder } = await deployToken();

      await expect(token.connect(holder).burn(0))
        .to.be.revertedWithCustomError(token, "ZeroAmount");
    });

    it("reverts when burn exceeds balance", async function () {
      const { token, holder } = await deployToken();
      const amount = hre.ethers.parseEther("1");

      await expect(token.connect(holder).burn(amount))
        .to.be.revertedWithCustomError(token, "ERC20InsufficientBalance")
        .withArgs(holder.address, 0, amount);
    });
  });

  describe("burnFrom", function () {
    it("burns from an approved account and decreases allowance", async function () {
      const { token, owner, holder, spender } = await deployToken();
      const minted = hre.ethers.parseEther("100");
      const allowance = hre.ethers.parseEther("40");
      const burned = hre.ethers.parseEther("15");
      await token.connect(owner).mintTo(holder.address, minted);
      await token.connect(holder).approve(spender.address, allowance);

      await expect(token.connect(spender).burnFrom(holder.address, burned))
        .to.emit(token, "Burned")
        .withArgs(holder.address, burned);

      expect(await token.balanceOf(holder.address)).to.equal(minted - burned);
      expect(await token.totalSupply()).to.equal(minted - burned);
      expect(await token.allowance(holder.address, spender.address)).to.equal(allowance - burned);
      expect(await token.totalBurned()).to.equal(burned);
    });

    it("reverts without allowance", async function () {
      const { token, owner, holder, spender } = await deployToken();
      const minted = hre.ethers.parseEther("10");
      const burned = hre.ethers.parseEther("1");
      await token.connect(owner).mintTo(holder.address, minted);

      await expect(token.connect(spender).burnFrom(holder.address, burned))
        .to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance")
        .withArgs(spender.address, 0, burned);
    });

    it("reverts when allowance is insufficient", async function () {
      const { token, owner, holder, spender } = await deployToken();
      const minted = hre.ethers.parseEther("10");
      const allowance = hre.ethers.parseEther("1");
      const burned = hre.ethers.parseEther("2");
      await token.connect(owner).mintTo(holder.address, minted);
      await token.connect(holder).approve(spender.address, allowance);

      await expect(token.connect(spender).burnFrom(holder.address, burned))
        .to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance")
        .withArgs(spender.address, allowance, burned);
    });

    it("reverts when approved burn exceeds balance", async function () {
      const { token, holder, spender } = await deployToken();
      const burned = hre.ethers.parseEther("1");
      await token.connect(holder).approve(spender.address, burned);

      await expect(token.connect(spender).burnFrom(holder.address, burned))
        .to.be.revertedWithCustomError(token, "ERC20InsufficientBalance")
        .withArgs(holder.address, 0, burned);
    });
  });
});
