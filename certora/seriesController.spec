/*

    This is a specification file for smart contract verification with the Certora prover.
    For more information, visit: https://www.certora.com/

    This file is run with scripts/...
    Assumptions: 
*/

import "erc20.spec"
import "erc1155receiver.spec"

/*
    Declaration of contracts used in the spec 
*/

using ERC1155Controller as erc1155

////////////////////////////////////////////////////////////////////////////
//                       Method Specs                                     //
////////////////////////////////////////////////////////////////////////////

methods {
    // methods of seriesController
    /*
    __SeriesController_init(address,address,address,(address,uint16,uint16,uint16))
    pause           () envfree
    unpause         () envfree
    createSeries    ((address,address,address),uint256[],uint40[],address[],bool)
    mintOptions     (uint64,uint256)
    exerciseOption  (uint64,uint256,bool)
    claimCollateral (uint64,uint256)
    closePosition   (uint64,uint256)
    */

    state           (uint64 _seriesId) returns (uint8)
    strikePrice     (uint64 _seriesId) returns (uint256) envfree
    expirationDate  (uint64 _seriesId) returns (uint40)  envfree
    underlyingToken (uint64 _seriesId) returns (address) envfree
    priceToken      (uint64 _seriesId) returns (address) envfree
    collateralToken (uint64 _seriesId) returns (address) envfree
    isPutOption     (uint64 _seriesId) returns (bool)    envfree

    getSeriesERC20Balance (uint64 _seriesId) returns (uint256) envfree
    getExerciseAmount(uint64 _seriesId, uint256 _bTokenAmount) envfree
    getClaimAmount(uint64 _seriesId, uint256 _wTokenAmount) returns (uint256, uint256) envfree
    getCollateralPerOptionToken(uint64 _seriesId, uint256 _optionTokenAmount) returns (uint256) envfree

    getSettlementPrice(uint64 _seriesId) returns (bool, uint256)
    latestIndex() returns(uint64) envfree
    erc1155Controller() returns(address) envfree;

    // helpers defined in harness

    tokenBalanceOf(address token, address user) returns (uint256) envfree
    getVault() envfree
    wTokenSupply(uint64 series) returns uint256 envfree
    bTokenSupply(uint64 series) returns uint256 envfree
    getBShare(uint64 series, uint256 options) returns uint256 envfree
    getWShare(uint64 series, uint256 options) returns uint256 envfree
    getShareSum(uint64 series, uint256 options) returns uint256 envfree
    wTokenBalance(uint64 series, address user) returns uint256 envfree
    bTokenBalance(uint64 series, address user) returns uint256 envfree
    callLiabilities(uint64 series) returns uint256 envfree

    // external method summaries: price oracle`

    getCurrentPrice(address,address)    => CONSTANT
    setSettlementPrice(address,address) => NONDET
    get8amWeeklyOrDailyAligned(uint256) => NONDET
    getFeeReceiver() returns (address) envfree

    // external method summaries: vault

    setERC1155ApprovalForController(address) => NONDET
}


////////////////////////////////////////////////////////////////////////////////
// Definitions /////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

definition bLiabilities(uint64 s) returns uint256 =
    getBShare(s, bTokenSupply(s)) * collateralPerOption(s);

definition wLiabilities(uint64 s) returns uint256 =
    getWShare(s, wTokenSupply(s)) * collateralPerOption(s);

definition solvent(uint64 s) returns bool =
    bLiabilities(s) + wLiabilities(s) == getSeriesERC20Balance(s);

// The conversion rate betweek collateral tokens and option tokens for a given
// series
definition collateralPerOption(uint64 seriesId) returns uint256 =
    isPutOption(seriesId)
        ? strikePrice(seriesId)
        : 1;

definition callSolvent(uint64 s) returns bool =
    callLiabilities(s) == getSeriesERC20Balance(s);

////////////////////////////////////////////////////////////////////////////
//                       Invariants                                       //
////////////////////////////////////////////////////////////////////////////

// STATUS:
//   - OOM on fallback
//   - OOM on closePosition
rule seriesBalanceEQtokenBalance(uint64 seriesId, method f) 
    //ignoring init as it chagnes the vault, we assume that init is called once. 
    filtered { f -> f.selector != __SeriesController_init(address,address,address,(address,uint16,uint16,uint16)).selector}
{
    address collateralT = collateralToken(seriesId);
    uint256 innerBalanceBefore = getSeriesERC20Balance(seriesId);
    uint256 externalBalanceBefore = tokenBalanceOf(collateralT, getVault());

    address sender;
    require sender != getVault();
    require sender != getFeeReceiver();
    require getVault() != getFeeReceiver();
    callFunctionOnSeries(seriesId, sender, f);
    uint256 innerBalanceAfter = getSeriesERC20Balance(seriesId);
    uint256 externalBalanceAfter = tokenBalanceOf(collateralT, getVault());

    assert innerBalanceAfter - innerBalanceBefore == externalBalanceAfter - externalBalanceBefore;
}

// NOTE: OOM, converted to a rule below
// invariant seriesSolvency(uint64 s)
//     bLiabilities(s) + wLiabilities(s) == getSeriesERC20Balance(s)

rule seriesSolvency(uint64 s, method f)
filtered { f -> false
//  || /* STATUS: PASS */ f.selector == pause().selector
//  || /* STATUS: PASS */ f.selector == unpause().selector
//  || /* STATUS: TIME */ f.selector == createSeries((address,address,address),uint256[],uint40[],address[],bool).selector
//  || /* STATUS: PASS */ f.selector == mintOptions(uint64,uint256).selector
//  || /* STATUS: TIME */ f.selector == exerciseOption(uint64,uint256,bool).selector
//  || /* STATUS: TIME */ f.selector == claimCollateral(uint64,uint256).selector
//  || /* STATUS: PASS */ f.selector == closePosition(uint64,uint256).selector
}
{
    require solvent(s);

    env e; calldataarg args;
    f(e,args);

    assert solvent(s);
}

rule callSeriesSolvency(uint64 s, method f)
filtered { f -> false
//  || /* STATUS:      */ f.selector == __SeriesController_init(address,address,address,(address,uint16,uint16,uint16)).selector
//  || /* STATUS: PASS */ f.selector == pause().selector
//  || /* STATUS: PASS */ f.selector == unpause().selector
//  || /* STATUS: TIME */ f.selector == createSeries((address,address,address),uint256[],uint40[],address[],bool).selector
//  || /* STATUS:      */ f.selector == mintOptions(uint64,uint256).selector
//  || /* STATUS:      */ f.selector == exerciseOption(uint64,uint256,bool).selector
//  || /* STATUS:      */ f.selector == claimCollateral(uint64,uint256).selector
//  || /* STATUS: TIME */ f.selector == closePosition(uint64,uint256).selector
}
{
    require callSolvent(s);

    env e; calldataarg args;
    f(e,args);

    assert callSolvent(s);
}

// STATUS: running
rule shareSum(uint64 s, uint256 o) {
    assert getShareSum(s,o) == o * collateralPerOption(s);
}

// NOTE: the env isn't being evaluated properly, reimplemented as a rule below
// invariant optionTokenSupply(env e, uint64 s)
//     isOpen(e,s) => bTokenSupply(s) == wTokenSupply(s)

definition optionTokenSupplyInv(env e, uint64 s) returns bool =
    isOpen(e,s) => bTokenSupply(s) == wTokenSupply(s);

// STATUS: 
//   - failing on init
//   - failing on createSeries
//
// in createSeries, the rule fails because an uninitiailized series seems to
// transition from not open to open (because the uninitialized close date is 0).
// that means the invariant is vacuously true at the beginning but is no longer
// vacuous at the end.
//
// in init, setERC20Approval is havocing, probably causing the failure; rerunning. 
//
rule optionTokenSupply(method f, env e, uint64 s)
    filtered {f -> (f.selector != createSeries((address,address,address),uint256[],uint40[],address[],bool).selector &&
                    f.selector != __SeriesController_init(address,address,address,(address,uint16,uint16,uint16)).selector)}
{
    require optionTokenSupplyInv(e,s);

    calldataarg args;
    f(e,args);

    assert optionTokenSupplyInv(e,s),
        "open series must have the same number of b- and wTokens";
}


////////////////////////////////////////////////////////////////////////////////
// State evolution /////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

rule noChangeToOtherSeries(uint64 seriesId, uint64 seriesOther, method f)
{
    uint256 balanceBefore = getSeriesERC20Balance(seriesOther);
    
    require seriesId != seriesOther;
    address sender;
    callFunctionOnSeries(seriesId, sender, f);
    assert balanceBefore == getSeriesERC20Balance(seriesOther);
}


////////////////////////////////////////////////////////////////////////////////
// Method specifications ///////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

/*
Calls to exerciseOption() always revert unless the Market is expired.
*/
// pass :https://vaas-stg.certora.com/output/23658/636ba68d6d0ef701d877/?anonymousKey=6a8bc8cbe8fe11ba53984fab6fcaf330cc277af7
// checked with bug : https://vaas-stg.certora.com/output/23658/bedb692d576e49c12c41/?anonymousKey=8f6fc499348ffe66fa0cf3faa95fdd24cd6779f3
rule exerciseOnlyOnExpired() {
    env e;
    uint256 amount;
    uint64 seriesId;
    bool _revertOtm;
    exerciseOption@withrevert(e, seriesId, amount, _revertOtm);
    
    bool reverted = lastReverted; 
    assert !isExpired(e, seriesId) => reverted, "exercise was invoked on a series that is not expired";
}

rule noWithdrawOnOpen() {
    uint64 seriesId; uint256 optionAmount;
    env e;

    require isOpen(e,seriesId);
    claimCollateral@withrevert(e, seriesId, optionAmount);

    assert lastReverted,
        "cannot claim collateral on an open option";
}

rule noCloseOnExpired() {
    uint64 seriesId; uint256 optionAmount;
    env e;

    require isExpired(e,seriesId);
    closePosition@withrevert(e, seriesId, optionAmount);

    assert lastReverted,
        "cannot withdraw an expired position";
}

////////////////////////////////////////////////////////////////////////////////
// High-level properties ///////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

/*  A user cannot profit from minting, then exercising and claiming the minted tokens. Formally, if a user mints x
    options, then claims x wTokens and exercises x bTokens in the same market when it expires, her collateral token
    balance will be unchanged, up to fees. Note that there are two different fees paid: one for exerciseOption(), and
    one for claimCollateral().
*/
// passed https://vaas-stg.certora.com/output/23658/77cb782d2d288b07a18c/?anonymousKey=7df0ac196fa5bcbffaf5be79ac5a500827bba408
// verified? 
rule noGain() {
    
    env eOpen;
    address account = eOpen.msg.sender;
    uint256 amount;
    uint64 seriesId;
    address collateralT = collateralToken(seriesId);
    
    
    uint256 balanceBefore = tokenBalanceOf(collateralT, account);
    uint256 wTokenBalanceBefore = wTokenBalance(seriesId, account);
    uint256 bTokenBalanceBefore =  bTokenBalance(seriesId, account);
   // require systemBalanceBefore == tokenBalanceOf(collateralT, getVault());
    
    ///////// Minting on an open contract
    mintOptions(eOpen, seriesId, amount); 
    
    ///////// Claiming then exercising on an expired market
    env eExpired;
    require account == eExpired.msg.sender;
    
    claimCollateral(eExpired, seriesId, amount);   
    bool _revertOtm;
    exerciseOption(eExpired, seriesId, amount, _revertOtm);

    
    // checking values after
    uint256 balanceAfter = tokenBalanceOf(collateralT, account);
    uint256 wTokenBalanceAfter =  wTokenBalance(seriesId, account);
    uint256 bTokenBalanceAfter =  bTokenBalance(seriesId, account);
    assert balanceAfter <= balanceBefore , "balance should not increase";
    assert wTokenBalanceBefore  == wTokenBalanceAfter, "wToken did not restore as expected";
    assert bTokenBalanceBefore  == bTokenBalanceAfter, "wToken did not restore as expected";
}

/*
If exercising the whole amount of bToken, no more exerciseOption is possible
*/
//pass https://vaas-stg.certora.com/output/23658/51f3c605448e5155cb47/?anonymousKey=e0e6b1b145e2f76ea13ef840d9b44ee8eb394906
// checked with bug 
rule noDoubleExercise() {
    env e;
    uint64 seriesId;
    address account;
    bool _revertOtm;
    require e.msg.sender == account;
    
    uint256 amount = bTokenBalance(seriesId, account);
    exerciseOption(e, seriesId, amount, _revertOtm);
    
    uint256 anyAmount;
    require anyAmount > 0;
    exerciseOption@withrevert(e, seriesId, anyAmount, _revertOtm);
    
    bool reverted = lastReverted;
    assert reverted, "double exercise";
}

////////////////////////////////////////////////////////////////////////////////
// Helper functions ////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

function callFunctionOnSeries(uint64 seriesId, address sender, method f) {
    env e;
    require e.msg.sender == sender;
    uint256 amount;
    bool _revertOtm;
    if (f.selector == exerciseOption(uint64,uint256,bool).selector ) {
        exerciseOption(e, seriesId, amount, _revertOtm);
    }
    else if (f.selector == claimCollateral(uint64,uint256).selector) {
        claimCollateral(e, seriesId, amount);
    }
    else if (f.selector == mintOptions(uint64,uint256).selector) {
        mintOptions(e, seriesId, amount);
    }
    else if (f.selector == closePosition(uint64,uint256).selector) {
        closePosition(e, seriesId, amount);
    }
    else {
        calldataarg args;
        f(e,args);
    }
}

/*
// STATUS: running correctly - but only with loop iter 2 
rule sanity(method f) {
    env e;
    calldataarg arg;
    f(e, arg);
    assert false;
}
*/
