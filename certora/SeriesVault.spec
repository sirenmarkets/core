/*
    This is a specification file for smart contract verification with the Certora prover.
    For more information, visit: https://www.certora.com/

    This file is run with spec/scripts/verifySeriesVault.sh
*/

// LINKED CONTRACTS
import "erc20.spec"
using DummyERC20A as ERC20
using ERC1155Controller as ERC1155

methods {
    // INTERNAL FUNCTIONS
    // sets the base series controller
    // should not allow to be called twice
    __SeriesVault_init(address)

    // approves any request so long as the allowance is set (non-zero) and the sender is the series controller
    setERC20ApprovalForController(address)

    // allows the series controller, and only the series controller, to withdraw any number of tokens from the vault
    // always approves so the function should always succeed and return true
    // Are there any scenarios where the series controller should not be given access to ERC1155?
    setERC1155ApprovalForController(address)
    updateImplementation(address)


    // EXTERNAL FUNCTIONS
    ERC20.allowance(address, address) returns uint256 envfree
    ERC1155.isApprovedForAll(address, address) returns bool envfree
    setApprovalForAll(address, bool) => DISPATCHER(true)
    isApprovedForAll(address, address) => DISPATCHER(true)

    // SOLIDITY GENERATE GETTERS
    controller() returns address envfree
}

ghost initialized()  returns bool;
ghost initializing() returns bool;

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

//---------------------------Definitions------------------------

definition uninitialized() returns bool = !initialized();

//---------------------------Invariants-----------------------------
//
//

invariant noninitializing() // this is a helper
  !initializing()

invariant initialization_controller() 
    initialized() <=> controller() != 0
  { preserved {
    requireInvariant noninitializing();
  }}

// if an allowance is defined / token is approved for a given spender it must be the controller
invariant controller_spender_only(address owner, address spender)
   ERC20.allowance(owner, spender) != 0 || ERC1155.isApprovedForAll(owner, spender) => spender == controller()
  { 
    preserved {
      require owner != 0 && spender != 0;
      require initialized();
      requireInvariant initialization_controller();
      requireInvariant noninitializing();
    }
  }


//----------------------------State Transitions-----------------------

rule SeriesController_single_definition(method f) {
    env e; calldataarg args;
    
    requireInvariant noninitializing();
    requireInvariant initialization_controller();

    address controller_pre = controller();
    f(e, args);
    address controller_post = controller();

    assert controller_pre != controller_post => controller_pre == 0, "controller double edit";
}

rule SeriesController_initialize_only(method f) {
    env e; calldataarg args;

    address controller_pre = controller();
    f(e, args);
    address controller_post = controller();

    assert controller_pre != controller_post => f.selector == __SeriesVault_init(address).selector, 
        "controller set by un-authorized function";
}

rule Allowance_Altered_ControllerOnly(method f) {
    env e; calldataarg args;
    address token;

    requireInvariant noninitializing();
    requireInvariant initialization_controller();

    // without this pre and post draw from different addresses in the initialization function (since controller is changed)
    address con = controller();

    uint256 allowance_pre = ERC20.allowance(token, con);
    f(e, args);
    uint256 allowance_post = ERC20.allowance(token, con);

    assert allowance_pre != allowance_post => e.msg.sender == con, "token allowance edited by non controller";
}

//--------------------------------Unit Tets------------------------------------
//
//

rule verify_setERC20ApprovalForController() {
    env e;
    address c; 

    require e.msg.sender != 0;
    requireInvariant noninitializing();
    requireInvariant initialization_controller();

    setERC20ApprovalForController@withrevert(e, c);
    bool reverted = lastReverted;

    assert !initialized() => reverted, "accepted without being initialized";
    // assert e.msg.sender == controller() => ERC20.allowance(c, controller()) != 0 || reverted, "token wasn't approved";
    assert e.msg.sender != controller() => reverted, "accepted unauthorized controller";
}

rule verify_setERC1155ApprovalForController() {
    env e; 
    address c; 

    require e.msg.sender != 0;
    requireInvariant noninitializing();
    requireInvariant initialization_controller();
    
    setERC1155ApprovalForController@withrevert(e, c);
    bool reverted = lastReverted;

    assert !initialized() => reverted, "accepted without being initialized";
    // assert e.msg.sender == controller() => ERC1155.isApprovedForAll(c, controller()) || reverted, "token wasn't approved";
    assert e.msg.sender != controller() => reverted, "accepted unauthorized controller";
}

rule initialization_single_call() {
    env e; 
    address controller;
    require controller != 0;

    __SeriesVault_init(e, controller);
    requireInvariant noninitializing();
    __SeriesVault_init@withrevert(e, controller);

    assert lastReverted, "double initialization allowed";
}