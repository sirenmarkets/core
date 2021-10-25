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

    _initialized() returns (bool) envfree // fixed on review changed variable to public and added getter 
    _initializing() returns (bool) envfree // fixed on review changed variable to public and added getter



    // EXTERNAL FUNCTIONS
    ERC20.allowance(address, address) returns uint256 envfree
    ERC1155.isApprovedForAll(address, address) returns bool envfree
    setApprovalForAll(address, bool) => DISPATCHER(true)
    isApprovedForAll(address, address) => DISPATCHER(true)

    // SOLIDITY GENERATE GETTERS
    controller() returns address envfree
}

//---------------------------Definitions------------------------

definition uninitialized() returns bool = !_initialized();

//---------------------------Invariants-----------------------------
//
//

// @MM - V
invariant noninitializing() // this is a helper
  !_initializing()

// @MM - V
invariant initialization_controller() 
    _initialized() <=> controller() != 0
  { preserved {
    requireInvariant noninitializing();
  }}

// @MM - Shouldn't we make 2 separte invariants for the 2 of them?
// if an allowance is defined / token is approved for a given spender it must be the controller
invariant controller_spender_only(address owner, address spender)
   ERC20.allowance(owner, spender) != 0 || ERC1155.isApprovedForAll(owner, spender) => spender == controller()
  { 
    preserved {
      require owner != 0 && spender != 0;
      require _initialized();
      requireInvariant initialization_controller();
      requireInvariant noninitializing();
    }
  }


//----------------------------State Transitions-----------------------

// @MM - V - complete the single def along with the init_only rule
rule SeriesController_single_definition(method f) {
    env e; calldataarg args;
    
    requireInvariant noninitializing();
    requireInvariant initialization_controller();

    address controller_pre = controller();
    f(e, args);
    address controller_post = controller();

    // if the controller changed it only happend if the pre state state was 0.
    assert controller_pre != controller_post => controller_pre == 0, "controller double edit";
}

// @MM - V - complete the single def along with the single_def rule
rule SeriesController_initialize_only(method f) {
    env e; calldataarg args;

    address controller_pre = controller();
    f(e, args);
    address controller_post = controller();

    // if the controller changed it only happend as a result of __SeriesVault_init.
    assert controller_pre != controller_post => f.selector == __SeriesVault_init(address).selector, 
        "controller set by un-authorized function";
}

// @MM - V - the allowance is changing by controller only (the msg.sender has to be a controller)
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

    // if the allowace changed it happned only if the msg.sender is the controller.
    assert allowance_pre != allowance_post => e.msg.sender == con, "token allowance edited by non controller";
}

//--------------------------------Unit Tets------------------------------------
//


// @MM - V - Checks mainly the premission to use the function rather than the application of it.
rule verify_setERC20ApprovalForController() {
    env e;
    address c;

    require e.msg.sender != 0;
    requireInvariant noninitializing();
    requireInvariant initialization_controller();

    setERC20ApprovalForController@withrevert(e, c);
    bool reverted = lastReverted;

    // The function verify_setERC20ApprovalForController is set as "onlySeriesController",
    // which means that only a controller can call it.
    // If the contract is uninitialized then a controller shouldn't be set, and hence it should revert
    assert !_initialized() => reverted, "accepted without being initialized";
    // assert e.msg.sender == controller() => ERC20.allowance(c, controller()) != 0 || reverted, "token wasn't approved";
    // controller has to be the msg.sender. if it isn't the system should be reverted.
    assert e.msg.sender != controller() => reverted, "accepted unauthorized controller";
}


// @MM - V - Checks exactly the same as previous rule - verify_setERC20ApprovalForController
rule verify_setERC1155ApprovalForController() {
    env e; 
    address c; 

    require e.msg.sender != 0;
    requireInvariant noninitializing();
    requireInvariant initialization_controller();
    
    setERC1155ApprovalForController@withrevert(e, c);
    bool reverted = lastReverted;

    assert !_initialized() => reverted, "accepted without being initialized";
    // assert e.msg.sender == controller() => ERC1155.isApprovedForAll(c, controller()) || reverted, "token wasn't approved";
    assert e.msg.sender != controller() => reverted, "accepted unauthorized controller";
}


// @MM - V - we apply the function twice. if it passes that means the it was reverted in the 2nd call
// if it isn't passing then the init function did not revert, which means it was initialized twice. 
rule initialization_single_call() {
    env e;
    address controller;
    require controller != 0; // make sure the first invoke will not require, and the 2nd invoke will revert as a result of the initialization.

    __SeriesVault_init(e, controller);
    requireInvariant noninitializing();
    __SeriesVault_init@withrevert(e, controller);

    assert lastReverted, "double initialization allowed";
}