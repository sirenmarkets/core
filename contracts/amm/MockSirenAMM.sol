pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "./ISirenTradeAMM.sol";

/**
 * An extremely simple automated market maker contract which implements the same
 * interface as the true SirenAMM, but has none of its complexities.
 *
 * Motivation: Until the true SirenAMM is designed and completed, the webapp will use this
 * MockSirenAMM to simulate buying and selling option market bTokens on
 * testnet. If we didn't use this MockSirenAMM, progress on a testable POC webapp
 * would be blocked for weeks while we wait for the SirenAMM to be completed. Read
 * on for the simple mechanics of the MockSirenAMM.
 *
 * The lifecycle of MockSirenAMM is simple:
 * - Create an options market contract, which will allow for the minting of that option's bTokens,
     and the option market contract will specify a collateralToken
   - Mint some bTokens (and wTokens, but the AMM doesn't care about wTokens)
 * - Deploy the MockSirenAMM contract to the test network, there will be 1 MockSirenAMM for every
     options market contract
 * - Fund MockSirenAMM with bTokens and collateral tokens
 * - Now the webapp can expose the MockSirenAMM.buy and MockSirenAMM.sell functions to its users. See the
     definitions of those 2 functions for what must be done in order to succesffully call .buy/.sell
 */
contract MockSirenAMM is ISirenTradeAMM {
    /** Use safe ERC20 functions for any token transfers since people don't follow the ERC20 standard */
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    IERC20 public bToken;
    IERC20 public collateralToken;

    /** The difference between the payment token's decimals and the collateral token's decimals, normalized
     * to 10 ** 18
     *
     * Example: bToken = WBTC (8 decimals), collateralToken = USDC (6 decimals):
     * decimalRatio = 10 ** (18 + (6 - 8)) = 10 ** 16
     *
     * Now when selling 2000 WBTC base units, the seller should receive 2000 * (10 ** 16) / (10 ** 18) = 20
     */
    uint256 public decimalRatio;

    constructor(address _bToken, address _collateralToken) public {
        bToken = IERC20(_bToken);
        collateralToken = IERC20(_collateralToken);

        uint8 collateralTokenDecimals = ERC20UpgradeSafe(
            address(collateralToken)
        )
            .decimals();
        uint8 bTokenDecimals = ERC20UpgradeSafe(address(bToken)).decimals();
        uint8 decimalPower = uint8(
            int8(collateralTokenDecimals) - int8(bTokenDecimals)
        );
        decimalRatio = uint256(10)**(18 + decimalPower);
    }

    /** In order to make market making simple, we hardcode the price of bTokens
     * in units of collateralToken. If a trade wants to sell *amount* of bTokens, then they will receive
     * `amount / PRICE_OF_BTOKENS_IN_COLLATERAL_TOKEN_UNITS` bTokens. And if they want
     * to buy *amount* of bTokens, they need to give
     * `amount * PRICE_OF_BTOKENS_IN_COLLATERAL_TOKEN_UNITS` collateral tokens in exchange for the
     * bTokens.
     */
    uint256 public constant PRICE_OF_BTOKENS_IN_COLLATERAL_TOKEN_UNITS = 10;

    /**
     * Sell bTokens for collateralTokens. The caller specifies the amount of collateralTokens
     * they want to receive, and the AMM calculates and transfers the equivalent amount
     * of bTokens from the caller to the AMM.
     *
     * In order for this function call to succeed the caller much have called
     * bToken.approve(MockSirenAMM_address, collateralAmount) prior to MockSirenAMM.sell.
     *
     * Note: If this is called too many times without replenishing the MockSirenAMM's
     * store of *collateralToken*, then there won't be enough payment tokens to give to
     * the msg.sender will fail until the MockSirenAMM's store of *collateralToken*'s
     * are replenished.
     */
    function bTokenSell(uint256 collateralAmount) public override {
        // first get the caller's bTokens
        uint256 bTokenAmount = getTokenAmount(collateralAmount);
        bToken.safeTransferFrom(msg.sender, address(this), bTokenAmount);

        // and now pay them their collateralTokens
        collateralToken.safeTransferFrom(
            address(this),
            msg.sender,
            collateralAmount
        );
    }

    /**
     * Buy bTokens using collateralToken. The caller specifies the amount of collateralTokens
     * they want to send, and the AMM calculates and transfers the equivalent amount
     * of collateralTokens from the caller to the AMM, and then gives the user bTokens.
     *
     * In order for this function call to succeed the caller much have called
     * tokenToSell.approve(MockSirenAMM_address, amount) prior to MockSirenAMM.sell.
     *
     * Note: If this is called too many times without replenishing the MockSirenAMM's
     * store of *bToken*, then there won't be enough  bTokens to give to
     * the msg.sender will fail until the MockSirenAMM's store of *bToken*'s
     * are replenished.
     */
    function bTokenBuy(uint256 collateralAmount) public override {
        // first get the caller's funds
        collateralToken.safeTransferFrom(
            msg.sender,
            address(this),
            collateralAmount
        );

        // now send the caller their bToken
        uint256 bTokenAmount = getTokenAmount(collateralAmount);
        bToken.safeTransferFrom(address(this), msg.sender, bTokenAmount);
    }

    // Note: we only declare the wToken functions so we can adhere to the
    // ISirenTradeAMM interface. In order to keep the MockSirenAMM simple we take
    // shortcuts and only actually implement the bToken functions
    function wTokenBuy(uint256 collateralAmount) public override {}

    function wTokenSell(uint256 collateralAmount) public override {}

    /**
     * Calculates the number of bTokens one would receive when buying
     * them with the given amount of payment tokens
     */
    function getTokenAmount(uint256 amount) public view returns (uint256) {
        return
            amount
                .mul(decimalRatio)
                .div(PRICE_OF_BTOKENS_IN_COLLATERAL_TOKEN_UNITS)
                .div(10**18);
    }
}
