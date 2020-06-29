/* global artifacts */
require('dotenv').config({ path: '../.env' })
const ETHPrivacyVault = artifacts.require('ETHPrivacyVault')
const SpendVerifier = artifacts.require('SpendVerifier')
const CommitmentVerifier = artifacts.require('CommitmentVerifier')
const hasherContract = artifacts.require('Hasher')


module.exports = function(deployer, network, accounts) {
  return deployer.then(async () => {
    const { MERKLE_TREE_HEIGHT } = process.env
	const spendVerifier = await SpendVerifier.deployed()
	const commitmentVerifier = await CommitmentVerifier.deployed()
    const hasherInstance = await hasherContract.deployed()
    await ETHPrivacyVault.link(hasherContract, hasherInstance.address)
    const privacyVault = await deployer.deploy(ETHPrivacyVault, spendVerifier.address,
		commitmentVerifier.address, MERKLE_TREE_HEIGHT, accounts[0])
    console.log('ETHPrivacyVault\'s address ', privacyVault.address)
  })
}
