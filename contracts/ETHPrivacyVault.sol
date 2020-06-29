// https://tornado.cash
/*
* d888888P                                           dP              a88888b.                   dP
*    88                                              88             d8'   `88                   88
*    88    .d8888b. 88d888b. 88d888b. .d8888b. .d888b88 .d8888b.    88        .d8888b. .d8888b. 88d888b.
*    88    88'  `88 88'  `88 88'  `88 88'  `88 88'  `88 88'  `88    88        88'  `88 Y8ooooo. 88'  `88
*    88    88.  .88 88       88    88 88.  .88 88.  .88 88.  .88 dP Y8.   .88 88.  .88       88 88    88
*    dP    `88888P' dP       dP    dP `88888P8 `88888P8 `88888P' 88  Y88888P' `88888P8 `88888P' dP    dP
* ooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooo
*/

pragma solidity 0.5.17;

import "./PrivacyVault.sol";

contract ETHPrivacyVault is PrivacyVault {
  constructor(
    ISpendVerifier _spendVerifier,
    ICommitmentVerifier _commitmentVerifier,
    uint32 _merkleTreeHeight,
    address _operator
  ) PrivacyVault(_spendVerifier, _commitmentVerifier, _merkleTreeHeight, _operator) public {
  }

  function _processDeposit(uint256 _value) internal {
    require(msg.value == _value, "Please send `_value` ETH along with transaction");
  }

  function _processSpend(address payable _recipient, uint256 _value) internal {
    // sanity checks
    require(msg.value == 0, "Message value is supposed to be zero for ETH instance");

    (bool success, ) = _recipient.call.value(_value)("");
    require(success, "payment to _recipient did not go thru");

  }
}
