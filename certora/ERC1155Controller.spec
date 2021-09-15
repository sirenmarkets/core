/*
    This is a specification file for smart contract verification with the Certora prover.
    For more information, visit: https://www.certora.com/

    This file is run with spec/scripts/verifyERC1155Controller.sh
*/

methods {
    optionTokenTotalSupply(uint256) envfree
    optionTokenTotalSupplyBatch(uint256[]) envfree

    __ERC1155Controller_init(string, address)

    // Main functions 
    // creates w or b tokens
    SMTSafe_mint(address, uint256, uint256)
    // SMTSafe_mintBatch((address, uint256[], uint256[]) // THOMAS THIS IS WHAT I CHANGED WHEN I SAID I FORGOT THE HEADER
    mint(address, uint256, uint256, bytes)

    mintBatch(address, uint256[], uint256[], bytes)

    // removes a specified amount of an option token from the supply
    burn(address, uint256, uint256)
    burnBatch(address, uint256[], uint256[])

    // contract update functions
    updateImplementation(address)
    transferOwnership(address)
    
    isOwner() returns bool

    // Solidity Functions
    controller() envfree
}

//--------------------------------Helpers--------------------------------------
//
//


ghost initialized()  returns bool;
ghost initializing() returns bool {
    init_state axiom !initializing();
}

hook Sstore _initialized uint256 newvalue STORAGE {
  // NOTE: this logic is required because having a hook with type bool seems to not
  //       currently work.  Similarly for other hooks below
  // NOTE: optimization breaks this because _initialized shares a slot
  uint normNewValue = newvalue & 0xff;
  bool boolNewValue = normNewValue > 0;
  havoc initialized assuming initialized@new() == boolNewValue;
}

hook Sload uint256 newvalue _initialized STORAGE {
  require (newvalue & 0xff > 0) == initialized();
}

hook Sstore _initializing uint256 newvalue STORAGE {
  uint normNewValue = newvalue & 0xff;
  bool boolNewValue = normNewValue > 0;
  havoc initializing assuming initializing@new() == boolNewValue;
}

hook Sload uint256 newvalue _initializing STORAGE {
  require (newvalue & 0xff > 0) == initializing();
}

definition uninitialized() returns bool =
  !initialized();

invariant noninitializing()
  !initializing()

// the sum of all u. balances(cid,u)
ghost sumBalances(uint256) returns uint256 {
    init_state axiom forall uint256 cid. sumBalances(cid) == 0;
}

hook Sstore _balances[KEY uint256 optionTokenId][KEY address user] uint256 balance (uint256 oldBalance) STORAGE {
    // update stored balances
    havoc sumBalances assuming sumBalances@new(optionTokenId) == sumBalances@old(optionTokenId) + balance - oldBalance &&
    // verifies no other values were changed
    (forall uint256 x.  x != optionTokenId  => sumBalances@new(x) == sumBalances@old(x));
}

//--------------------------------Definitions----------------------------------
definition ARRAY_MAX_LENGTH() returns uint256 = 5;


//--------------------------------Invariants-----------------------------------
//
//

invariant controller_initialized()
    initialized() => controller() != 0
{ preserved {
    requireInvariant noninitializing();
}}


// // tokens available are always equal to the supply
//
invariant supply_equality(uint256 id)
    optionTokenTotalSupply(id) == sumBalances(id)

// supply must be inclusively bounded by 0 and max_int
invariant token_supply_overflow(uint256 id)
    optionTokenTotalSupply(id) >= 0 && optionTokenTotalSupply(id) <= max_uint256


//--------------------------------State Transitions----------------------------
//
//

rule token_controller_only(method f) filtered {f -> (f.selector == mint(address, uint256, uint256, bytes).selector   ||
                                                     f.selector == burn(address, uint256, uint256).selector          ||
                                                     f.selector == burnBatch(address, uint256[], uint256[]).selector ||
                                                     f.selector == mintBatch(address, uint256[], uint256[], bytes).selector
                                               )}{
    env e; calldataarg args;
    f@withrevert(e, args);
    bool reverted = lastReverted;
    assert e.msg.sender != controller() => reverted, "unathorized caller"; 
}

rule token_valid_functions(method f) {
    env e; calldataarg args;
    uint256 id; 

    uint256 supply_pre = optionTokenTotalSupply(id);
    f(e,args);
    uint256 supply_post = optionTokenTotalSupply(id);

    assert supply_pre != supply_post => // list of valid functions
                                        f.selector == SMTSafe_mint(address, uint256, uint256).selector          ||
                                        f.selector == mint(address, uint256, uint256, bytes).selector           ||
                                        f.selector == mintBatch(address, uint256[], uint256[], bytes).selector  ||
                                        f.selector == burn(address, uint256, uint256).selector                  ||
                                        f.selector == burnBatch(address, uint256[], uint256[]).selector         ||
                                        f.selector == SMTSafe_mintBatch(address, uint256[], uint256[]).selector
        , "token supply edited by unauthorized function";
}

rule mint_increasing() {
    env e;
    calldataarg args;
    address to; uint256 id; uint256 amount;

    uint256 supply_pre = optionTokenTotalSupply(id);
    SMTSafe_mint(e, to, id, amount);
    uint256 supply_post = optionTokenTotalSupply(id);

    assert supply_post >= supply_pre, "mint non-increasing";
    assert supply_post - supply_pre == amount, "non_accurate mint increase";
}

// rule mintBatch_increasing() {
//     env e;
//     address to; uint256[] ids; uint256[] amounts;
//     uint256 i;
//     // set address to = good receiver?

//     // array length and index constraints to keep size in check and index under max length
//     require ids.length == ARRAY_MAX_LENGTH() && amounts.length == ARRAY_MAX_LENGTH();
//     require i < ids.length;

//     // only test seperate ids
//     require (forall uint256 j. forall uint256 k. i != k && j < ids.length && k < ids.length => ids[j] != ids[j]);

//     uint256 supply_pre = optionTokenTotalSupply(ids[i]);
//     SMTSafe_mintBatch(e, to, ids, amounts);
//     uint256 supply_post = optionTokenTotalSupply(ids[i]);

//     assert supply_pre <= supply_post, "mint non-increasing";
//     assert supply_post - supply_pre == amounts[i], "non_accurate mint increase";
// }

// tests the above rule manually with 4 seperate ids, realistic way to show the above works
rule mintBatch_increasing_manual() {
    env e;
    address to; uint256[] amounts;
    uint256 amount0; uint256 amount1; uint256 amount2; uint256 amount3;
    amounts = [amount0, amount1, amount2, amount3];

    uint256 id0; uint256 id1; uint256 id2; uint256 id3;
    uint256[] ids = [id0, id1, id2, id3];

    // no 2 ids may be the same (additivity tested seperately)
    require id0 != id1 && id0 != id2 && id0 != id3;
    require id1 != id2 && id1 != id3;
    require id2 != id3;
    
    // retrieve the pre values into an array
    uint256[] supply_pre = [optionTokenTotalSupply(id0), 
                            optionTokenTotalSupply(id1),
                            optionTokenTotalSupply(id2),
                            optionTokenTotalSupply(id3)];

    SMTSafe_mintBatch(e, to, ids, amounts); // apply the batch mint

    // retrieve the post values into an array
    uint256[] supply_post = [optionTokenTotalSupply(id0),
                             optionTokenTotalSupply(id1),
                             optionTokenTotalSupply(id2),
                             optionTokenTotalSupply(id3)];

    // the latter should prove the former, but I added the redundancy to be safe
    uint256 i;
    require i < 4;
    assert supply_post[i] >= supply_pre[i], "mint batch non-increasing";
    assert supply_post[i] - supply_pre[i] == amounts[i], "non_accurate mint batch increase";
}

rule mintBatch_additivity() {
    env e;
    address account; uint256[] ids; uint256[] amounts;
    uint256 id;

    // array length and index constraints to keep size in check and index under max length
    ids = [id, id];
    require amounts.length == 2;

    storage init = lastStorage;

    // mint twice
    SMTSafe_mint(e, account, id, amounts[0]);
    SMTSafe_mint(e, account, id, amounts[1]);
    uint256 supply_post_double = optionTokenTotalSupply(id);

    // apply the batch at init
    SMTSafe_mintBatch(e, account, ids, amounts) at init;
    uint256 supply_post_batch = optionTokenTotalSupply(id);

    assert supply_post_batch == supply_post_double, "value change differant than sum of changes";
}

rule burn_decreasing() {
    env e;
    address account; uint256 id; uint256 amount;
    require amount > 0;

    uint256 supply_pre = optionTokenTotalSupply(id);
    burn(e, account, id, amount);
    uint256 supply_post = optionTokenTotalSupply(id);

    assert supply_pre > supply_post, "burn non-decreasing";
    assert supply_pre - supply_post == amount, "non_accurate burn decrease";
    assert amount <= supply_pre, "can't burn more tokens than are available";
}

// rule burnBatch_decreasing() {
//     env e;
//     address account; uint256[] ids; uint256[] amounts;
//     uint256 i;
//     // set address to = good receiver?

//     // array length and index constraints to keep size in check and index under max length
//     require amounts[i] > 0;
//     require ids.length == ARRAY_MAX_LENGTH() && amounts.length == ARRAY_MAX_LENGTH();
//     require i < ids.length;

//     // only test seperate ids
//     require (forall uint256 j. forall uint256 k. i != k && j < ids.length && k < ids.length => ids[j] != ids[j]);

//     // the solver can not yet handle returning arrays, so instead I just take an arbitrary array value and compare on that
//     uint256 supply_pre = optionTokenTotalSupply(ids[i]);
//     burnBatch(e, account, ids, amounts);
//     uint256 supply_post = optionTokenTotalSupply(ids[i]);

//     assert supply_pre >= supply_post, "burn non-decreasing";
//     assert supply_pre - supply_post == amounts[i], "non_accurate burn decrease";
//     assert amounts[i] <= supply_pre, "can't burn more tokens than are available";
// }

// tests the above rule manually with 4 seperate ids
rule burnBatch_decreasing_manual() {
    env e;
    address to; uint256[] amounts;
    uint256 amount0; uint256 amount1; uint256 amount2; uint256 amount3;
    amounts = [amount0, amount1, amount2, amount3];

    uint256 id0; uint256 id1; uint256 id2; uint256 id3;
    uint256[] ids = [id0, id1, id2, id3];

    // no ids may be the same`2
    require id0 != id1 && id0 != id2 && id0 != id3;
    require id1 != id2 && id1 != id3;
    require id2 != id3;

    // retrieve the pre values into an array
    uint256[] supply_pre = [optionTokenTotalSupply(id0), 
                            optionTokenTotalSupply(id1),
                            optionTokenTotalSupply(id2),
                            optionTokenTotalSupply(id3)];

    burnBatch(e, to, ids, amounts); // apply the batch mint

    // retrieve the post values into an array
    uint256[] supply_post = [optionTokenTotalSupply(id0),
                             optionTokenTotalSupply(id1),
                             optionTokenTotalSupply(id2),
                             optionTokenTotalSupply(id3)];

    // the latter should prove the former, but I added the redundancy to be safe
    uint256 i;
    require i < 4;
    assert supply_pre[i] >= supply_post[i], "mint batch non-increasing";
    assert supply_pre[i] -  supply_post[i] == amounts[i], "non_accurate mint batch increase";
}


rule burnBatch_additivity() {
    env e;
    address account; uint256[] ids; uint256[] amounts;
    uint256 id;

    // array length and index constraints to keep size in check and index under max length
    ids = [id, id];
    require amounts.length == 2;

    storage init = lastStorage;

    // burn twice
    burn(e, account, id, amounts[0]);
    burn(e, account, id, amounts[1]);
    uint256 supply_post_double = optionTokenTotalSupply(id);

    // apply the batch at init
    burnBatch(e, account, ids, amounts) at init;
    uint256 supply_post_batch = optionTokenTotalSupply(id);

    assert supply_post_batch == supply_post_double, "value change differant than sum of changes";
}

rule updateImplementation_onlyOwner() {
    env e;
    address ad;

    updateImplementation@withrevert(e, ad);

    bool reverted = lastReverted;

    assert !isOwner(e) => reverted, "nonOwner allowed to update";
}

rule transferOwnership_onlyOwner() {
    env e;
    address ad;
    require ad != e.msg.sender; // this is reflected in their code but might not be necessary

    bool owner = isOwner(e);
    transferOwnership@withrevert(e, ad);
    bool reverted = lastReverted;

    assert !owner => reverted, "nonOwner allowed to transfer ownership";
}

rule initialization_single_call() {
    env e; 
    calldataarg args;
    requireInvariant noninitializing();

    __ERC1155Controller_init(e, args);
    __ERC1155Controller_init@withrevert(e, args);

    assert lastReverted, "double initialization allowed";
}




