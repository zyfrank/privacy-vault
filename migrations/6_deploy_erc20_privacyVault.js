/* global artifacts */
require('dotenv').config({ path: '../.env' })
const ERC20PrivacyVault = artifacts.require('ERC20PrivacyVault')
const SpendVerifier = artifacts.require('SpendVerifier')
const CommitmentVerifier = artifacts.require('CommitmentVerifier')
const hasherContract = artifacts.require('Hasher')
const ERC20Mock = artifacts.require('ERC20Mock')


module.exports = function(deployer, network, accounts) {
  return deployer.then(async () => {
    const { MERKLE_TREE_HEIGHT, ERC20_TOKEN } = process.env
	const spendVerifier = await SpendVerifier.deployed()
	const commitmentVerifier = await CommitmentVerifier.deployed()
    const hasherInstance = await hasherContract.deployed()
    await ERC20PrivacyVault.link(hasherContract, hasherInstance.address)
    let token = ERC20_TOKEN
    if(token === '') {
      const tokenInstance = await deployer.deploy(ERC20Mock)
      token = tokenInstance.address
    }
    const privacyVault = await deployer.deploy(
      ERC20PrivacyVault,
	  spendVerifier.address,
	  commitmentVerifier.address,
      MERKLE_TREE_HEIGHT,
      accounts[0],
      token,
    )
    console.log('ERC20PrivacyVault\'s address ', privacyVault.address)
  })
}
