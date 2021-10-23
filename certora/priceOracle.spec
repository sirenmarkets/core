// See priceOracleReport.md for a detailed description of these rules.

methods {
    // lifecycle management ////////////////////////////////////////////////////

    /* initialize(t) succeeds iff
        - state is not initialized 
        - t is either 1 week or 1 day */
    /* initialize(t) has the following side effects:
        - state becomes initialized
        - owner is set to msg.sender
        - dateOffset is set to t */
    initialize(uint256) 

    /* addTokenPair(u,c,o) succeeds iff
        - state is initialized
        - caller is the owner
        - oracles(u,c) is undefined
        - o is nonzero
        */
    /* addTokenPair(u,c,o) has the following side effects:
        - oracles(u,c) is set to o
        */
    addTokenPair(address, address, address) 

    // settlement price management /////////////////////////////////////////////

    /* setSettlementPrice(u,c) succeeds if
        - oracles(u,c) is defined
        - oracles(u,c).latestData() succeeds
        - request has sufficient gas to reestablish invariants */
    /* setSettlementPrice(u,c) has the following effects:
        - updates price(u,c,timestamp) = oracles(u,c).latestData()
        - may update price(u,c,t') for other t' in order to maintain invariants
        */
    setSettlementPrice(address,address) 

    /* succeeds if date is an epoch boundary */
    /* updates price(u,c,t) if price(u,c,t) is 0 */
    setSettlementPriceForDate(address,address,uint256)

     // getters / helper functions //////////////////////////////////////////////

    /* always succeeds.  Returns (price(u,c,t) != 0, price(u,c,t)) */
    getSettlementPrice(address,address,uint256)
        returns (bool, uint256)

    /* getCurrentPrice(u, c) succeeds if:
        - an oracle exists for the given pair
       getCurrentPrice(u, c) has the following effects:
        - returns a boolean if the price is 0
        - returns the price listed by an oracle for a given u and c
    */
    getCurrentPrice(address, address)
        returns (uint256)

    /* always succeeds.  Returns the largest epoch boundary before t */
    get8amWeeklyOrDailyAligned(uint256)
        returns (uint256) envfree

    /* getters generated by solidity */
    settlementPrices(address, address, uint256) returns (uint256) envfree
    dateOffset() returns (uint256) envfree
    oracles(address,address) returns (address) envfree // fixed on review (added return)
    owner() returns (address) envfree // fixed on review (added return)
    _initialized() returns (bool) envfree // fixed on review changed variable to public and added getter 
    _initializing() returns (bool) envfree // fixed on review changed variable to public and added getter

    /* getters implemented by harness */
    getOracleAnswer(address, address) returns (int256) envfree

    // external method specifications //////////////////////////////////////////

    answer() returns (int256)  => DISPATCHER(true)
    latestRoundData() => DISPATCHER(true)
}

//---------------------------- Definitions -------------------------------------
//

// placeholders since CVT doesn't seem to support solidity's hour / day keywords

definition oneMinute() returns uint256 = 60;
definition oneHour()   returns uint256 = 60 * oneMinute();
definition oneDay()    returns uint256 = 24 * oneHour();
definition oneWeek()   returns uint256 = 7  * oneDay();
definition MAX_DATE()   returns uint256 = 100000000000000000000000000000000000000000000000;
definition time_bounded(uint256 t) returns bool = t < MAX_DATE() && t > dateOffset();
                                         

definition uninitialized() returns bool =
  !_initialized();


// This is just a shorthand for convenience
definition _price(address u, address c, uint256 t) returns uint256 =
  settlementPrices(u,c,t);

//---------------------------Invariants----------------------------------------
//

// initialization
invariant noninitializing() 
  // @MM - V - Make sense - checks that the contract is not ever in initialization process.
  !_initializing()


invariant dateOffset_initialization()
  // @MM - V - Make sense - checks that if dateOffset is 0 then the contract is uninitiallized.
  // It ignores any case where the status of the instance is in the process of initialization, as we know that .
  dateOffset() == 0 <=> uninitialized()
  { preserved { requireInvariant noninitializing(); } }


invariant owner_initialization()
  // @MM - V - Make sense - since owner is initialized only in "initialize" function,
  // if owner is 0 then there was no initialization. Also, if the instance was uninitialized then the owner has to be 0 (no owner).
  // It makes sure that it is not in initializing process (initializing == true)
  owner() == 0 <=> uninitialized()
    { preserved { requireInvariant noninitializing(); }
    preserved initialize(uint256 offset) with (env e) {
      requireInvariant noninitializing();
      require e.msg.sender != 0;
    }
  }


// add dateOffset_initialization()
invariant price_initialization(address u, address c, uint256 t)
  // @MM - V - Make sense - iff the instance is uninitialized then all prices should be 0.
  // We require that the dateOffset will be 0 as well if uninitialized. 
  uninitialized() => _price(u,c,t) == 0
  { preserved { requireInvariant dateOffset_initialization(); } }


invariant oracles_initialization(address u, address c)
  // @MM - Make sense - if the instance is uninitialized then the oracle should be of value 0 (default - no oracle)
  // Since only Owner can execute this function it is necessary to assume that owner is correctly set.
  uninitialized() => oracles(u,c) == 0
    { preserved addTokenPair(address _u, address _c, address _o) with (env e) {
      requireInvariant owner_initialization();
      require e.msg.sender != 0;
    }
  }
  

// an execution of 3 noninitialization.
function requireInitializationInvariants() {
  // @MM - Just grouping for convenience. If each is passing independently then all 3 have to pass
  requireInvariant noninitializing();
  requireInvariant dateOffset_initialization();
  requireInvariant owner_initialization();
}


// dateOffset
invariant dateOffset_value()
  // @MM - V - Make sense - at any given time the value of dateOffset should be either 0 (to pass constructor), 1Day or 1Week.
  dateOffset() == 0 || dateOffset() == oneDay() || dateOffset() == oneWeek()


// price
invariant price_domain(address u, address c, uint256 t)
  // @MM - V - Make sense - if a price is set (!=0) than there has to be an oracle assosiated with it (!=0).
  // if a price is 0, then there could either be an oracle assosiated with it (returned price 0),
  // or there that it is a default value of the map, i.e. there is no oracle assosiated with this pair at all.
  _price(u,c,t) != 0 => oracles(u,c) != 0


//---------------------------Owner transitions---------------------------------
//

// Checks that the new owner that is set is the sender + that it is only changed by initialize() func
rule owner_initialize_only(method f) {
  // @MM - V - Make sense - If owner changed we want to make sure that it happned only as a result of initialize
  // also checks that the owner was set to msg.sender 
  env e; calldataarg args;

  address ownerBefore = owner();
  f(e,args);
  address ownerAfter  = owner();

  assert ownerBefore != ownerAfter =>
    f.selector == initialize(uint256).selector,
    "owner is only changed by initialize";

  assert ownerBefore != ownerAfter =>
    ownerAfter == e.msg.sender,
    "owner is changed to the intialize(..) message sender";
}


// Checks that an owner change is occuring only when the state before is uninitialized
// Q: Is the contract fine with owner change at all? if not why should we allow initialize func to run more than once?
rule owner_single_definition(method f) {
  // @MM - V - Make sense - if owner is changed then the state before changing was uninitialized.
  // Q: A stronger demand will be that the initialized chnaged as well, as owner change has to come with initialization changes
  env e; calldataarg args;

  requireInitializationInvariants();

  bool uninitBefore = uninitialized();
  address ownerBefore = owner();
  f(e,args);
  address ownerAfter  = owner();
  bool uninitAfter = uninitialized();

  assert ownerBefore != ownerAfter =>
    uninitBefore && !uninitAfter,
    "owner can only be changed if uninitialized";
}

//---------------------------dateOffset transitions----------------------------
//

// Checks that dateOffset only changes due to invokation of initialize func
rule dateOffset_transition (method f) {
  // @MM - V - Make sense - if the dateOffset changed it will raise error if the function that caused it is not initialize
  env e; calldataarg args;

  uint256 dateOffsetBefore = dateOffset();
  f(e, args);
  uint256 dateOffsetAfter  = dateOffset();

  assert dateOffsetBefore != dateOffsetAfter =>
    f.selector == initialize(uint256).selector,
    "dateOffset only changed by initialize";

  // NOTE: argument to initialize checked in rule dateOffset_transition_initialize below
}


// Checks that dateOffset is set correctly in the static var
rule dateOffset_transition_initialize() {
  // @MM - V - Make sense - Seems like an extremly fundamental - static var is set according to parameter value
  env e;
  uint256 date;

  initialize(e, date);

  assert dateOffset() == date,
    "dateOffset changed to d by initialize(d)";
}


// Checks that the dateOffset is being set only once
rule dateOffset_single_definition(method f) {
  // @MM - V - Make sense - if dateOffset changes that has to mean that it was set to 0 before the change.
  env e; calldataarg args;

  requireInitializationInvariants();

  uint256 dateOffsetBefore = dateOffset();
  f(e, args);
  uint256 dateOffsetAfter  = dateOffset();

  assert dateOffsetBefore != dateOffsetAfter =>
    dateOffsetBefore == 0,
    "dataOffset only changed if undefined";
}

//-------------------------Oracle Changes-----------------------------
//

// Checks that an oracle of a coin pair cannot be changed unless addTokenPair is invoked
rule oracle_valid_change (method f) {
  // @MM - V - Make sense - an oracle should be incharge of a pair for eternity once it is set.
  env e;
  calldataarg arg;

  address underlying; address currency;

  address oracleBefore = oracles(underlying, currency);
  f(e, arg);
  address oracleAfter  = oracles(underlying, currency);

  assert oracleBefore != oracleAfter =>
    f.selector == addTokenPair(address,address,address).selector,
    // NOTE: arguments to addTokenPair are handled by oracle_transition_addTokenPair below
    "only addTokenPair can change the oracle";
}


// Checks that addTokenPair does not change existing oracle that is assosiated with a coin pair
rule oracle_transition_addTokenPair() {
  // @MM - VX - Should we allow invocation of addTokenPair at all if oracle is already set?
  env e;
  address underlying; address currency;

  address oracleBefore = oracles(underlying, currency);

  address call_u; address call_c; address newOracle;
  addTokenPair(e, call_u, call_c, newOracle);

  address oracleAfter = oracles(underlying, currency);

  // @MM - if the oracle changed then the coin pairs has to be the same beofre, after and during invocation + the oracle after has to change to the newOracle
  // oracleBefore and after not change if the u,c and u,c _call are'nt the same.
  // if they are the same, a new oracle should be set so that oracleAfter == newOracle
  assert oracleAfter != oracleBefore =>
    underlying == call_u && currency == call_c && oracleAfter == newOracle,
    "addTokenPair may only change the oracle given by its arguments";
}

/*
==============================================================================================
-------------------------------EXAMPLE--------------------------------------------------------
==============================================================================================
// Checks that addTokenPair does not change existing oracle that is assosiated with a coin pair
rule oracle_transition_addTokenPair() {
  // @MM - VX - Should we allow invocation of addTokenPair at all if oracle is already set?
  // What may happen here is that add token pair will function as update
  env e;
  address underlying=1; address currency=2;

  address oracleBefore = 5;//oracles(underlying, currency);

  address call_u=1; address call_c=2; address newOracle=0;
  addTokenPair(e, call_u, call_c, newOracle);

  address oracleAfter = oracles(underlying, currency);

  // @MM - if the oracle changed then the coin pairs has to be the same beofre, after and during invocation + the oracle after has to change to the newOracle
  // oracleBefore and after not change if the u,c and u,c _call are'nt the same.
  // if they are the same, a new oracle should be set so that oracleAfter == newOracle
  assert oracleAfter != oracleBefore =>
    underlying == call_u && currency == call_c && oracleAfter == newOracle,
    "addTokenPair may only change the oracle given by its arguments";
}
*/


// Checks that the oracle changes only if the owner invoke the function
rule oracle_owner_only (method f) {
  // @MM - V - Make sense - if the oracle changes then the user who called the function must be the owner
  env e;
  calldataarg arg;

  address underlying; address currency;

  address oracleBefore = oracles(underlying, currency);
  f(e, arg);
  address oracleAfter  = oracles(underlying, currency);

  assert oracleBefore != oracleAfter =>
    e.msg.sender == owner(),
    "only the contract owner can change an oracle";
}


// Checks that the oracle changes only if before it was 0.
rule oracle_single_definition (method f) {
// @MM - VX - This rule is complete only if the oracle_transition is complete. At the moment it does not check single def.
// without look at the implementation, it is possible to change the oracle of an existing coin pair to 0.
  env e;
  calldataarg arg;

  address underlying; address currency;

  address oracleBefore = oracles(underlying, currency);
  f(e, arg);
  address oracleAfter  = oracles(underlying, currency);

  assert oracleBefore != oracleAfter =>
    oracleBefore == 0,
    "oracle can only be changed once";
}


// creating an oracle implies that the most recent price is set and aligned
rule oracle_price_nontrivial(method f) {
  // @MM - V - Make sense - This isn't what the contract says so we added a require(currentPrice != 0) in the addTokenPair func.
  // The original contract allow retriving 0 value a valid rate.
  // This make sense only because setSettelmentPrice and setSettelmentPriceForDate count on having some price set for a given coin pair.
  env e;
  address u; address c; address a;
  calldataarg args;

  address oracle_before = oracles(u,c);
  f(e, args);
  address oracle_after = oracles(u,c);

  uint256 t = get8amWeeklyOrDailyAligned(e.block.timestamp);
  uint256 p = _price(u,c,t);

  assert oracle_before != oracle_after => p != 0, "oracle defined with no initial price";
}


//---------------------------------Price Evolution------------------------------------
//

// Checks that each price element is changed once - from 0.
rule price_single_edit (method f) {
  // @MM - V - Make sense - price cannot be changed unless it's value was 0.
  env e; calldataarg args;
  address u; address c; uint256 t;

  requireInvariant price_domain(u,c,t);

  uint256 priceBefore = _price(u,c,t);
  f(e, args);
  uint256 priceAfter  = _price(u,c,t);

  assert priceAfter != priceBefore =>
    priceBefore == 0,
    "price only changed if undefined";
}


// Checks that if the price changes, then it changes correctly to the answer retrieved from the oracle.s 
rule price_accurate (method f) {
  // @MM - V - Make sense - very fundamental rule, checks that the correct price is set in the mapping.
  // Q: what's the purpose of the casting?
  env e; calldataarg args;
  address u; address c; uint256 t;
  requireInitializationInvariants();
  requireInvariant price_domain(u,c,t);
  uint256 priceBefore = _price(u,c,t);
  f(e, args);
  uint256 priceAfter = _price(u,c,t);

  assert priceAfter != priceBefore =>
    to_mathint(priceAfter) == to_mathint(getOracleAnswer(u,c)),
    "check priceAfter is the result of a call to correct oracle";
}


// Checks that a price is not updated in the future, i.e. later than block.timestamp
rule price_bounded_past (method f) {
  // @MM - V - Make sense - if the price changed due to a function, the time asossiated with that price must not be in the future.
  env e; calldataarg args;
  address u; address c; uint256 t;

  uint256 priceBefore = _price(u,c,t);
  f(e, args);
  uint256 priceAfter  = _price(u,c,t);

  assert priceAfter != priceBefore =>
    t <= e.block.timestamp,
    "price only changed in the past";
}


// if a price is set, there is either a price set before that price or no price after set (indicating it is the first price)
// the first price is set by addTokenPair so this function is not relevant
rule price_t0_constant (method f) filtered {f -> (f.selector != addTokenPair(address, address, address).selector)}{
  // @MM - V - Make sense - if the price changed it either changed at a point consequent to an existing price (not creating gaps)
  // or any other point later than t are 0 (meaning this is the genesis date point).
  uint256 t1; uint256 t;
  require t1 > t;

  env e; calldataarg args;
  address u; address c;

  uint256 p_before = _price(u,c,t);
  f(e, args);
  uint256 p_after = _price(u,c,t);

  assert p_before != p_after => _price(u,c,to_uint256(t - dateOffset())) != 0
                  || _price(u,c,t1) == 0, "value before prior values set";
}

/* Settlement Prices should only ever be changed by:
      - setSettlementPrice
      - setSettlementPriceForDate
      - addTokenPair
*/
rule price_authorized_only (method f) {
  // @MM - V - Make sense - If price changed only one of the specified 3 functions are allowed to change it.
  env e; calldataarg args;
  address u; address c; uint256 t;
  
  uint256 p_before = _price(u,c,t);
  f(e,args);
  uint256 p_after = _price(u,c,t);

  assert p_before != p_after => f.selector == setSettlementPrice(address, address).selector ||
      f.selector == setSettlementPriceForDate(address, address, uint256).selector ||
      f.selector == addTokenPair(address, address, address).selector,
      "Unexpected function editing settlement prices";
}


//--------------------------------Unit Tests-----------------------------------
//
//

// get settlement price returns the accurate price, and returns t/f if nonzero/zero
rule verify_getSettlementPrice() {
  // @MM - V - Make sense - Checks the _price definition in the spec,
  // the necessary relation between the bool and the price,
  // and that the getter doesn't change the price in the mapping 
  env e;
  address u; address c; uint256 t;

  uint256 ret_int; bool ret_bool;

  uint256 p_before = _price(u, c, t);

  ret_bool, ret_int = getSettlementPrice(e, u,c,t);

  uint256 p_after = _price(u, c, t);
  
  // checks that the shorthand _price defenition works properly.
  assert ret_int == _price(u,c,t), "Returned Wrong Value";
  // checks that the getter returns true iff the price is non-zero.
  assert ret_int != 0 <=> ret_bool, "boolean price mismatch";
  // checks price haven't changed as a result of the getter invocation.
  assert p_before == p_after, "price altered by viewing";
}

// if addTokenPair is called, a new oracle will be created
// no other oracles are changed when addTokenPair is called?
// if oracle(u, c) exists then add token pair will revert
rule verify_addTokenPair() {
  // @MM - V - Make sense - checks that the function obey only to owner, that the oracle changes only if the value before was 0,
  // and that it changes the value correctly, i.e. update the oracle in the (u,c) pair and this pair alone.
  env e; 
  address u; address c; address o;
  // dont bother show examples where o == 0
  require o > 0;
  address pre_val = oracles(u, c);
  address u1; address c1;
  address pre_alt_val = oracles(u1, c1);
  addTokenPair(e, u, c, o);

  // assert !initialized() => lastReverted, "addTokenPair did not revert but was not initialized";
  assert e.msg.sender != owner() => lastReverted, "caller other than owner did revert";
  // addTokenPair reverted if the oracle asossiated with (u,c) before the call != 0
  assert pre_val != 0 => lastReverted, "already defined oracle changed";
  // addTokenPair changed the oracle asossiated with (u,c) if before the call the oracle was 0
  assert pre_val == 0 => oracles(u , c) == o, "Oracle was changed to incorrect address";
  // if the oracle of (u1,c1) changed then (u,c) == (u1,c1). if it fails the function has fundamental falw, 
  // because it changes the wrong (u,c) pair
  assert pre_alt_val != oracles(u1, c1) => u1 == u && c1 == c, "oracle at incorrect value changed";
}


// Checks that the setSettlementPrice func is working properly - sets an oracle, sets correct retrived price,
// is not overwritting a price value, and that if all of these hold it implies that the price is changed
rule verify_setSettlementPrice() {
  // @MM - V - Make sense
  env e; 
  address u; address c; 
  uint256 t = get8amWeeklyOrDailyAligned(e.block.timestamp);
  uint256 p_pre = _price(u, c, t);
  setSettlementPrice(e, u, c);
  uint256 p_post = _price(u, c, t);
  uint256 price = getCurrentPrice(e, u, c);

  // if the price at the aligned "now" is changed, then the oracle has to be set (!=0)
  assert p_pre != p_post => oracles(u, c) != 0, "set for undefined oracle"; // oracles is defined
  // if the price at the aligned "now" is changed, then the price after the change has to be the price retrieved from the getCurrentPrice func.
  assert p_pre != p_post => p_post == price, "incorrect price set"; // price is updated accurately
  // if the price at the aligned "now" is changed, then the price before the change has to be undefined (0)
  assert p_pre != p_post => p_pre == 0, "price overwritten"; // price is only updated if 0
  // if conditions are correct, a settlement price will be set
  assert p_pre == 0 && oracles(u, c) != 0 && price != 0 => p_pre != p_post, "price not set";
  // assert p_pre == p_post => lastReverted, "price set failure"; // if price isn't updated the function reverted 
}


// Checks that setSettlementPriceForDate works properly - 
rule verify_setSettlementPriceForDate() {
  // @MM - X - Does not invoke setSettlementPriceForDate func.
  env e; 
  address u; address c; 
  uint256 t;
  uint256 p_pre = _price(u, c, t);
  // setSettlementPrice(e, u, c);
  setSettlementPriceForDate(e, u, c, t);
  uint256 p_post = _price(u, c, t);
  uint256 price = getCurrentPrice(e, u, c);
  uint256 t_aligned = get8amWeeklyOrDailyAligned(t);

  // if the price is changed, then the oracle has to be set (!=0)
  assert p_pre != p_post => oracles(u, c) != 0, "set for undefined oracle"; // oracles is defined
  // if the price is changed, then the price after the change has to be the price retrieved from the getCurrentPrice func.
  assert p_pre != p_post => p_post == price, "incorrect price set"; // price is updated accurately
  // if the price is changed, then the price before the change has to be undefined (0)
  assert p_pre != p_post => p_pre == 0, "price overwritten"; // price is only updated if 0
  // assert p_pre == p_post => lastReverted, "price set failure"; // if price isn't updated the function reverted 
  // if the price is changed, then the time that has changed has to be an aligned time.
  assert p_pre != p_post => t == t_aligned, "price set but not aligned"; // price must be aligned
  // if the price is changed, then the time of the changed element must not be in the future.
  assert p_pre != p_post => t <= e.block.timestamp, "future price set"; // past prices only
  // long rule to assert that if the the necessary conditions are met, the price is set
  assert p_pre == 0 && oracles(u, c) != 0 && t == t_aligned && price != 0 => p_pre != p_post, "price not set";
}


// Checks that getCurrentPrice doesn't change the state of the system + that
// if there is no oracle defined for the pair the system reverts
rule verify_getCurrentPrice() {
  // @MM - V - Make sense
  env e;
  address u; address c; uint256 t;

  uint256 p_before = _price(u, c, t);
  uint256 p = getCurrentPrice(e, u, c);
  uint256 p_after = _price(u, c, t);

  assert oracles(u, c) == 0 => lastReverted, "did not revert on an unset oracle";
  assert p_before == p_after, "price changed by viewing";
}
/*
rule sanity(method f) {
  env e;
  calldataarg args;
  f(e,args);
  assert false;
}*/

//---------------------------------Spacing Rules-------------------------------

// Make sure that the elements in the mapping are evenly spaced.
// It proves by iduction - take any 2 arbitrary consequtive aligned dates and checks that there is no elemet between them (price = 0)
rule price_space(address u, address c, uint256 t1, uint256 t2, uint256 t, method f){
    // This rule replaces the "price_spacing" invariant. added on review.      
    uint256 alignedT1 = get8amWeeklyOrDailyAligned(t1);
    uint256 alignedT2 = get8amWeeklyOrDailyAligned(t2);
    requireInitializationInvariants();
    requireInvariant price_initialization(u,c,alignedT1);
    requireInvariant price_initialization(u,c,alignedT2); 
    requireInvariant dateOffset_value();

    require( alignedT1 > alignedT2 && (alignedT1 - alignedT2 == dateOffset()) );
    // require( _price(u, c, alignedT1) != 0 && _price(u, c, alignedT2) != 0 );
    require( alignedT2 < t && t < alignedT1 );
    require( _price(u, c, t) == 0 );

    env e;
    calldataarg args;
    f(e, args);

    assert( _price(u, c, t) == 0, "Price in between is not 0" );
}

/*
invariant price_compact_right(address u, address c, uint256 t0, uint256 t)
  _price(u,c,t0) != 0 && _price(u,c, to_uint256(t0 + dateOffset())) == 0 =>
    (t > t0 => _price(u,c,t) == 0)
    { preserved {
        require(getOracleAnswer(u,c) != 0);
        requireInitializationInvariants(); 
        requireInvariant price_domain(u, c, t);
        requireInvariant price_domain(u, c, t0);
        requireInvariant price_initialization(u,c,t0);
        requireInvariant price_initialization(u,c,t); 
        requireInvariant dateOffset_value();
        require time_bounded(t);
        require time_bounded(t0);
    } }
*/


// checks that there is a final element in the list
rule price_compact_right(address u, address c, uint256 t0, uint256 t, method f){
  // This rule replaces the "price_compact_right" invariant. added on review.      

  uint256 alignedT0 = get8amWeeklyOrDailyAligned(t0);

  requireInitializationInvariants(); // it is not in initialization process, dateOffset is 0 iff uninitialized, owner is 0 iff uninitialized
  requireInvariant price_domain(u,c,t); // if there is a price there is an oracle assosiated
  requireInvariant price_domain(u,c,alignedT0); // if there is a price there is an oracle assosiated
  requireInvariant price_initialization(u,c,alignedT0); // if uninitialize then price is 0
  requireInvariant price_initialization(u,c,t); // if uninitialize then price is 0
  requireInvariant dateOffset_value(); // dateoffset is either 0, 1day or 1week
  require time_bounded(t); // the time is bounded between timeoffset to max date
  require time_bounded(alignedT0); // the time is bounded between timeoffset to max date
  
  env e;

  require(_price(u,c,alignedT0) != 0);
  // t!= (alignedT0 + dateOffset()) is passing setSettlementPrice even though we dont think it should.
  require(t > alignedT0 && t != (alignedT0 + dateOffset()));
  require(forall uint256 t2. t2 > alignedT0 => _price(u,c,t2) == 0);


  calldataarg args;
  f(e, args);

  // if (f.selector == setSettlementPrice(address, address).selector || f.selector == setSettlementPriceForDate(address, address, uint256).selector)
  // {
  //   require(t > get8amWeeklyOrDailyAligned(e.block.timestamp));
  // }
  assert(_price(u,c,t) == 0, "There is a price after t0");
}

/*
invariant price_compact_left(address u, address c, uint256 t0, uint256 t)
  _price(u,c,t0) != 0 && _price(u,c,to_uint256(t0 - dateOffset())) == 0 =>
    (t < t0 => _price(u,c,t) == 0)
    { preserved {
        requireInitializationInvariants();         
        requireInvariant price_domain(u, c, t);
        requireInvariant price_domain(u, c, t0);
        requireInvariant price_initialization(u,c,t0);
        requireInvariant price_initialization(u,c,t);
        requireInvariant dateOffset_value(); 
        require time_bounded(t);
        require time_bounded(t0);
    } }
*/

rule price_compact_left(address u, address c, uint256 t0, uint256 t, method f){
  // This rule replaces the "price_compact_left" invariant. added on review.      

  uint256 alignedT0 = get8amWeeklyOrDailyAligned(t0);

  requireInitializationInvariants(); // it is not in initialization process, dateOffset is 0 iff uninitialized, owner is 0 iff uninitialized
  requireInvariant price_domain(u, c, t); // if there is a price there is an oracle assosiated
  requireInvariant price_domain(u, c, alignedT0); // if there is a price there is an oracle assosiated
  requireInvariant price_initialization(u,c,alignedT0); // if uninitialize then price is 0
  requireInvariant price_initialization(u,c,t); // if uninitialize then price is 0
  requireInvariant dateOffset_value(); // dateoffset is either 0, 1day or 1week
  require time_bounded(t); // the time is bounded between timeoffset to max date
  require time_bounded(alignedT0); // the time is bounded between timeoffset to max date
  
  env e;
  require(_price(u,c,alignedT0) != 0 && alignedT0 <= get8amWeeklyOrDailyAligned(e.block.timestamp)); // this last && should be changed to requireinvariant no_price_future
  require(t < alignedT0);
  
  // uint256 Pt2 = _price(u,c,t-dateOffset());
  // require(Pt2 == 0);

  require(forall uint256 t2. t2 < alignedT0 => _price(u,c,t2) == 0);

  calldataarg args;
  f(e, args);
  
  assert(_price(u,c,t) == 0, "There is a price after t0");
}

// These invariants are not checked because of timeouts, but
// should be covered by the spacing and compactness requirements
// 
// invariant price_convex (address u, address c, uint256 t1, uint256 t2)
//   _price(u,c,t1) != 0 && _price(u,c,t2) != 0 =>
//   (forall uint256 t.
//     t1 <= t && t <= t2 && isEpochBoundary(t) => _price(u,c,t) != 0)
//
// invariant price_domain_epoch(address u, address c, uint256 t)
//   _price(u,c,t) != 0 => isEpochBoundary(t)
