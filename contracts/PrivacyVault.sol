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

import "./MerkleTreeWithRootHistory.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ISpendVerifier {
  function verifyProof(bytes memory _proof, uint256[4] memory _input) public returns(bool);
}

contract ICommitmentVerifier {
  function verifyProof(bytes memory _proof, uint256[2] memory _input) public returns(bool);
}

contract PrivacyVault is MerkleTreeWithRootHistory, ReentrancyGuard {
  mapping(bytes32 => bool) public nullifierHashes;
  // we store all commitments just to prevent accidental deposits with the same commitment
  mapping(bytes32 => bool) public commitments;

  ISpendVerifier public spendVerifier;
  ICommitmentVerifier public commitmentVerifier;

  // operator can update snark verification key
  // after the final trusted setup ceremony operator rights are supposed to be transferred to zero address
  address public operator;
  modifier onlyOperator {
    require(msg.sender == operator, "Only operator can call this function.");
    _;
  }

  event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp);
  event Spend(address to, bytes32 nullifierHash, uint256 spendValue);

  constructor(
	ISpendVerifier _spendVerifier,
    ICommitmentVerifier _commitmentVerifier,
    uint32 _merkleTreeHeight,
    address _operator
  ) MerkleTreeWithRootHistory(_merkleTreeHeight) public {
    spendVerifier = _spendVerifier;
	commitmentVerifier = _commitmentVerifier;
    operator = _operator;
  }


  function deposit(bytes calldata _proof, bytes32 _commitment, uint256 _value) external payable nonReentrant {
    require(!commitments[_commitment], "The commitment has been submitted");

    uint32 insertedIndex = _insert(_commitment);
    commitments[_commitment] = true;
    _processDeposit(_value);
    require(commitmentVerifier.verifyProof(_proof, [uint256(_commitment), _value]), "Invalid Commitment proof");
    emit Deposit(_commitment, insertedIndex, block.timestamp);
  }


  function _deposit(bytes memory _proof, bytes32 _commitment, uint256 _value) internal {
    require(!commitments[_commitment], "The commitment has been submitted");

    uint32 insertedIndex = _insert(_commitment);
    commitments[_commitment] = true;

    require(commitmentVerifier.verifyProof(_proof, [uint256(_commitment), _value]), "Invalid Commitment proof");

    emit Deposit(_commitment, insertedIndex, block.timestamp);
  }


  /** @dev this function is defined in a child contract */
  function _processDeposit(uint256 _value) internal;


  function spend(bytes calldata _proof, bytes calldata _commitmentProof, bytes32 _root, uint _index, uint _spendValue, uint _remainValue, bytes32 _nullifierHash, address payable _recipient, bytes32 _newCommitment) external payable nonReentrant {
    require(!nullifierHashes[_nullifierHash], "The note has been already spent");
    require(isKnownRoot(_root, _index), "Cannot find your merkle root");
    uint256 total = _spendValue + _remainValue;
    require(spendVerifier.verifyProof(_proof, [uint(_root), uint(_nullifierHash), total, uint256(_recipient)]), "Invalid Spend proof");

    nullifierHashes[_nullifierHash] = true;
    _processSpend(_recipient, _spendValue);
    emit Spend(_recipient, _nullifierHash, _spendValue);
    if (_remainValue > 0) {
       _deposit(_commitmentProof, _newCommitment, _remainValue);
    }

  }

  /** @dev this function is defined in a child contract */
  function _processSpend(address payable _recipient, uint256 _value) internal;

  /** @dev whether a note is already spent */
  function isSpent(bytes32 _nullifierHash) public view returns(bool) {
    return nullifierHashes[_nullifierHash];
  }

  /** @dev whether an array of notes is already spent */
  function isSpentArray(bytes32[] calldata _nullifierHashes) external view returns(bool[] memory spent) {
    spent = new bool[](_nullifierHashes.length);
    for(uint i = 0; i < _nullifierHashes.length; i++) {
      if (isSpent(_nullifierHashes[i])) {
        spent[i] = true;
      }
    }
  }


  function updateVerifier(address _newSpendVerifier, address _newCommitmentVerifier) external onlyOperator {
    spendVerifier = ISpendVerifier(_newSpendVerifier);
	commitmentVerifier = ICommitmentVerifier(_newCommitmentVerifier);
  }

  /** @dev operator can change his address */
  function changeOperator(address _newOperator) external onlyOperator {
    operator = _newOperator;
  }
}
