
include "commitmentHasher.circom";

// Verifies that commitment that contain specific amount
 template CommitmentCheck() {
	signal input commitment;
    signal input amount;
    signal private input nullifier;
    signal private input secret;

    component hasher = CommitmentHasher();

    hasher.nullifier <== nullifier;
    hasher.secret <== secret;
    hasher.amount <== amount;

    hasher.commitment === commitment;
}

component main = CommitmentCheck()