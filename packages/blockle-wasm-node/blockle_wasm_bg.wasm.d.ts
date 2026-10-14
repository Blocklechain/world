/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const address_from_pubkey: (a: number, b: number) => [number, number, number, number];
export const assemble_asm: (a: number, b: number) => [number, number];
export const build_block20_token: (a: number, b: number, c: number, d: number, e: bigint, f: bigint) => [number, number, number, number];
export const build_call: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: bigint, l: bigint, m: bigint) => [number, number, number, number];
export const build_deploy: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: bigint, j: bigint) => [number, number, number, number];
export const build_pool_add: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: bigint, j: bigint, k: bigint, l: bigint) => [number, number, number, number];
export const build_pool_create: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: bigint, j: bigint, k: bigint, l: bigint) => [number, number, number, number];
export const build_pool_remove: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: bigint, j: bigint, k: bigint) => [number, number, number, number];
export const build_pool_swap_buy: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: bigint, j: bigint, k: bigint, l: bigint) => [number, number, number, number];
export const build_pool_swap_sell: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: bigint, j: bigint, k: bigint, l: bigint) => [number, number, number, number];
export const build_transfer: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: bigint, j: bigint) => [number, number, number, number];
export const compile_script: (a: number, b: number) => [number, number];
export const keygen: () => [number, number];
export const sign_message: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
export const simulate: (a: number, b: number, c: number, d: number, e: bigint) => [number, number];
export const verify: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
export const __wbindgen_exn_store: (a: number) => void;
export const __externref_table_alloc: () => number;
export const __wbindgen_externrefs: WebAssembly.Table;
export const __wbindgen_malloc: (a: number, b: number) => number;
export const __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
export const __externref_table_dealloc: (a: number) => void;
export const __wbindgen_free: (a: number, b: number, c: number) => void;
export const __wbindgen_start: () => void;
