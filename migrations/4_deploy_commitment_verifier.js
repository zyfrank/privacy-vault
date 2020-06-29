/* global artifacts */
const CommitmentVerifier = artifacts.require('CommitmentVerifier')

module.exports = function(deployer) {
  deployer.deploy(CommitmentVerifier)
}
