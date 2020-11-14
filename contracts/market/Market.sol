pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "./IMarket.sol";
import "../proxy/Proxy.sol";
import "../proxy/Proxiable.sol";
import "../token/ISimpleToken.sol";

/**
 * A market is an instance of an options contract market.
 * A single market represents a specific option definition with a token pair, expiration, and strike price.
 * A market has 2 states:
 * 0) OPEN - The options contract is open and new option tokens can be minted.  Holders of bTokens can exercise the tokens for collateral with payment.
 * 1) EXPIRED - The options contract cannot mint any new options.  bTokens cannot be exercised.  wTokens can redeem collateral and any payments.
 * All parameters must be set by the Initialize function before the option market is live.
 *
 * This contract is ownable.  By default, the address that deployed it will be the owner.
 */
contract Market is IMarket, OwnableUpgradeSafe, Proxiable {
    /** Use safe ERC20 functions for any token transfers since people don't follow the ERC20 standard */
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    /** @dev the display name of the market - should be in the form of payment.collateral.expire.option_type.strike */
    string public override marketName;
    /** @dev the collateral token that must be locked up in this contract until expiry or redemption */
    IERC20 public override collateralToken;
    /** @dev the token paid to exercise an option */
    IERC20 public paymentToken;
    /** @dev the manner in which the options are redeemed */
    MarketStyle public marketStyle;

    /**
     * @dev the price ratio for base units of the payment token to the collateral token
     * Instead of storing the strike price, this allows easy partial redemption calcs
     * The ratio will be denomitated in 10**18 == 1 -> this allows a ratio below and above 1
     * E.g. A strike price of 2000 would be "2000 * 10**18"... a strike price of 0.5 would be "5 * 10**17" (assuming equal token decimals)
     */
    uint256 public override priceRatio;
    /** @dev the date where the option expires (seconds since epoch) */
    uint256 public override expirationDate;

    /** @dev the fee deducted when options are exercised */
    uint16 public exerciseFeeBasisPoints;
    /** @dev the fee deducted when options are closed */
    uint16 public closeFeeBasisPoints;
    /** @dev the fee deducted when options are claimed */
    uint16 public claimFeeBasisPoints;

    /** The token that represents collateral ownership */
    ISimpleToken public override wToken;
    /** The token that represents the redemption ownership */
    ISimpleToken public override bToken;

    /** If the restrictedMinter address is set, lock down minting to only that address */
    address public restrictedMinter;

    /** Enum to track Fee Events */
    enum FeeType {EXERCISE_FEE, CLOSE_FEE, CLAIM_FEE}

    /** Emitted when the market is created */
    event MarketInitialized(
        string marketName,
        MarketStyle marketStyle,
        address wToken,
        address bToken
    );

    /** Emitted when a new option contract is minted */
    event OptionMinted(address indexed minter, uint256 value);

    /** Emitted when a bToken is exercised for collateral */
    event OptionExercised(address indexed redeemer, uint256 value);

    /** Emitted when a wToken is redeemed after expiration */
    event CollateralClaimed(address indexed redeemer, uint256 value);

    /** Emitted when an equal amount of wToken and bToken is redeemed for original collateral */
    event OptionClosed(address indexed redeemer, uint256 value);

    /** Emitted when a fee is paid to the owner account */
    event FeePaid(
        FeeType indexed feeType,
        address indexed token,
        uint256 value
    );

    /** Emitted when tokens are recovered */
    event TokensRecovered(
        address indexed token,
        address indexed to,
        uint256 value
    );

    /** Emitted when contract is destroyed */
    event MarketDestroyed();

    event RestrictedMinterUpdated(address newRestrictedMinter);

    /**
     * Called to set this contract up
     * Creation and initialization should be called in a single transaction.
     */
    function initialize(
        string calldata _marketName,
        address _collateralToken,
        address _paymentToken,
        MarketStyle _marketStyle,
        uint256 _priceRatio,
        uint256 _expirationDate,
        uint16 _exerciseFeeBasisPoints,
        uint16 _closeFeeBasisPoints,
        uint16 _claimFeeBasisPoints,
        address _tokenImplementation
    ) public override {
        __Market_init(
            _marketName,
            _collateralToken,
            _paymentToken,
            _marketStyle,
            _priceRatio,
            _expirationDate,
            _exerciseFeeBasisPoints,
            _closeFeeBasisPoints,
            _claimFeeBasisPoints,
            _tokenImplementation
        );
    }

    /**
     * @dev data structures for local computations in the __Market_init() method.
     */
    struct MarketInitLocalVars {
        uint8 decimals;
        Proxy wTokenProxy;
        string wTokenName;
        Proxy bTokenProxy;
        string bTokenName;
    }

    /**
     * Initialization function that only allows itself to be called once
     */
    function __Market_init(
        string calldata _marketName,
        address _collateralToken,
        address _paymentToken,
        MarketStyle _marketStyle,
        uint256 _priceRatio,
        uint256 _expirationDate,
        uint16 _exerciseFeeBasisPoints,
        uint16 _closeFeeBasisPoints,
        uint16 _claimFeeBasisPoints,
        address _tokenImplementation
    ) internal initializer {
        require(_collateralToken != address(0x0), "Invalid _collateralToken");
        require(_paymentToken != address(0x0), "Invalid _paymentToken");
        require(_tokenImplementation != address(0x0), "Invalid _tokenImplementation");

        // Usage of a memory struct of vars to avoid "Stack too deep" errors due to
        // too many local variables
        MarketInitLocalVars memory localVars;

        // Save off variables
        marketName = _marketName;

        // Tokens
        collateralToken = IERC20(_collateralToken);
        paymentToken = IERC20(_paymentToken);

        // Market Style
        marketStyle = _marketStyle;

        // Price and expiration
        priceRatio = _priceRatio;
        expirationDate = _expirationDate;

        // Fees
        exerciseFeeBasisPoints = _exerciseFeeBasisPoints;
        closeFeeBasisPoints = _closeFeeBasisPoints;
        claimFeeBasisPoints = _claimFeeBasisPoints;

        // wToken and bToken will be denominated in same decimals as collateral
        localVars.decimals = ERC20UpgradeSafe(address(collateralToken))
            .decimals();

        // Initialize the W token
        localVars.wTokenProxy = new Proxy(_tokenImplementation);
        wToken = ISimpleToken(address(localVars.wTokenProxy));
        localVars.wTokenName = string(abi.encodePacked("W-", _marketName));
        wToken.initialize(
            localVars.wTokenName,
            localVars.wTokenName,
            localVars.decimals
        );

        // Initialize the B token
        localVars.bTokenProxy = new Proxy(_tokenImplementation);
        bToken = ISimpleToken(address(localVars.bTokenProxy));
        localVars.bTokenName = string(abi.encodePacked("B-", _marketName));
        bToken.initialize(
            localVars.bTokenName,
            localVars.bTokenName,
            localVars.decimals
        );

        // Set up the initialization of the inherited ownable contract
        __Ownable_init();

        // Emit the event
        emit MarketInitialized(
            marketName,
            marketStyle,
            address(wToken),
            address(bToken)
        );
    }

    /** Getter for the current state of the market (open, expired, or closed) */
    function state() public override view returns (MarketState) {
        // Before the expiration
        if (now < expirationDate) {
            return MarketState.OPEN;
        }

        // After expiration but not 180 days have passed
        if (now < expirationDate.add(180 days)) {
            return MarketState.EXPIRED;
        }

        // Contract can be cleaned up
        return MarketState.CLOSED;
    }

    /**
     * Mint new option contract
     * The collateral amount must already be approved by the caller to transfer into this contract
     * The caller will lock up collateral and get an equal number of bTokens and wTokens
     */
    function mintOptions(uint256 collateralAmount) public override {
        require(
            state() == MarketState.OPEN,
            "Option contract must be in Open State to mint"
        );

        // Save off the calling address
        address minter = _msgSender();

        // If the restrictedMinter address is set, then only that address can mint options
        if (restrictedMinter != address(0)) {
            require(
                restrictedMinter == minter,
                "mintOptions: only restrictedMinter can mint"
            );
        }

        // Transfer the collateral into this contract from the caller - this should revert if it fails
        collateralToken.safeTransferFrom(
            minter,
            address(this),
            collateralAmount
        );

        // Mint new bTokens and wTokens to the caller
        wToken.mint(minter, collateralAmount);
        bToken.mint(minter, collateralAmount);

        // Emit the event
        emit OptionMinted(minter, collateralAmount);
    }

    /**
     * If an bToken is redeemed for X collateral, calculate the payment token amount.
     */
    function calculatePaymentAmount(uint256 collateralAmount)
        public
        override
        view
        returns (uint256)
    {
        return collateralAmount.mul(priceRatio).div(10**18);
    }

    /**
     * A Basis Point is 1 / 100 of a percent. e.g. 10 basis points (e.g. 0.1%) on 5000 is 5000 * 0.001 => 5
     */
    function calculateFee(uint256 amount, uint16 basisPoints)
        public
        override
        pure
        returns (uint256)
    {
        return amount.mul(basisPoints).div(10000);
    }

    /**
     * Redeem an bToken for collateral.
     * Can be done only while option contract is open
     * bToken amount must be approved before calling
     * Payment token amount must be approved before calling
     */
    function exerciseOption(uint256 collateralAmount) public override {
        require(
            state() == MarketState.OPEN,
            "Option contract must be in Open State to exercise"
        );
        if (marketStyle == IMarket.MarketStyle.EUROPEAN_STYLE) {
            // hardcode the date after which European-style options can
            // be exercised to be 1 day prior to expiration
            require(
                now >= expirationDate - 1 days,
                "Option contract cannot yet be exercised"
            );
        }

        // Save off the caller
        address redeemer = _msgSender();

        // Burn the bToken amount from the callers account - this will be the same amount as the collateral that is requested
        bToken.burn(redeemer, collateralAmount);

        // Move the payment amount from the caller into this contract's address
        uint256 paymentAmount = calculatePaymentAmount(collateralAmount);
        paymentToken.safeTransferFrom(redeemer, address(this), paymentAmount);

        // Calculate the redeem Fee and move it if it is valid
        uint256 feeAmount = calculateFee(
            collateralAmount,
            exerciseFeeBasisPoints
        );
        if (feeAmount > 0) {
            // First set the collateral amount that will be left over to send out
            collateralAmount = collateralAmount.sub(feeAmount);

            // Send the fee Amount to the owner
            collateralToken.safeTransfer(owner(), feeAmount);

            // Emit the fee event
            emit FeePaid(
                FeeType.EXERCISE_FEE,
                address(collateralToken),
                feeAmount
            );
        }

        // Send the collateral to the caller's address
        collateralToken.safeTransfer(redeemer, collateralAmount);

        // Emit the Redeem Event
        emit OptionExercised(redeemer, collateralAmount);
    }

    /**
     * Redeem the wToken for collateral and payment tokens
     * Can only be done after contract has expired
     */
    function claimCollateral(uint256 collateralAmount) public override {
        require(
            state() == MarketState.EXPIRED,
            "Option contract must be in EXPIRED State to claim collateral"
        );

        // Save off the caller
        address redeemer = _msgSender();

        // Save off the total supply of collateral tokens
        uint256 wTokenSupply = wToken.totalSupply();

        // Burn the collateral token for the amount they are claiming
        wToken.burn(redeemer, collateralAmount);

        // Get the total collateral in this contract
        uint256 totalCollateralAmount = collateralToken.balanceOf(
            address(this)
        );

        // If there is a balance, send their share to the redeemer
        if (totalCollateralAmount > 0) {
            // Redeemer gets the percentage of all collateral in this contract based on wToken are redeeming
            uint256 owedCollateralAmount = collateralAmount.mul(totalCollateralAmount).div(wTokenSupply);

            // Calculate the claim Fee and move it if it is valid
            uint256 feeAmount = calculateFee(
                owedCollateralAmount,
                claimFeeBasisPoints
            );
            if (feeAmount > 0) {
                // First set the collateral amount that will be left over to send out
                owedCollateralAmount = owedCollateralAmount.sub(feeAmount);

                // Send the fee Amount to the owner
                collateralToken.safeTransfer(owner(), feeAmount);

                // Emit the fee event
                emit FeePaid(
                    FeeType.CLAIM_FEE,
                    address(collateralToken),
                    feeAmount
                );
            }

            // Verify the amount to send is not less than the balance due to rounding for the last user claiming funds.
            // If so, just send the remaining amount in the contract.
            uint256 currentBalance = collateralToken.balanceOf(address(this));
            if(currentBalance < owedCollateralAmount){
                owedCollateralAmount = currentBalance;
            }

            // Send the remainder to redeemer
            collateralToken.safeTransfer(redeemer, owedCollateralAmount);
        }

        // Get the total of payments in this contract
        uint256 totalPaymentAmount = paymentToken.balanceOf(address(this));

        // If there is a balance, send their share to the redeemer
        if (totalPaymentAmount > 0) {
            // Redeemer gets the percentage of all collateral in this contract based on wToken are redeeming
            uint256 owedPaymentAmount = collateralAmount.mul(totalPaymentAmount).div(wTokenSupply);

            // Calculate the claim Fee and move it if it is valid
            uint256 feeAmount = calculateFee(
                owedPaymentAmount,
                claimFeeBasisPoints
            );
            if (feeAmount > 0) {
                // First set the collateral amount that will be left over to send out
                owedPaymentAmount = owedPaymentAmount.sub(feeAmount);

                // Send the fee Amount to the owner
                paymentToken.safeTransfer(owner(), feeAmount);

                // Emit the fee event
                emit FeePaid(
                    FeeType.CLAIM_FEE,
                    address(paymentToken),
                    feeAmount
                );
            }

            // Verify the amount to send is not less than the balance due to rounding for the last user claiming funds.
            // If so, just send the remaining amount in the contract.
            uint256 currentBalance = paymentToken.balanceOf(address(this));
            if(currentBalance < owedPaymentAmount){
                owedPaymentAmount = currentBalance;
            }

            // Send the remainder to redeemer
            paymentToken.safeTransfer(redeemer, owedPaymentAmount);
        }

        // Emit event
        emit CollateralClaimed(redeemer, collateralAmount);
    }

    /**
     * Close the position and take back collateral
     * Can only be done while the contract is open
     * Caller must have an amount of both wToken and bToken that will be burned before
     * the collateral is sent back to them
     */
    function closePosition(uint256 collateralAmount) public override {
        require(
            state() == MarketState.OPEN,
            "Option contract must be in Open State to close a position"
        );

        // Save off the caller
        address redeemer = _msgSender();

        // Burn the bToken and wToken amounts
        bToken.burn(redeemer, collateralAmount);
        wToken.burn(redeemer, collateralAmount);

        // Calculate the claim Fee and move it if it is valid
        uint256 feeAmount = calculateFee(collateralAmount, closeFeeBasisPoints);
        if (feeAmount > 0) {
            // First set the collateral amount that will be left over to send out
            collateralAmount = collateralAmount.sub(feeAmount);

            // Send the fee Amount to the owner
            collateralToken.safeTransfer(owner(), feeAmount);

            // Emit the fee event
            emit FeePaid(
                FeeType.CLOSE_FEE,
                address(collateralToken),
                feeAmount
            );
        }

        // Send the collateral to the caller's address
        collateralToken.safeTransfer(redeemer, collateralAmount);

        // Emit the Closed Event
        emit OptionClosed(redeemer, collateralAmount);
    }

    /**
     * After the market is closed, anyone can trigger tokens to be swept to the owner
     */
    function recoverTokens(IERC20 token) public override {
        require(
            state() == MarketState.CLOSED,
            "ERC20s can't be recovered until the market is closed"
        );

        // Get the balance
        uint256 balance = token.balanceOf(address(this));

        // Sweep out
        token.safeTransfer(owner(), balance);

        // Emit the event
        emit TokensRecovered(address(token), owner(), balance);
    }

    /**
     * After the market is closed the owner can destroy
     */
    function selfDestructMarket(address payable refundAddress)
        public
        override
        onlyOwner
    {
        require(refundAddress != address(0x0), "Invalid refundAddress");

        require(
            state() == MarketState.CLOSED,
            "Markets can't be destroyed until it is closed"
        );

        // Sweep out any remaining collateral token
        uint256 collateralBalance = collateralToken.balanceOf(address(this));
        if(collateralBalance > 0){
            collateralToken.transfer(owner(), collateralBalance);
        }

        // Sweep out any remaining payment token
        uint256 paymentTokenBalance = paymentToken.balanceOf(address(this));
        if(paymentTokenBalance > 0){
            paymentToken.transfer(owner(), paymentTokenBalance);
        }

        // Destroy the tokens
        wToken.selfDestructToken(refundAddress);
        bToken.selfDestructToken(refundAddress);

        // Emit the event
        emit MarketDestroyed();

        // Destroy the contract and forward any ETH
        selfdestruct(refundAddress);
    }

    /**
     * Update the logic address of this Market
     */
    function updateImplementation(address newImplementation) public override {
        require(newImplementation != address(0x0), "Invalid newImplementation");

        _updateCodeAddress(newImplementation);
    }

    /**
     * The owner address can set a restricted minter address that will then prevent any
     * other addresses from minting new options.
     * This CAN be set to 0x0 to disable the restriction.
     */
    function updateRestrictedMinter(address _restrictedMinter)
        public
        override
        onlyOwner
    {
        restrictedMinter = _restrictedMinter;

        emit RestrictedMinterUpdated(restrictedMinter);
    }
}
