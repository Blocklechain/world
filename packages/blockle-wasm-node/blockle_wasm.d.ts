/* tslint:disable */
/* eslint-disable */

/**
 * Derive the `block1…` address committed to by a public key.
 */
export function address_from_pubkey(public_hex: string): string;

/**
 * Assemble raw Blockle VM assembly to bytecode.
 */
export function assemble_asm(src: string): string;

/**
 * Build BLOCK-20 token bytecode (hex) for the given metadata + supply.
 */
export function build_block20_token(name: string, symbol: string, decimals: bigint, supply: bigint): string;

/**
 * Build a signed contract-call transaction (ContractAction::Call). Used for
 * init(), transfer(), and any BLOCK-20/contract method. `value` moves into
 * the contract; fee = gas_limit * gas_price. Inputs must cover value + fee.
 */
export function build_call(secret_hex: string, public_hex: string, utxos_json: string, contract_hex: string, input_hex: string, value: bigint, gas_limit: bigint, gas_price: bigint): string;

/**
 * Build + sign a mainnet contract-deploy transaction. `fee = gas_limit *
 * gas_price`; inputs fund the fee, change returns to the sender. Returns
 * `{ txid, raw, contractId, fee }`.
 */
export function build_deploy(secret_hex: string, public_hex: string, utxos_json: string, code_hex: string, gas_limit: bigint, gas_price: bigint): string;

export function build_pool_add(secret_hex: string, public_hex: string, utxos_json: string, token_hex: string, block_amt: bigint, token_max: bigint, gas_limit: bigint, gas_price: bigint): string;

export function build_pool_create(secret_hex: string, public_hex: string, utxos_json: string, token_hex: string, block_amt: bigint, token_amt: bigint, gas_limit: bigint, gas_price: bigint): string;

export function build_pool_remove(secret_hex: string, public_hex: string, utxos_json: string, token_hex: string, shares: bigint, gas_limit: bigint, gas_price: bigint): string;

export function build_pool_swap_buy(secret_hex: string, public_hex: string, utxos_json: string, token_hex: string, block_in: bigint, min_token_out: bigint, gas_limit: bigint, gas_price: bigint): string;

export function build_pool_swap_sell(secret_hex: string, public_hex: string, utxos_json: string, token_hex: string, token_in: bigint, min_block_out: bigint, gas_limit: bigint, gas_price: bigint): string;

/**
 * Build and sign a transfer. `utxos_json` is `[{txid, vout, amount}]` (base
 * units). Selects inputs greedily, adds change back to the sender, signs every
 * input with ML-DSA over the tx sighash, and returns JSON:
 * `{ txid, raw, change, inputs }` where `raw` is the bincode-serialized
 * transaction (hex) ready to POST to the node's submit endpoint.
 */
export function build_transfer(secret_hex: string, public_hex: string, utxos_json: string, to: string, amount: bigint, fee: bigint): string;

/**
 * Compile Blockle Script source to bytecode. Returns JSON
 * `{ ok, bytecode, asm, size }` or `{ ok:false, error }`.
 */
export function compile_script(src: string): string;

/**
 * Generate a fresh ML-DSA-44 wallet. Returns JSON:
 * `{ address, publicKey, secretKey }` (keys hex-encoded).
 */
export function keygen(): string;

/**
 * Sign a UTF-8 message with the wallet key. Returns JSON:
 * `{ scheme, address, publicKey, signature }`.
 */
export function sign_message(secret_hex: string, public_hex: string, msg: string): string;

/**
 * Run a sequence of calls against a fresh in-memory contract (the local
 * testnet). `calls_json` is `[{calldata, value, height}]`, run in order
 * against one persistent state. Returns per-call receipts plus final storage.
 */
export function simulate(bytecode_hex: string, calls_json: string, start_balance: bigint): string;

/**
 * Verify an ML-DSA-44 signature over a UTF-8 message.
 */
export function verify(public_hex: string, msg: string, sig_hex: string): boolean;
