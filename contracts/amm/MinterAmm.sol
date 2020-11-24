pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";
import "../market/IMarket.sol";
import "../market/IMarketsRegistry.sol";
import "../proxy/Proxiable.sol";
import "../proxy/Proxy.sol";
import "../libraries/Math.sol";
import "./InitializeableAmm.sol";

/**
This is an implementation of a minting/redeeming AMM that trades a list of markets with the same
collateral and payment assets. For example, a single AMM contract can trade all strikes of WBTC/USDC calls

It uses on-chain Black-Scholes approximation and an Oracle price feed to calculate price of an option.
It then uses this price to bootstrap a constant product bonding curve to calculate slippage for a particular trade
given the amount of liquidity in the pool.

External users can buy bTokens with collateral (wToken trading is disabled in this version).
When they do this, the AMM will mint new bTokens and wTokens, sell off the side the user doesn't want,
and return value to the user.

External users can sell bTokens for collateral. When they do this, the AMM will sell a partial amount of assets
to get a 50/50 split between bTokens and wTokens, then redeem them for collateral and send back to the user.

LPs can provide collateral for liquidity. All collateral will be used to mint bTokens/wTokens for each trade.
They will be given a corresponding amount of lpTokens to track ownership. The amount of lpTokens is calculated based on
total pool value which includes collateral token, payment token, active b/wTokens and expired/unclaimed b/wTokens

LPs can withdraw collateral from liquidity. When withdrawing user can specify if they want their pro-rata b/wTokens
to be automatically sold to the pool for collateral. If the chose not to sell then they get pro-rata of all tokens
in the pool (collateral, payment, bToken, wToken). If they chose to sell then their bTokens and wTokens will be sold
to the pool for collateral incurring slippage.

All expired unclaimed wTokens are automatically claimed on each deposit or withdrawal

All conversions between bToken and wToken in the AMM will generate fees that will be send to the protocol fees pool
(disabled in this version)
 */
contract MinterAmm is InitializeableAmm, OwnableUpgradeSafe, Proxiable {
    /** Use safe ERC20 functions for any token transfers since people don't follow the ERC20 standard */
    using SafeERC20 for IERC20;
    using SafeERC20 for ISimpleToken;
    /** Use safe math for uint256 */
    using SafeMath for uint256;

    /** @dev The token contract that will track lp ownership of the AMM */
    ISimpleToken public lpToken;

    /** @dev The ERC20 tokens used by all the Markets associated with this AMM */
    IERC20 public collateralToken;
    IERC20 public paymentToken;
    uint8 internal collateralDecimals;
    uint8 internal paymentDecimals;

    /** @dev The registry which the AMM will use to lookup individual Markets */
    IMarketsRegistry public registry;

    /** @dev The oracle used to fetch the most recent on-chain price of the collateralToken */
    AggregatorV3Interface internal priceOracle;

    /** @dev a factor used in price oracle calculation that takes into account the decimals of
     * the payment and collateral token
     */
    uint256 internal paymentAndCollateralConversionFactor;

    /** @dev Chainlink does not give inverse price pairs (i.e. it only gives a BTC / USD price of $14000, not
     * a USD / BTC price of 1 / 14000. Sidenote: yes it is confusing that their BTC / USD price is actually in
     * the inverse units of USD per BTC... but here we are!). So the initializer needs to specify if the price
     * oracle's units match the AMM's price calculation units (in which case shouldInvertOraclePrice == false).
     *
     * Example: If collateralToken == WBTC, and paymentToken = USDC, and we're using the Chainlink price oracle
     * with the .description() == 'BTC / USD', and latestAnswer = 1400000000000 ($14000) then
     * shouldInvertOraclePrice should equal false. If the collateralToken and paymentToken variable values are
     * switched, and we're still using the price oracle 'BTC / USD' (because remember, there is not inverse price
     * oracle) then shouldInvertOraclePrice should equal true.
     */
    bool internal shouldInvertOraclePrice;

    /** @dev Fees on trading */
    uint16 public tradeFeeBasisPoints;

    /** Volatility factor used in the black scholes approximation - can be updated by the owner */
    uint256 public volatilityFactor;

    /** @dev Flag to ensure initialization can only happen once */
    bool initialized = false;

    /** @dev This is the keccak256 hash of the concatenation of the collateral and
     * payment token address used to look up the markets in the registry
     */
    bytes32 public assetPair;

    /** Track whether enforcing deposit limits is turned on.  The Owner can update this. */
    bool public enforceDepositLimits;

    /** Amount that accounts are allowed to deposit if enforcement is turned on */
    uint256 public globalDepositLimit;

    /** Struct to track how whether user is allowed to deposit and the current amount they already have deposited */
    struct LimitAmounts {
        bool allowedToDeposit;
        uint256 currentDeposit;
    }

    /**
     * DISABLED: This variable is no longer being used, but is left it to support backwards compatibility of
     * updating older contracts if needed.  This variable can be removed once all historical contracts are updated.
     * If this variable is removed and an existing contract is graded, it will corrupt the memory layout.
     * 
     * Mapping to track deposit limits.
     * This is intended to be a temporary feature and will only count amounts deposited by an LP.
     * If they withdraw collateral, it will not be subtracted from their current deposit limit to
     * free up collateral that they can deposit later.
     */
    mapping(address => LimitAmounts) public collateralDepositLimits;

    /** Emitted when the owner updates the enforcement flag */
    event EnforceDepositLimitsUpdated(bool isEnforced, uint256 globalLimit);

    /** Emitted when a deposit allowance is updated */
    event DepositAllowedUpdated(address lpAddress, bool allowed);

    /** Emitted when the amm is created */
    event AMMInitialized(ISimpleToken lpToken, address priceOracle);

    /** Emitted when an LP deposits collateral */
    event LpTokensMinted(
        address minter,
        uint256 collateralAdded,
        uint256 lpTokensMinted
    );

    /** Emitted when an LP withdraws collateral */
    event LpTokensBurned(
        address redeemer,
        uint256 collateralRemoved,
        uint256 paymentRemoved,
        uint256 lpTokensBurned
    );

    /** Emitted when a user buys bTokens from the AMM*/
    event BTokensBought(
        address buyer,
        uint256 bTokensBought,
        uint256 collateralPaid
    );

    /** Emitted when a user sells bTokens to the AMM */
    event BTokensSold(
        address seller,
        uint256 bTokensSold,
        uint256 collateralPaid
    );

    /** Emitted when a user buys wTokens from the AMM*/
    event WTokensBought(
        address buyer,
        uint256 wTokensBought,
        uint256 collateralPaid
    );

    /** Emitted when a user sells wTokens to the AMM */
    event WTokensSold(
        address seller,
        uint256 wTokensSold,
        uint256 collateralPaid
    );

    /** Emitted when the owner updates volatilityFactor */
    event VolatilityFactorUpdated(uint256 newVolatilityFactor);

    /** @dev Require minimum trade size to prevent precision errors at low values */
    modifier minTradeSize(uint256 tradeSize) {
        require(tradeSize >= 1000, "Trade below min size");
        _;
    }

    function transferOwnership(address newOwner) public override(InitializeableAmm, OwnableUpgradeSafe) {
        super.transferOwnership(newOwner);
    }

    /** Initialize the contract, and create an lpToken to track ownership */
    function initialize(
        IMarketsRegistry _registry,
        AggregatorV3Interface _priceOracle,
        IERC20 _paymentToken,
        IERC20 _collateralToken,
        address _tokenImplementation,
        uint16 _tradeFeeBasisPoints,
        bool _shouldInvertOraclePrice
    ) public override {
        require(address(_registry) != address(0x0), "Invalid _registry");
        require(address(_priceOracle) != address(0x0), "Invalid _priceOracle");
        require(address(_paymentToken) != address(0x0), "Invalid _paymentToken");
        require(address(_collateralToken) != address(0x0), "Invalid _collateralToken");
        require(_tokenImplementation != address(0x0), "Invalid _tokenImplementation");

        // Enforce initialization can only happen once
        require(!initialized, "Contract can only be initialized once.");
        initialized = true;

        // Save off state variables
        registry = _registry;
        priceOracle = _priceOracle;
        tradeFeeBasisPoints = _tradeFeeBasisPoints;

        // Save off market tokens
        collateralToken = _collateralToken;
        paymentToken = _paymentToken;
        assetPair = keccak256(abi.encode(address(collateralToken), address(paymentToken)));

        ERC20UpgradeSafe erc20CollateralToken = ERC20UpgradeSafe(
            address(collateralToken)
        );
        ERC20UpgradeSafe erc20PaymentToken = ERC20UpgradeSafe(
            address(paymentToken)
        );
        collateralDecimals = erc20CollateralToken.decimals();
        paymentDecimals = erc20PaymentToken.decimals();

        // set the conversion factor used when calculating the current collateral price
        // using the price value from the oracle
        paymentAndCollateralConversionFactor = uint256(1e18)
            .div(uint256(10)**collateralDecimals)
            .mul(uint256(10)**paymentDecimals);

        shouldInvertOraclePrice = _shouldInvertOraclePrice;
        if (_shouldInvertOraclePrice) {
            paymentAndCollateralConversionFactor = paymentAndCollateralConversionFactor
                .mul(uint256(10)**priceOracle.decimals());
        } else {
            paymentAndCollateralConversionFactor = paymentAndCollateralConversionFactor
                .div(uint256(10)**priceOracle.decimals());
        }

        // Create the lpToken and initialize it
        Proxy lpTokenProxy = new Proxy(_tokenImplementation);
        lpToken = ISimpleToken(address(lpTokenProxy));

        // AMM name will be <collateralToken>-<paymentToken>, e.g. WBTC-USDC
        string memory ammName = string(
            abi.encodePacked(
                erc20CollateralToken.symbol(),
                "-",
                erc20PaymentToken.symbol()
            )
        );
        string memory lpTokenName = string(abi.encodePacked("LP-", ammName));
        lpToken.initialize(lpTokenName, lpTokenName, collateralDecimals);

        // Set default volatility
        // 0.4 * volInSeconds * 1e18
        volatilityFactor = 4000e10;

        __Ownable_init();

        emit AMMInitialized(lpToken, address(priceOracle));
    }

    /** The owner can set the flag to enforce deposit limits */
    function setEnforceDepositLimits(
        bool _enforceDepositLimits,
        uint256 _globalDepositLimit
    ) public onlyOwner {
        enforceDepositLimits = _enforceDepositLimits;
        globalDepositLimit = _globalDepositLimit;
        emit EnforceDepositLimitsUpdated(
            enforceDepositLimits,
            _globalDepositLimit
        );
    }

    /** 
    * DISABLED: This feature has been disabled but left in for backwards compatibility.
    * Instead of allowing individual caps, there will be a global cap for deposited liquidity.
    *
    * The owner can update limits on any addresses 
    */
    function setCapitalDepositLimit(
        address[] memory lpAddresses,
        bool[] memory allowedToDeposit
    ) public onlyOwner {
        // Feature is disabled
        require(
            false,
            "Feature not supported"
        );

        require(
            lpAddresses.length == allowedToDeposit.length,
            "Invalid arrays"
        );

        for (uint256 i = 0; i < lpAddresses.length; i++) {
            collateralDepositLimits[lpAddresses[i]]
                .allowedToDeposit = allowedToDeposit[i];
            emit DepositAllowedUpdated(lpAddresses[i], allowedToDeposit[i]);
        }
    }

    /** The owner can set the volatility factor used to price the options */
    function setVolatilityFactor(uint256 _volatilityFactor) public onlyOwner {
        // Check lower bounds: 500e10 corresponds to ~7% annualized volatility
        require(_volatilityFactor > 500e10, "VolatilityFactor is too low");

        volatilityFactor = _volatilityFactor;
        emit VolatilityFactorUpdated(_volatilityFactor);
    }

    /**
     * The owner can update the contract logic address in the proxy itself to upgrade
     */
    function updateAmmImplementation(address newAmmImplementation)
        public
        onlyOwner
    {
        require(newAmmImplementation != address(0x0), "Invalid newAmmImplementation");

        // Call the proxiable update
        _updateCodeAddress(newAmmImplementation);
    }

    /**
     * Ensure the value in the AMM is not over the limit.  Revert if so.
     */
    function enforceDepositLimit() internal view {
        // If deposit limits are enabled, track and limit
        if (enforceDepositLimits) {
            // Do not allow open markets over the TVL
            require(
                getTotalPoolValue(false) <= globalDepositLimit,
                "Pool over deposit limit"
            );
        }
    }

    /**
     * LP allows collateral to be used to mint new options
     * bTokens and wTokens will be held in this contract and can be traded back and forth.
     * The amount of lpTokens is calculated based on total pool value
     */
    function provideCapital(uint256 collateralAmount, uint256 lpTokenMinimum)
        public
    {
        // Move collateral into this contract
        collateralToken.safeTransferFrom(
            msg.sender,
            address(this),
            collateralAmount
        );

        // If first LP, mint options, mint LP tokens, and send back any redemption amount
        if (lpToken.totalSupply() == 0) {
            
            // Ensure deposit limit is enforced
            enforceDepositLimit();
            
            // Mint lp tokens to the user
            lpToken.mint(msg.sender, collateralAmount);

            // Emit event
            LpTokensMinted(msg.sender, collateralAmount, collateralAmount);

            // Bail out after initial tokens are minted - nothing else to do
            return;
        }

        // At any given moment the AMM can have the following reserves:
        // * collateral token
        // * active bTokens and wTokens for any market
        // * expired bTokens and wTokens for any market
        // * Payment token
        // In order to calculate correct LP amount we do the following:
        // 1. Claim expired wTokens
        // 2. Add value of all active bTokens and wTokens at current prices
        // 3. Add value of any payment token
        // 4. Add value of collateral

        claimAllExpiredTokens();

        // Ensure deposit limit is enforced
        enforceDepositLimit();

        // Mint LP tokens - the percentage added to bTokens should be same as lp tokens added
        uint256 lpTokenExistingSupply = lpToken.totalSupply();
        uint256 poolValue = getTotalPoolValue(false);
        uint256 lpTokensNewSupply = (poolValue).mul(lpTokenExistingSupply).div(
            poolValue.sub(collateralAmount)
        );
        uint256 lpTokensToMint = lpTokensNewSupply.sub(lpTokenExistingSupply);
        require(
            lpTokensToMint >= lpTokenMinimum,
            "provideCapital: Slippage exceeded"
        );
        lpToken.mint(msg.sender, lpTokensToMint);

        // Emit event
        emit LpTokensMinted(
            msg.sender,
            collateralAmount,
            lpTokensToMint
        );
    }

    /**
     * LP can redeem their LP tokens in exchange for collateral
     * If `sellTokens` is true pro-rata active b/wTokens will be sold to the pool in exchange for collateral
     * All expired wTokens will be claimed
     * LP will get pro-rata collateral and payment assets
     * We return collateralTokenSent in order to give user ability to calculate the slippage via a call
     */
    function withdrawCapital(
        uint256 lpTokenAmount,
        bool sellTokens,
        uint256 collateralMinimum
    ) public {
        require(
            !sellTokens || collateralMinimum > 0,
            "withdrawCapital: collateralMinimum must be set"
        );
        // First get starting numbers
        uint256 redeemerCollateralBalance = collateralToken.balanceOf(
            msg.sender
        );
        uint256 redeemerPaymentBalance = paymentToken.balanceOf(msg.sender);

        // Get the lpToken supply
        uint256 lpTokenSupply = lpToken.totalSupply();

        // Burn the lp tokens
        lpToken.burn(msg.sender, lpTokenAmount);

        // Claim all expired wTokens
        claimAllExpiredTokens();

        // Send paymentTokens
        uint256 paymentTokenBalance = paymentToken.balanceOf(address(this));
        paymentToken.transfer(
            msg.sender,
            paymentTokenBalance.mul(lpTokenAmount).div(lpTokenSupply)
        );

        uint256 collateralTokenBalance = collateralToken.balanceOf(
            address(this)
        );

        // Withdraw pro-rata collateral and payment tokens
        // We withdraw this collateral here instead of at the end,
        // because when we sell the residual tokens to the pool we want
        // to exclude the withdrawn collateral
        uint256 collateralLeft = collateralTokenBalance.sub(
            collateralTokenBalance.mul(lpTokenAmount).div(lpTokenSupply)
        );

        // Sell pro-rata active tokens or withdraw if no collateral left
        collateralLeft = _sellOrWithdrawActiveTokens(
            lpTokenAmount,
            lpTokenSupply,
            msg.sender,
            sellTokens,
            collateralLeft
        );

        // Send all accumulated collateralTokens
        collateralToken.transfer(
            msg.sender,
            collateralTokenBalance.sub(collateralLeft)
        );

        uint256 collateralTokenSent = collateralToken.balanceOf(msg.sender).sub(
            redeemerCollateralBalance
        );

        require(
            !sellTokens || collateralTokenSent >= collateralMinimum,
            "withdrawCapital: Slippage exceeded"
        );

        // Emit the event
        emit LpTokensBurned(
            msg.sender,
            collateralTokenSent,
            paymentToken.balanceOf(msg.sender).sub(redeemerPaymentBalance),
            lpTokenAmount
        );
    }

    /**
     * Takes any wTokens from expired Markets the AMM may have and converts
     * them into collateral token which gets added to its liquidity pool
     */
    function claimAllExpiredTokens() public {
        address[] memory markets = getMarkets();
        for (uint256 i = 0; i < markets.length; i++) {
            IMarket optionMarket = IMarket(markets[i]);
            if (optionMarket.state() == IMarket.MarketState.EXPIRED) {
                uint256 wTokenBalance = optionMarket.wToken().balanceOf(
                    address(this)
                );
                if (wTokenBalance > 0) {
                    claimExpiredTokens(optionMarket, wTokenBalance);
                }
            }
        }
    }

    /**
     * Claims the wToken on a single expired Market. wTokenBalance should be equal to
     * the amount of the expired Market's wToken owned by the AMM
     */
    function claimExpiredTokens(IMarket optionMarket, uint256 wTokenBalance)
        public
    {
        optionMarket.claimCollateral(wTokenBalance);
    }

    /**
     * During liquidity withdrawal we either sell pro-rata active tokens back to the pool
     * or withdraw them to LP
     */
    function _sellOrWithdrawActiveTokens(
        uint256 lpTokenAmount,
        uint256 lpTokenSupply,
        address redeemer,
        bool sellTokens,
        uint256 collateralLeft
    ) internal returns (uint256) {
        address[] memory markets = getMarkets();

        for (uint256 i = 0; i < markets.length; i++) {
            IMarket optionMarket = IMarket(markets[i]);
            if (optionMarket.state() == IMarket.MarketState.OPEN) {
                uint256 bTokenToSell = optionMarket
                    .bToken()
                    .balanceOf(address(this))
                    .mul(lpTokenAmount)
                    .div(lpTokenSupply);
                uint256 wTokenToSell = optionMarket
                    .wToken()
                    .balanceOf(address(this))
                    .mul(lpTokenAmount)
                    .div(lpTokenSupply);
                if (!sellTokens || lpTokenAmount == lpTokenSupply) {
                    // Full LP token withdrawal for the last LP in the pool
                    // or if auto-sale is disabled
                    if (bTokenToSell > 0) {
                        optionMarket.bToken().transfer(redeemer, bTokenToSell);
                    }
                    if (wTokenToSell > 0) {
                        optionMarket.wToken().transfer(redeemer, wTokenToSell);
                    }
                } else {
                    // Regular partial withdrawal
                    uint256 collateralAmountB = bTokenGetCollateralOutInternal(
                        optionMarket,
                        bTokenToSell,
                        collateralLeft
                    );

                    collateralLeft = collateralLeft.sub(collateralAmountB);
                    uint256 collateralAmountW = wTokenGetCollateralOutInternal(
                        optionMarket,
                        wTokenToSell,
                        collateralLeft
                    );
                    collateralLeft = collateralLeft.sub(collateralAmountW);
                }
            }
        }

        return collateralLeft;
    }

    /**
     * Get value of all assets in the pool.
     * Can specify whether to include the value of expired unclaimed tokens
     */
    function getTotalPoolValue(bool includeUnclaimed)
        public
        view
        returns (uint256)
    {
        address[] memory markets = getMarkets();

        uint256 collateralPrice = getCurrentCollateralPrice();
        // First, determine the value of all residual b/wTokens
        uint256 activeTokensValue = 0;
        uint256 unclaimedTokensValue = 0;
        for (uint256 i = 0; i < markets.length; i++) {
            IMarket optionMarket = IMarket(markets[i]);
            if (optionMarket.state() == IMarket.MarketState.OPEN) {
                // value all active bTokens and wTokens at current prices
                uint256 bPrice = getPriceForMarket(optionMarket);
                // wPrice = 1 - bPrice
                uint256 wPrice = uint256(1e18).sub(bPrice);
                uint256 bTokenBalance = optionMarket.bToken().balanceOf(
                    address(this)
                );
                uint256 wTokenBalance = optionMarket.wToken().balanceOf(
                    address(this)
                );

                activeTokensValue = activeTokensValue.add(
                    bTokenBalance
                        .mul(bPrice)
                        .add(wTokenBalance.mul(wPrice))
                        .div(1e18)
                );
            } else if (
                includeUnclaimed &&
                optionMarket.state() == IMarket.MarketState.EXPIRED
            ) {
                // Get pool wTokenBalance
                uint256 wTokenBalance = optionMarket.wToken().balanceOf(
                    address(this)
                );
                uint256 wTokenSupply = optionMarket.wToken().totalSupply();
                if (wTokenBalance == 0 || wTokenSupply == 0) continue;

                // Get collateral token locked in the market
                uint256 unclaimedCollateral = collateralToken
                    .balanceOf(address(optionMarket))
                    .mul(wTokenBalance)
                    .div(wTokenSupply);

                // Get value of payment token locked in the market
                uint256 unclaimedPayment = paymentToken
                    .balanceOf(address(optionMarket))
                    .mul(wTokenBalance)
                    .div(wTokenSupply)
                    .mul(1e18)
                    .div(collateralPrice);

                unclaimedTokensValue = unclaimedTokensValue
                    .add(unclaimedCollateral)
                    .add(unclaimedPayment);
            }
        }

        // value any payment token
        uint256 paymentTokenValue = paymentToken
            .balanceOf(address(this))
            .mul(1e18)
            .div(collateralPrice);

        // Add collateral value
        uint256 collateralBalance = collateralToken.balanceOf(address(this));

        return
            activeTokensValue
                .add(unclaimedTokensValue)
                .add(paymentTokenValue)
                .add(collateralBalance);
    }

    /**
     * Get unclaimed collateral and payment tokens locked in expired wTokens
     */
    function getUnclaimedBalances() public view returns (uint256, uint256) {
        address[] memory markets = getMarkets();

        uint256 unclaimedCollateral = 0;
        uint256 unclaimedPayment = 0;

        for (uint256 i = 0; i < markets.length; i++) {
            IMarket optionMarket = IMarket(markets[i]);
            if (optionMarket.state() == IMarket.MarketState.EXPIRED) {
                // Get pool wTokenBalance
                uint256 wTokenBalance = optionMarket.wToken().balanceOf(
                    address(this)
                );
                uint256 wTokenSupply = optionMarket.wToken().totalSupply();
                if (wTokenBalance == 0 || wTokenSupply == 0) continue;

                // Get collateral token locked in the market
                unclaimedCollateral = unclaimedCollateral.add(
                    collateralToken
                    .balanceOf(address(optionMarket))
                    .mul(wTokenBalance)
                    .div(wTokenSupply));

                // Get payment token locked in the market
                unclaimedPayment = unclaimedPayment.add(
                    paymentToken
                    .balanceOf(address(optionMarket))
                    .mul(wTokenBalance)
                    .div(wTokenSupply));
            }
        }

        return (unclaimedCollateral, unclaimedPayment);
    }

    /**
     * Calculate sale value of pro-rata LP b/wTokens
     */
    function getTokensSaleValue(uint256 lpTokenAmount) public view returns (uint256) {
        if (lpTokenAmount == 0) return 0;

        uint256 lpTokenSupply = lpToken.totalSupply();
        if (lpTokenSupply == 0) return 0;

        address[] memory markets = getMarkets();

        (uint256 unclaimedCollateral, ) = getUnclaimedBalances();
        // Calculate amount of collateral left in the pool to sell tokens to
        uint256 totalCollateral = unclaimedCollateral.add(collateralToken.balanceOf(address(this)));

        // Subtract pro-rata collateral amount to be withdrawn
        totalCollateral = totalCollateral.mul(lpTokenSupply.sub(lpTokenAmount)).div(lpTokenSupply);

        // Given remaining collateral calculate how much all tokens can be sold for
        uint256 collateralLeft = totalCollateral;
        for (uint256 i = 0; i < markets.length; i++) {
            IMarket optionMarket = IMarket(markets[i]);
            if (optionMarket.state() == IMarket.MarketState.OPEN) {
                uint256 bTokenToSell = optionMarket
                    .bToken()
                    .balanceOf(address(this))
                    .mul(lpTokenAmount)
                    .div(lpTokenSupply);
                uint256 wTokenToSell = optionMarket
                    .wToken()
                    .balanceOf(address(this))
                    .mul(lpTokenAmount)
                    .div(lpTokenSupply);

                uint256 collateralAmountB = bTokenGetCollateralOutInternal(
                    optionMarket,
                    bTokenToSell,
                    collateralLeft
                );

                collateralLeft = collateralLeft.sub(collateralAmountB);
                uint256 collateralAmountW = wTokenGetCollateralOutInternal(
                    optionMarket,
                    wTokenToSell,
                    collateralLeft
                );
                collateralLeft = collateralLeft.sub(collateralAmountW);
            }
        }

        return totalCollateral.sub(collateralLeft);
    }

    /**
     * List of market addresses that this AMM trades
     */
    function getMarkets() public view returns (address[] memory) {
        return registry.getMarketsByAssetPair(assetPair);
    }

    /**
     * Get market address by index
     */
    function getMarket(uint256 marketIndex) public view returns (IMarket) {
        return IMarket(getMarkets()[marketIndex]);
    }

    struct LocalVars {
        uint256 bTokenBalance;
        uint256 wTokenBalance;
        uint256 toSquare;
        uint256 collateralAmount;
        uint256 collateralAfterFee;
        uint256 bTokenAmount;
    }

    /**
     * This function determines reserves of a bonding curve for a specific market.
     * Given price of bToken we determine what is the largest pool we can create such that
     * the ratio of its reserves satisfy the given bToken price: Rb / Rw = (1 - Pb) / Pb
     */
    function getVirtualReserves(IMarket market)
        public
        view
        returns (uint256, uint256)
    {
        return
            getVirtualReservesInternal(
                market,
                collateralToken.balanceOf(address(this))
            );
    }

    function getVirtualReservesInternal(
        IMarket market,
        uint256 collateralTokenBalance
    ) internal view returns (uint256, uint256) {
        // Max amount of tokens we can get by adding current balance plus what can be minted from collateral
        uint256 bTokenBalanceMax = market.bToken().balanceOf(address(this)).add(
            collateralTokenBalance
        );
        uint256 wTokenBalanceMax = market.wToken().balanceOf(address(this)).add(
            collateralTokenBalance
        );

        uint256 bTokenPrice = getPriceForMarket(market);
        uint256 wTokenPrice = uint256(1e18).sub(bTokenPrice);

        // Balance on higher reserve side is the sum of what can be minted (collateralTokenBalance)
        // plus existing balance of the token
        uint256 bTokenVirtualBalance;
        uint256 wTokenVirtualBalance;

        if (bTokenPrice <= wTokenPrice) {
            // Rb >= Rw, Pb <= Pw
            bTokenVirtualBalance = bTokenBalanceMax;
            wTokenVirtualBalance = bTokenVirtualBalance.mul(bTokenPrice).div(
                wTokenPrice
            );

            // Sanity check that we don't exceed actual physical balances
            // In case this happens, adjust virtual balances to not exceed maximum
            // available reserves while still preserving correct price
            if (wTokenVirtualBalance > wTokenBalanceMax) {
                wTokenVirtualBalance = wTokenBalanceMax;
                bTokenVirtualBalance = wTokenVirtualBalance
                    .mul(wTokenPrice)
                    .div(bTokenPrice);
            }
        } else {
            // if Rb < Rw, Pb > Pw
            wTokenVirtualBalance = wTokenBalanceMax;
            bTokenVirtualBalance = wTokenVirtualBalance.mul(wTokenPrice).div(
                bTokenPrice
            );

            // Sanity check
            if (bTokenVirtualBalance > bTokenBalanceMax) {
                bTokenVirtualBalance = bTokenBalanceMax;
                wTokenVirtualBalance = bTokenVirtualBalance
                    .mul(bTokenPrice)
                    .div(wTokenPrice);
            }
        }

        return (bTokenVirtualBalance, wTokenVirtualBalance);
    }

    /**
     * Get current collateral price expressed in payment token
     */
    function getCurrentCollateralPrice() public view returns (uint256) {
        // TODO: Cache the Oracle price within transaction
        (, int256 latestAnswer, , , ) = priceOracle.latestRoundData();

        require(latestAnswer >= 0, "invalid value received from price oracle");

        if (shouldInvertOraclePrice) {
            return
                paymentAndCollateralConversionFactor.div(uint256(latestAnswer));
        } else {
            return
                uint256(latestAnswer).mul(paymentAndCollateralConversionFactor);
        }
    }

    /**
     * @dev Get price of bToken for a given market
     */
    function getPriceForMarket(IMarket market) public view returns (uint256) {
        return
            calcPrice(
                market.expirationDate().sub(now),
                market.priceRatio(),
                getCurrentCollateralPrice(),
                volatilityFactor
            );
    }

    /**
     * @dev Calculate price of bToken based on Black-Scholes approximation.
     * Formula: 0.4 * ImplVol * sqrt(timeUntilExpiry) * currentPrice / strike
     */
    function calcPrice(
        uint256 timeUntilExpiry,
        uint256 strike,
        uint256 currentPrice,
        uint256 volatility
    ) public pure returns (uint256) {
        uint256 intrinsic = 0;
        if (currentPrice > strike) {
            intrinsic = currentPrice.sub(strike).mul(1e18).div(currentPrice);
        }

        uint256 timeValue = Math
            .sqrt(timeUntilExpiry)
            .mul(volatility)
            .mul(currentPrice)
            .div(strike);

        return intrinsic.add(timeValue);
    }

    /**
     * @dev Buy bToken of a given market.
     * We supply market index instead of market address to ensure that only supported markets can be traded using this AMM
     * collateralMaximum is used for slippage protection
     */
    function bTokenBuy(
        uint256 marketIndex,
        uint256 bTokenAmount,
        uint256 collateralMaximum
    ) public minTradeSize(bTokenAmount) returns (uint256) {
        IMarket optionMarket = getMarket(marketIndex);
        require(
            optionMarket.state() == IMarket.MarketState.OPEN,
            "bTokenBuy must be open"
        );

        uint256 collateralAmount = bTokenGetCollateralIn(
            optionMarket,
            bTokenAmount
        );
        require(
            collateralAmount <= collateralMaximum,
            "bTokenBuy: slippage exceeded"
        );

        // Move collateral into this contract
        collateralToken.safeTransferFrom(
            msg.sender,
            address(this),
            collateralAmount
        );

        // Mint new options only as needed
        ISimpleToken bToken = optionMarket.bToken();
        uint256 bTokenBalance = bToken.balanceOf(address(this));
        if (bTokenBalance < bTokenAmount) {
            // Approve the collateral to mint bTokenAmount of new options
            collateralToken.approve(address(optionMarket), bTokenAmount);
            optionMarket.mintOptions(bTokenAmount.sub(bTokenBalance));
        }

        // Send all bTokens back
        bToken.transfer(msg.sender, bTokenAmount);

        // Emit the event
        emit BTokensBought(msg.sender, bTokenAmount, collateralAmount);

        // Return the amount of collateral required to buy
        return collateralAmount;
    }

    /**
     * @dev Sell bToken of a given market.
     * We supply market index instead of market address to ensure that only supported markets can be traded using this AMM
     * collateralMaximum is used for slippage protection
     */
    function bTokenSell(
        uint256 marketIndex,
        uint256 bTokenAmount,
        uint256 collateralMinimum
    ) public minTradeSize(bTokenAmount) returns (uint256) {
        IMarket optionMarket = getMarket(marketIndex);
        require(
            optionMarket.state() == IMarket.MarketState.OPEN,
            "bTokenSell must be open"
        );

        // Get initial stats
        bTokenAmount = bTokenAmount;

        uint256 collateralAmount = bTokenGetCollateralOut(
            optionMarket,
            bTokenAmount
        );
        require(
            collateralAmount >= collateralMinimum,
            "bTokenSell: slippage exceeded"
        );

        // Move bToken into this contract
        optionMarket.bToken().safeTransferFrom(
            msg.sender,
            address(this),
            bTokenAmount
        );

        // Always be closing!
        uint256 bTokenBalance = optionMarket.bToken().balanceOf(address(this));
        uint256 wTokenBalance = optionMarket.wToken().balanceOf(address(this));
        uint256 closeAmount = Math.min(bTokenBalance, wTokenBalance);
        if (closeAmount > 0) {
            optionMarket.closePosition(closeAmount);
        }

        // Send the tokens to the seller
        collateralToken.transfer(msg.sender, collateralAmount);

        // Emit the event
        emit BTokensSold(msg.sender, bTokenAmount, collateralAmount);

        // Return the amount of collateral received during sale
        return collateralAmount;
    }

    /**
     * @dev Calculate amount of collateral required to buy bTokens
     */
    function bTokenGetCollateralIn(IMarket market, uint256 bTokenAmount)
        public
        view
        returns (uint256)
    {
        // Shortcut for 0 amount
        if (bTokenAmount == 0) return 0;

        LocalVars memory vars; // Holds all our calculation results

        // Get initial stats
        vars.bTokenAmount = bTokenAmount;
        (vars.bTokenBalance, vars.wTokenBalance) = getVirtualReserves(market);

        uint256 sumBalance = vars.bTokenBalance.add(vars.wTokenBalance);
        if (sumBalance > vars.bTokenAmount) {
            vars.toSquare = sumBalance.sub(vars.bTokenAmount);
        } else {
            vars.toSquare = vars.bTokenAmount.sub(sumBalance);
        }
        vars.collateralAmount = Math
            .sqrt(
            vars.toSquare.mul(vars.toSquare).add(
                vars.bTokenAmount.mul(vars.wTokenBalance).mul(4)
            )
        )
            .add(vars.bTokenAmount)
            .sub(vars.bTokenBalance)
            .sub(vars.wTokenBalance)
            .div(2);

        return vars.collateralAmount;
    }

    /**
     * @dev Calculate amount of collateral in exchange for selling bTokens
     */
    function bTokenGetCollateralOut(IMarket market, uint256 bTokenAmount)
        public
        view
        returns (uint256)
    {
        return
            bTokenGetCollateralOutInternal(
                market,
                bTokenAmount,
                collateralToken.balanceOf(address(this))
            );
    }

    function bTokenGetCollateralOutInternal(
        IMarket market,
        uint256 bTokenAmount,
        uint256 _collateralTokenBalance
    ) internal view returns (uint256) {
        // Shortcut for 0 amount
        if (bTokenAmount == 0) return 0;

        (
            uint256 bTokenBalance,
            uint256 wTokenBalance
        ) = getVirtualReservesInternal(market, _collateralTokenBalance);

        uint256 toSquare = bTokenAmount.add(bTokenBalance).add(wTokenBalance);

        uint256 collateralAmount = toSquare
            .sub(
            Math.sqrt(
                toSquare.mul(toSquare).sub(
                    bTokenAmount.mul(wTokenBalance).mul(4)
                )
            )
        )
            .div(2);

        return collateralAmount;
    }

    /**
     * @dev Calculate amount of collateral in exchange for selling wTokens
     * This method is used internally when withdrawing liquidity with `sellTokens` set to true
     */
    function wTokenGetCollateralOutInternal(
        IMarket market,
        uint256 wTokenAmount,
        uint256 _collateralTokenBalance
    ) internal view returns (uint256) {
        // Shortcut for 0 amount
        if (wTokenAmount == 0) return 0;

        (
            uint256 bTokenBalance,
            uint256 wTokenBalance
        ) = getVirtualReservesInternal(market, _collateralTokenBalance);

        uint256 toSquare = wTokenAmount.add(wTokenBalance).add(bTokenBalance);
        uint256 collateralAmount = toSquare
            .sub(
            Math.sqrt(
                toSquare.mul(toSquare).sub(
                    wTokenAmount.mul(bTokenBalance).mul(4)
                )
            )
        )
            .div(2);

        return collateralAmount;
    }
}
