
Privacy Vault is a non-custodial Ethereum and ERC20 privacy solution based on zkSNARKs. It is inspired by tornardo cash. Currently it is under POC stage and have a node user interface. User can deposit ETH or ERC20 to corresponding privacy vault contract and get a notes which stand for his own privacy vault. After that user can make privacy donation and paymeng by spending his notes. If his spending is less than amount of the privacy vault, he will get a new notes which contain remaining amount. 


## Requirements
1. `node v11.15.0`
2. `npm install -g npx`

## Usage

You can see example usage in cli.js, it works both in console and in browser.

Use with command line version. Works for Kovan:
### Initialization
1. `npm install`
1. `cp .env.example .env` - add your Kovan private key to deploy contracts
1. `npm run build:circuit`
1.  change contract name of generated SpendVerifier.sol to SpendVerifier and change contract name of generated CommitmentVerifier.sol to CommitmentVerifier
1. `npm run build:contract`
1. `npm run migrate`
1. change corresponding smart contract address of config.js according to migration result


### Kovan, Mainnet
1. make sure you complete steps from Initialization
1. Add `PRIVATE_KEY` to `.env` file
1. `./cli.js --help`

Example:
You can make a ETH deposit
```bash
node cli.js  -r https://kovan.infura.io/v3/97c8bf358b9942a9853fab1ba93dc5b3 deposit  eth 0.000022
```
> Your note: privacyVault-eth-0.000022-42-0x9e41d8ed4ddcc283b8202e1ca04995b5bdc9063f4abf9c1c828251d36dd18037d50973b2edcf7f4e11d5948cc74713fe00c02c95ff9b6329bf1b51bf491600602f46021400000000000000000000000000000000000000000000000000

You can spend some of the note
```bash
 node cli.js  -r https://kovan.infura.io/v3/97c8bf358b9942a9853fab1ba93dc5b3 spend  privacyVault-eth-0.000022-42-0x9e41d8ed4ddcc283b8202e1ca04995b5bdc9063f4abf9c1c828251d36dd18037d50973b2edcf7f4e11d5948cc74713fe00c02c95ff9b6329bf1b51bf491600602f46021400000000000000000000000000000000000000000000000000 0x5d410946650c04d5BC236317e54406F3E9C7E77A 0.000009
```
> Your new note: 
privacyVault-eth-0.000013-42-0xf0c62112f9a41d3e36d2812dc200a7d739703fae5ec6742d52739b90898dcfcdbfc0151ccb1a15e0f69f7d861b2cd285b1cb2edc08701c20bc13708466f700d061ccd20b00000000000000000000000000000000000000000000000000

You can spend all of the note
```bash
 node cli.js  -r https://kovan.infura.io/v3/97c8bf358b9942a9853fab1ba93dc5b3 spend  privacyVault-eth-0.000013-42-0xf0c62112f9a41d3e36d2812dc200a7d739703fae5ec6742d52739b90898dcfcdbfc0151ccb1a15e0f69f7d861b2cd285b1cb2edc08701c20bc13708466f700d061ccd20b00000000000000000000000000000000000000000000000000 0x5d410946650c04d5BC236317e54406F3E9C7E77A 0.000013
```

You can make a Dai deposit
```bash
node cli.js  -r https://kovan.infura.io/v3/97c8bf358b9942a9853fab1ba93dc5b3 deposit  dai 8.8
```
> Your note: privacyVault-dai-8.8-42-0x256372a490262dc8dfa2f82364ef15a37adae6283483eb9578ce212f004b2cfff5de44ce7a8d116fa6da3b57f50437e025686e80f2de8ce95f22052a75b10000702760e11f7a0000000000000000000000000000000000000000000000

You can spend some Dai
```bash
 node cli.js  -r https://kovan.infura.io/v3/97c8bf358b9942a9853fab1ba93dc5b3 spend  privacyVault-dai-8.8-42-0x256372a490262dc8dfa2f82364ef15a37adae6283483eb9578ce212f004b2cfff5de44ce7a8d116fa6da3b57f50437e025686e80f2de8ce95f22052a75b10000702760e11f7a0000000000000000000000000000000000000000000000 0x5d410946650c04d5BC236317e54406F3E9C7E77A 3
```

## Deploy ETH Tornado Cash
1. `cp .env.example .env`
1. Tune all necessary params
1. `npx truffle migrate --network kovan --reset --f 2 --to 4`

## Deploy ERC20 Tornado Cash
1. `cp .env.example .env`
1. Tune all necessary params
1. `npx truffle migrate --network kovan --reset --f 2 --to 3`
1. `npx truffle migrate --network kovan --reset --f 5`

**Note**. If you want to reuse the same verifier for all the instances, then after you deployed one of the instances you should only run 4th or 5th migration for ETH or ERC20 contracts respectively (`--f 4 --to 4` or `--f 5`).
`

## Credits

Special thanks to tornardo cash team,
and to @jbaylina for awesome [Circom](https://github.com/iden3/circom) & [Websnark](https://github.com/iden3/websnark) framework

