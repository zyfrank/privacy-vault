pragma solidity 0.5.17;

import '../MerkleTreeWithRootHistory.sol';

contract MerkleTreeWithRootHistoryMock is MerkleTreeWithRootHistory {

  constructor (uint32 _treeLevels) MerkleTreeWithRootHistory(_treeLevels) public {}

  function insert(bytes32 _leaf) public {
      _insert(_leaf);
  }
}
