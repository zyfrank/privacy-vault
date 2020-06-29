#!/usr/bin/env node
// Temporary demo client
// Works both in browser and node.js

require('dotenv').config()
const fs = require('fs')
const assert = require('assert')
const snarkjs = require('snarkjs')
const crypto = require('crypto')
const circomlib = require('circomlib')
const bigInt = snarkjs.bigInt
const merkleTree = require('./lib/MerkleTree')
const Web3 = require('web3')
const buildGroth16 = require('websnark/src/groth16')
const websnarkUtils = require('websnark/src/utils')
const { toWei, fromWei, toBN, BN } = require('web3-utils')
const config = require('./config')
const program = require('commander')

let web3, privacyVault, spend_circuit, deposit_circuit, spend_proving_key, deposit_proving_key, groth16, erc20, senderAccount, netId
let MERKLE_TREE_HEIGHT, PRIVATE_KEY

/** Whether we are in a browser or node.js */
const inBrowser = (typeof window !== 'undefined')
let isLocalRPC = false

/** Generate random number of specified byte length */
const rbigint = nbytes => snarkjs.bigInt.leBuff2int(crypto.randomBytes(nbytes))

/** Compute pedersen hash */
const pedersenHash = data => circomlib.babyJub.unpackPoint(circomlib.pedersenHash.hash(data))[0]

/** BigNumber to hex string of specified length */
function toHex(number, length = 32) {
  const str = number instanceof Buffer ? number.toString('hex') : bigInt(number).toString(16)
  return '0x' + str.padStart(length * 2, '0')
}

/** Display ETH account balance */
async function printETHBalance({ address, name }) {
  console.log(`${name} ETH balance is`, web3.utils.fromWei(await web3.eth.getBalance(address)))
}

/** Display ERC20 account balance */
async function printERC20Balance({ address, name, tokenAddress }) {
  const erc20ContractJson = require('./build/contracts/ERC20Mock.json')
  erc20 = tokenAddress ? new web3.eth.Contract(erc20ContractJson.abi, tokenAddress) : erc20
  console.log(`${name} Token Balance is`, web3.utils.fromWei(await erc20.methods.balanceOf(address).call()))
}

/**
 * Create deposit object from amount
 */
function createDeposit({ nullifier, secret, amount }) {
  let deposit = {}
  deposit.nullifier =  nullifier
  deposit.secret =  secret
  deposit.amount = amount
  deposit.preimage = Buffer.concat([deposit.nullifier.leInt2Buff(31), deposit.secret.leInt2Buff(31), deposit.amount.leInt2Buff(31)])
  deposit.commitment = pedersenHash(deposit.preimage)
  deposit.commitmentHex = toHex(deposit.commitment)
  deposit.nullifierHash = pedersenHash(deposit.nullifier.leInt2Buff(31))
  deposit.nullifierHex = toHex(deposit.nullifierHash)
  deposit.amountHex = toHex(deposit.amount)
  return deposit
}

/**
 * Make a deposit
 * @param currency Сurrency
 * @param amount Deposit amount
 */
async function deposit({ currency, amount }) {
  const deposit = createDeposit({ nullifier:rbigint(31), secret:rbigint(31), amount: bigInt(toWei(amount)) })
  const note = toHex(deposit.preimage, 93)
  const noteString = `privacyVault-${currency}-${amount}-${netId}-${note}`
  console.log(`Your note: ${noteString}`)
  const {proof, args} = await generateDepositProof(deposit)
  if (currency === 'eth') {
    await printETHBalance({ address: privacyVault._address, name: 'PrivacyVault' })
    await printETHBalance({ address: senderAccount, name: 'Sender account' })
    const value = fromDecimals({ amount, decimals: 18 })
    console.log('Submitting deposit transaction')
    await privacyVault.methods.deposit(proof, ...args).send({ value, from: senderAccount, gas: 6e6 })
    await printETHBalance({ address: privacyVault._address, name: 'PrivacyVault' })
    await printETHBalance({ address: senderAccount, name: 'Sender account' })
  } else { // a token
    await printERC20Balance({ address: privacyVault._address, name: 'PrivacyVault' })
    await printERC20Balance({ address: senderAccount, name: 'Sender account' })
    const tokenAmount = fromDecimals({ amount, decimals: 18 })

    const allowance = await erc20.methods.allowance(senderAccount, privacyVault._address).call({ from: senderAccount })
    console.log('Current allowance is', fromWei(allowance))
    if (toBN(allowance).lt(toBN(tokenAmount))) {
	  console.log('Approving tokens for deposit')
	  console.log('tokenAmount:'+ tokenAmount)
      await erc20.methods.approve(privacyVault._address, toHex(tokenAmount)).send({ from: senderAccount, gas: 1e6 })
    }

    console.log('Submitting deposit transaction')
    await privacyVault.methods.deposit(proof, ...args).send({ from: senderAccount, gas: 2e6 })
    await printERC20Balance({ address: privacyVault._address, name: 'PrivacyVault' })
    await printERC20Balance({ address: senderAccount, name: 'Sender account' })
  }

  return noteString
}

/**
 * Generate merkle tree for a deposit.
 * Download deposit events from the privacyVault, reconstructs merkle tree, finds our deposit leaf
 * in it and generates merkle proof
 * @param deposit Deposit object
 */
async function generateMerkleProof(deposit) {
  // Get all deposit events from smart contract and assemble merkle tree from them
  console.log('Getting current state from privacyVault contract')
  const events = await privacyVault.getPastEvents('Deposit', { fromBlock: 0, toBlock: 'latest' })
  const leaves = events
    .sort((a, b) => a.returnValues.leafIndex - b.returnValues.leafIndex) // Sort events in chronological order
	.map(e => e.returnValues.commitment)
  console.log('leaves:' + leaves.length)
  const tree = new merkleTree(MERKLE_TREE_HEIGHT, leaves)

  // Find current commitment in the tree
  const depositEvent = events.find(e => e.returnValues.commitment === toHex(deposit.commitment))
  const leafIndex = depositEvent ? depositEvent.returnValues.leafIndex : -1

  // Validate that our data is correct
  const root = await tree.root()
  const isValidRoot = await privacyVault.methods.isKnownRoot(toHex(root), toHex(leaves.length)).call()
  const isSpent = await privacyVault.methods.isSpent(toHex(deposit.nullifierHash)).call()
  assert(isValidRoot === true, 'Merkle tree is corrupted')
  assert(isSpent === false, 'The note is already spent')
  assert(leafIndex >= 0, 'The deposit is not found in the tree')

  // Compute merkle proof of our commitment
  return { tree: tree, leafIndex: leafIndex, index: leaves.length }
}

/**
 * Generate SNARK proof for withdrawal
 * @param deposit Deposit object
 * @param recipient Funds recipient
 * @param amount Amount to spend
 */
async function generateProof({ deposit, recipient, amount }) {
  // Compute merkle proof of our commitment
  assert(deposit.amount >= amount, 'Spend amount is bigger than amount of the notes')
  const { tree, leafIndex, index } = await generateMerkleProof(deposit)
  const { root, path_elements, path_index } = await tree.path(leafIndex)

  // Prepare spend_circuit input
  const input = {
    // Public snark inputs
    root:root,
    nullifierHash: deposit.nullifierHash,
    amount: bigInt(deposit.amount),
    recipient: bigInt(recipient),

    // Private snark inputs
    nullifier: deposit.nullifier,
    secret: deposit.secret,
    pathElements: path_elements,
    pathIndices: path_index,
  }
  const remainAmout = deposit.amount - amount
  console.log('Generating Spend SNARK proof')
  console.time('Proof time')
  const proofData = await websnarkUtils.genWitnessAndProve(groth16, input, spend_circuit, spend_proving_key)
  const { proof } = websnarkUtils.toSolidityInput(proofData)
  console.timeEnd('Proof time')
  let newDeposit = {}
  let commitmentHex = toHex(0)
  if (remainAmout > 0){
    newDeposit = createDeposit({ nullifier:rbigint(31), secret:rbigint(31), amount: remainAmout })
    commitmentHex = newDeposit.commitmentHex
  }


  const args = [
    toHex(input.root),
    toHex(index),
    toHex(amount),
    toHex(remainAmout),
    toHex(input.nullifierHash),
    toHex(input.recipient, 20),
    commitmentHex
  ]

  return { proof, args, newDeposit }
}

/**
 * Generate SNARK proof for withdrawal
 * @param deposit Deposit object
 * @param amount Amount to spend
 */
async function generateDepositProof(deposit) {
  // Compute merkle proof of our commitment

  // Prepare circuit input
  const input = {
    // Public snark inputs
    commitment: bigInt(deposit.commitment),
    amount: bigInt(deposit.amount),

    // Private snark inputs
    nullifier: deposit.nullifier,
    secret: deposit.secret,
  }

  console.log('Generating Deposit SNARK proof')
  console.time('Proof time')
  const proofData = await websnarkUtils.genWitnessAndProve(groth16, input, deposit_circuit, deposit_proving_key)
  const { proof } = websnarkUtils.toSolidityInput(proofData)
  console.timeEnd('Proof time')

  const args = [
    toHex(input.commitment),
    toHex(input.amount),
  ]

  return { proof, args }
}

/**
 * Do an ETH withdrawal
 * @param noteString Note to withdraw
 * @param recipient Recipient address
 */
async function spend({ deposit, recipient, currency, amount }) {
  console.log('Amount to spend:' + amount)
  const { proof, args, newDeposit } = await generateProof({ deposit, recipient, amount })
  let proof2 = '0x00'
  if (newDeposit.amount !== undefined){
    const result = await generateDepositProof(newDeposit)
    proof2 = result.proof
  }
  console.log('Submitting Spend transaction')
  await privacyVault.methods.spend(proof, proof2, ...args).send({ from: senderAccount, gas: 8e6 })
    .on('transactionHash', function (txHash) {
      if (netId === 1 || netId === 42) {
        console.log(`View transaction on etherscan https://${getCurrentNetworkName()}etherscan.io/tx/${txHash}`)
      } else {
        console.log(`The transaction hash is ${txHash}`)
      }
    }).on('error', function (e) {
      console.error('on transactionHash error', e.message)
    })
  if (newDeposit.amount !== undefined){
    const remainAmt =  toDecimals(newDeposit.amount, 18, 9)
    const note = toHex(newDeposit.preimage, 93)
    const noteString = `privacyVault-${currency}-${remainAmt}-${netId}-${note}`
    console.log(`Your New Note: ${noteString}`)
  }
  return newDeposit
}

function fromDecimals({ amount, decimals }) {
  amount = amount.toString()
  let ether = amount.toString()
  const base = new BN('10').pow(new BN(decimals))
  const baseLength = base.toString(10).length - 1 || 1

  const negative = ether.substring(0, 1) === '-'
  if (negative) {
    ether = ether.substring(1)
  }

  if (ether === '.') {
    throw new Error('[ethjs-unit] while converting number ' + amount + ' to wei, invalid value')
  }

  // Split it into a whole and fractional part
  const comps = ether.split('.')
  if (comps.length > 2) {
    throw new Error(
      '[ethjs-unit] while converting number ' + amount + ' to wei,  too many decimal points'
    )
  }

  let whole = comps[0]
  let fraction = comps[1]

  if (!whole) {
    whole = '0'
  }
  if (!fraction) {
    fraction = '0'
  }
  if (fraction.length > baseLength) {
    throw new Error(
      '[ethjs-unit] while converting number ' + amount + ' to wei, too many decimal places'
    )
  }

  while (fraction.length < baseLength) {
    fraction += '0'
  }

  whole = new BN(whole)
  fraction = new BN(fraction)
  let wei = whole.mul(base).add(fraction)

  if (negative) {
    wei = wei.mul(negative)
  }

  return new BN(wei.toString(10), 10)
}

function toDecimals(value, decimals, fixed) {
  const zero = new BN(0)
  const negative1 = new BN(-1)
  decimals = decimals || 18
  fixed = fixed || 7

  value = new BN(value)
  const negative = value.lt(zero)
  const base = new BN('10').pow(new BN(decimals))
  const baseLength = base.toString(10).length - 1 || 1

  if (negative) {
    value = value.mul(negative1)
  }

  let fraction = value.mod(base).toString(10)
  while (fraction.length < baseLength) {
    fraction = `0${fraction}`
  }
  fraction = fraction.match(/^([0-9]*[1-9]|0)(0*)/)[1]

  const whole = value.div(base).toString(10)
  value = `${whole}${fraction === '0' ? '' : `.${fraction}`}`

  if (negative) {
    value = `-${value}`
  }

  if (fixed) {
    value = value.slice(0, fixed)
  }

  return value
}

function getCurrentNetworkName() {
  switch (netId) {
  case 1:
    return ''
  case 42:
    return 'kovan.'
  }

}

/**
 * Waits for transaction to be mined
 * @param txHash Hash of transaction
 * @param attempts
 * @param delay
 */
function waitForTxReceipt({ txHash, attempts = 60, delay = 1000 }) {
  return new Promise((resolve, reject) => {
    const checkForTx = async (txHash, retryAttempt = 0) => {
      const result = await web3.eth.getTransactionReceipt(txHash)
      if (!result || !result.blockNumber) {
        if (retryAttempt <= attempts) {
          setTimeout(() => checkForTx(txHash, retryAttempt + 1), delay)
        } else {
          reject(new Error('tx was not mined'))
        }
      } else {
        resolve(result)
      }
    }
    checkForTx(txHash)
  })
}

/**
 * Parses PrivacyVault.cash note
 * @param noteString the note
 */
function parseNote(noteString) {
  const noteRegex = /privacyVault-(?<currency>\w+)-(?<amount>[\d.]+)-(?<netId>\d+)-0x(?<note>[0-9a-fA-F]{186})/g
  const match = noteRegex.exec(noteString)
  if (!match) {
    throw new Error('The note has invalid format')
  }

  const buf = Buffer.from(match.groups.note, 'hex')
  const nullifier = bigInt.leBuff2int(buf.slice(0, 31))
  const secret = bigInt.leBuff2int(buf.slice(31, 62))
  const amount = bigInt.leBuff2int(buf.slice(62, 93))
  const deposit = createDeposit({ nullifier, secret, amount })
  const netId = Number(match.groups.netId)
  console.log('Notes Amount:' + amount)
  return { currency: match.groups.currency, amount: match.groups.amount, netId, deposit }
}

async function loadDepositData({ deposit }) {
  try {
    const eventWhenHappened = await privacyVault.getPastEvents('Deposit', {
      filter: {
        commitment: deposit.commitmentHex
      },
      fromBlock: 0,
      toBlock: 'latest'
    })
    if (eventWhenHappened.length === 0) {
      throw new Error('There is no related deposit, the note is invalid')
    }

    const { timestamp } = eventWhenHappened[0].returnValues
    const txHash = eventWhenHappened[0].transactionHash
    const isSpent = await privacyVault.methods.isSpent(deposit.nullifierHex).call()
    const receipt = await web3.eth.getTransactionReceipt(txHash)

    return { timestamp, txHash, isSpent, from: receipt.from, commitment: deposit.commitmentHex }
  } catch (e) {
    console.error('loadDepositData', e)
  }
  return {}
}

async function loadSpendData({ amount, currency, deposit }) {
  try {
    const events = await await privacyVault.getPastEvents('Spend', {
      fromBlock: 0,
      toBlock: 'latest'
    })

    const spendEvent = events.filter((event) => {
      return event.returnValues.nullifierHash === deposit.nullifierHex
    })[0]

    const fee = spendEvent.returnValues.fee
    const decimals = config.deployments[`netId${netId}`][currency].decimals
    const withdrawalAmount = toBN(fromDecimals({ amount, decimals })).sub(
      toBN(fee)
    )
    const { timestamp } = await web3.eth.getBlock(spendEvent.blockHash)
    return {
      amount: toDecimals(withdrawalAmount, decimals, 9),
      txHash: spendEvent.transactionHash,
      to: spendEvent.returnValues.to,
      timestamp,
      nullifier: deposit.nullifierHex,
      fee: toDecimals(fee, decimals, 9)
    }
  } catch (e) {
    console.error('loadSpendData', e)
  }
}

/**
 * Init web3, contracts, and snark
 */
async function init({ rpc, noteNetId, currency = 'dai', amount = '100' }) {
  let contractJson, erc20ContractJson, erc20privacyVaultJson, privacyVaultAddress, tokenAddress
  // TODO do we need this? should it work in browser really?
  if (inBrowser) {
    // Initialize using injected web3 (Metamask)
    // To assemble web version run `npm run browserify`
    web3 = new Web3(window.web3.currentProvider, null, { transactionConfirmationBlocks: 1 })
    contractJson = await (await fetch('build/contracts/ETHPrivacyVault.json')).json()
    spend_circuit = await (await fetch('build/circuits/spend.json')).json()
    spend_proving_key = await (await fetch('build/circuits/spend_proving_key.bin')).arrayBuffer()
    deposit_circuit = await (await fetch('build/circuits/commitment.json')).json()
    deposit_proving_key = await (await fetch('build/circuits/commitment_proving_key.bin')).arrayBuffer()
    MERKLE_TREE_HEIGHT = 20
    ETH_AMOUNT = 1e18
    TOKEN_AMOUNT = 1e19
    senderAccount = (await web3.eth.getAccounts())[0]
  } else {
    // Initialize from local node
    web3 = new Web3(rpc, null, { transactionConfirmationBlocks: 1 })
    contractJson = require('./build/contracts/ETHPrivacyVault.json')
    spend_circuit = require('./build/circuits/spend.json')
    spend_proving_key = fs.readFileSync('build/circuits/spend_proving_key.bin').buffer
    deposit_circuit = require('./build/circuits/commitment.json')
    deposit_proving_key = fs.readFileSync('build/circuits/commitment_proving_key.bin').buffer
    MERKLE_TREE_HEIGHT = process.env.MERKLE_TREE_HEIGHT || 20
    PRIVATE_KEY = process.env.PRIVATE_KEY
    console.log('PRIVATE_KEY:' + PRIVATE_KEY)
    if (PRIVATE_KEY) {
      const account = web3.eth.accounts.privateKeyToAccount('0x' + PRIVATE_KEY)
      web3.eth.accounts.wallet.add('0x' + PRIVATE_KEY)
      web3.eth.defaultAccount = account.address
      senderAccount = account.address
    } else {
      console.log('Warning! PRIVATE_KEY not found. Please provide PRIVATE_KEY in .env file if you deposit')
    }
    erc20ContractJson = require('./build/contracts/ERC20Mock.json')
    erc20privacyVaultJson = require('./build/contracts/ERC20PrivacyVault.json')
  }
  // groth16 initialises a lot of Promises that will never be resolved, that's why we need to use process.exit to terminate the CLI
  groth16 = await buildGroth16()
  netId = await web3.eth.net.getId()
  if (noteNetId && Number(noteNetId) !== netId) {
    throw new Error('This note is for a different network. Specify the --rpc option explicitly')
  }
  isLocalRPC = netId > 42

  if (isLocalRPC) {
    privacyVaultAddress = currency === 'eth' ? contractJson.networks[netId].address : erc20privacyVaultJson.networks[netId].address
    tokenAddress = currency !== 'eth' ? erc20ContractJson.networks[netId].address : null
    senderAccount = (await web3.eth.getAccounts())[0]
  } else {
    try {
      privacyVaultAddress = config.deployments[`netId${netId}`][currency].instanceAddress
      if (!privacyVaultAddress) {
        throw new Error()
      }
      tokenAddress = config.deployments[`netId${netId}`][currency].tokenAddress
    } catch (e) {
      console.error('There is no such privacyVault instance, check the currency and amount you provide')
      process.exit(1)
    }
  }
  privacyVault = new web3.eth.Contract(contractJson.abi, privacyVaultAddress)
  erc20 = currency !== 'eth' ? new web3.eth.Contract(erc20ContractJson.abi, tokenAddress) : {}
}

async function main() {
  if (inBrowser) {
    const instance = { currency: 'eth', amount: '0.1' }
    await init(instance)
    window.deposit = async () => {
      await deposit(instance)
    }
    window.spend = async () => {
      const noteString = prompt('Enter the note to withdraw')
      const recipient = (await web3.eth.getAccounts())[0]

      const { currency, amount, netId, deposit } = parseNote(noteString)
      await init({ noteNetId: netId, currency, amount })
      await spend({ deposit, recipient, amount })
    }
  } else {
    program
      .option('-r, --rpc <URL>', 'The RPC, CLI should interact with', 'http://localhost:8545')
    program
      .command('deposit <currency> <amount>')
      .description('Submit a deposit of specified currency and amount from default eth account and return the resulting note. ')
      .action(async (currency, amount) => {
        currency = currency.toLowerCase()
        await init({ rpc: program.rpc, currency, amount })
        await deposit({ currency, amount })
      })
    program
      .command('spend <note> <recipient>  <amountToSpend>')
      .description('Spend a note to a recipient account using specified private key. ')
      .action(async (noteString, recipient, amountToSpend) => {
        const { currency, amount, netId, deposit } = parseNote(noteString)
        await init({ rpc: program.rpc, noteNetId: netId, currency, amount })
        await spend({ deposit:deposit, recipient: recipient, currency: currency, amount: bigInt(toWei(amountToSpend)) })
      })
    program
      .command('balance <address> [token_address]')
      .description('Check ETH and ERC20 balance')
      .action(async (address, tokenAddress) => {
        await init({ rpc: program.rpc })
        await printETHBalance({ address, name: '' })
        if (tokenAddress) {
          await printERC20Balance({ address, name: '', tokenAddress })
        }
      })
    program
      .command('compliance <note>')
      .description('Shows the deposit and withdrawal of the provided note. This might be necessary to show the origin of assets held in your withdrawal address.')
      .action(async (noteString) => {
        const { currency, amount, netId, deposit } = parseNote(noteString)
        await init({ rpc: program.rpc, noteNetId: netId, currency, amount })
        const depositInfo = await loadDepositData({ deposit })
        const depositDate = new Date(depositInfo.timestamp * 1000)
        console.log('\n=============Deposit=================')
        console.log('Deposit     :', amount, currency)
        console.log('Date        :', depositDate.toLocaleDateString(), depositDate.toLocaleTimeString())
        console.log('From        :', `https://${getCurrentNetworkName()}etherscan.io/address/${depositInfo.from}`)
        console.log('Transaction :', `https://${getCurrentNetworkName()}etherscan.io/tx/${depositInfo.txHash}`)
        console.log('Commitment  :', depositInfo.commitment)
        if (deposit.isSpent) {
          console.log('The note was not spent')
        }

        const withdrawInfo = await loadSpendData({ amount, currency, deposit })
        const withdrawalDate = new Date(withdrawInfo.timestamp * 1000)
        console.log('\n=============Withdrawal==============')
        console.log('Withdrawal  :', withdrawInfo.amount, currency)
        console.log('Relayer Fee :', withdrawInfo.fee, currency)
        console.log('Date        :', withdrawalDate.toLocaleDateString(), withdrawalDate.toLocaleTimeString())
        console.log('To          :', `https://${getCurrentNetworkName()}etherscan.io/address/${withdrawInfo.to}`)
        console.log('Transaction :', `https://${getCurrentNetworkName()}etherscan.io/tx/${withdrawInfo.txHash}`)
        console.log('Nullifier   :', withdrawInfo.nullifier)
      })
   /* program
      .command('test')
      .description('Perform an automated test. It deposits and withdraws one ETH and one ERC20 note. Uses ganache.')
      .action(async () => {
        console.log('Start performing ETH deposit-withdraw test')
        let currency = 'eth'
        let amount = '0.1'
        await init({ rpc: program.rpc, currency, amount })
        let noteString = await deposit({ currency, amount })
        let parsedNote = parseNote(noteString)
        await withdraw({ deposit: parsedNote.deposit, currency, amount, recipient: senderAccount, relayerURL: program.relayer })

        console.log('\nStart performing DAI deposit-withdraw test')
        currency = 'dai'
        amount = '100'
        await init({ rpc: program.rpc, currency, amount })
        noteString = await deposit({ currency, amount })
        ; (parsedNote = parseNote(noteString))
        await withdraw({ deposit: parsedNote.deposit, currency, amount, recipient: senderAccount, refund: '0.02', relayerURL: program.relayer })
      })*/
    try {
      await program.parseAsync(process.argv)
      process.exit(0)
    } catch (e) {
      console.log('Error:', e)
      process.exit(1)
    }
  }
}

main()
