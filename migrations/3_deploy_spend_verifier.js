/* global artifacts */
const SpendVerifier = artifacts.require('SpendVerifier')

module.exports = function(deployer) {
  deployer.deploy(SpendVerifier)
}
