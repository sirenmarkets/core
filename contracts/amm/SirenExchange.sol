// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >=0.5.0 <=0.8.0;
import "../amm/ISirenTradeAMM.sol";
import "../series/SeriesLibrary.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@uniswap/lib/contracts/libraries/TransferHelper.sol";

/// This is an implementation of exchanging user tokens for collateral tokens in SirenMarkets
/// this then allows you to Buy and Sell bTokens as well as to Sell wTokens using MinterAmm.sol
///
/// For example, a sender could use WETH to trade on WBTC/USDC strikes of WBTC/USDC calls/puts using
/// WETH as the user token instead of needing to have either WETH or USDC for call and puts.
/// This allows senders to trade multiple tokens for call or put options without needing to exchange these tokens outside of siren.
///
/// This is accomplished using UniswapV2Router02 interface https://docs.uniswap.org/protocol/V2/reference/smart-contracts/router-02
/// Since SirenMarkets is deployed on polygon so the routers used are supplied by:
///                                                                               QuickSwap: https://github.com/QuickSwap/quickswap-core
///                                                                               SusiSwap: https://dev.sushi.com/sushiswap/contracts
///
/// We take the router address in as a variable so we can choose which router has a better reserve at the time of the exchange.
contract SirenExchange is ERC1155Holder {
    IERC1155 public immutable erc1155Controller;

    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    uint256 private _status;

    constructor(IERC1155 _erc1155Controller) public {
        erc1155Controller = _erc1155Controller;
    }

    event BTokenBuy(
        uint256[] amounts,
        address[] path,
        address indexed sirenAmmAddress,
        uint256 optionTokenAmount,
        uint64 indexed seriesId,
        address trader
    );

    event BTokenSell(
        uint256[] amounts,
        address[] path,
        address indexed sirenAmmAddress,
        uint256 optionTokenAmount,
        uint64 indexed seriesId,
        address trader
    );

    event WTokenSell(
        uint256[] amounts,
        address[] path,
        address indexed sirenAmmAddress,
        uint256 optionTokenAmount,
        uint64 indexed seriesId,
        address trader
    );

    /// @dev Prevents a contract from calling itself, directly or indirectly.
    /// Calling a `nonReentrant` function from another `nonReentrant`
    /// function is not supported. It is possible to prevent this from happening
    /// by making the `nonReentrant` function external, and make it call a
    /// `private` function that does the actual work.
    modifier nonReentrant() {
        // On the first call to nonReentrant, _notEntered will be true
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");

        // Any calls to nonReentrant after this point will fail
        _status = _ENTERED;

        _;

        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _status = _NOT_ENTERED;
    }

    /// @dev Returns bytes to be used in safeTransferFrom ( prevents stack to deep error )
    function dataReturn() public returns (bytes memory data) {
        return data;
    }

    /// @notice Buy the bToken of a given series to the AMM in exchange for user tokens
    /// @param seriesId The ID of the Series to buy wToken on
    /// @param bTokenAmount The amount of bToken to buy
    /// @param path The path of the user token we supply to the collateral token the series wishes to receive
    /// @param tokenAmountInMaximum The largest amount of user tokens the caller is willing to pay for the bTokens
    /// @param sirenAmmAddress address of the amm that we wish to call
    /// @param deadline deadline the transaction must be completed by
    /// @param _router address of the router we wish to use ( QuickSwap or SushiSwap )
    /// @dev Exchange user tokens for bToken for a given series.
    /// We supply a user token that is not the collateral token of this series and then find the route
    /// Of the user token provided to the collateral token using Uniswap router the addresses provided are currently from QuickSwap and SushiSwap.
    /// We then call bTokenBuy in MinterAMM to buy the bTokens and then send the bought bTokens to the user
    function bTokenBuy(
        uint64 seriesId,
        uint256 bTokenAmount,
        address[] calldata path,
        uint256 tokenAmountInMaximum,
        address sirenAmmAddress,
        uint256 deadline,
        address _router
    ) external nonReentrant returns (uint256[] memory amounts) {
        require(
            path[path.length - 1] ==
                ISirenTradeAMM(sirenAmmAddress).collateralToken(),
            "SirenExchange: Path does not route to collateral Token"
        );

        // Calculate the amount of underlying collateral we need to provide to get the desired bTokens
        uint256 collateralPremium = ISirenTradeAMM(sirenAmmAddress)
            .bTokenGetCollateralIn(seriesId, bTokenAmount);

        // Calculate the amount of token we need to provide to the router so we can get the needed collateral
        uint256[] memory amountsIn = IUniswapV2Router02(_router).getAmountsIn(
            collateralPremium,
            path
        );

        require(
            amountsIn[0] <= tokenAmountInMaximum,
            "SirenExchange: Not Enough tokens sent"
        );

        // Transfer the tokens from user to the contract
        TransferHelper.safeTransferFrom(
            path[0],
            msg.sender,
            address(this),
            amountsIn[0]
        );
        TransferHelper.safeApprove(path[0], _router, amountsIn[0]);

        // Executes the swap giving the needed user token amount to the siren exchange for the appropriate collateral to pay for the btokens
        amounts = IUniswapV2Router02(_router).swapTokensForExactTokens(
            collateralPremium,
            amountsIn[0],
            path,
            address(this),
            deadline
        );

        TransferHelper.safeApprove(
            path[path.length - 1],
            sirenAmmAddress,
            collateralPremium
        );

        // Call MinterAmm bTokenBuy contract
        ISirenTradeAMM(sirenAmmAddress).bTokenBuy(
            seriesId,
            bTokenAmount,
            collateralPremium
        );

        // Transfer the btokens to the correct address ( caller of this contract)
        erc1155Controller.safeTransferFrom(
            address(this),
            msg.sender,
            SeriesLibrary.bTokenIndex(seriesId),
            bTokenAmount,
            dataReturn()
        );

        emit BTokenBuy(
            amounts,
            path,
            sirenAmmAddress,
            bTokenAmount,
            seriesId,
            msg.sender
        );

        return amounts;
    }

    /// @notice Sell the bToken of a given series to the AMM in exchange for user tokens
    /// @param seriesId The ID of the Series to buy bToken on
    /// @param bTokenAmount The amount of bToken to sell
    /// @param path The path of the collateral token of the series to the user token the caller wishes to receive
    /// @param tokenAmountOutMinimum The lowest amount of user token the caller is willing to receive as payment
    /// @param sirenAmmAddress address of the amm that we wish to call
    /// @param deadline deadline the transaction must be completed by
    /// @param _router address of the router we wish to use ( QuickSwap or SushiSwap )
    /// We supply a bToken and then select which user token we wish to receive as our payment ( if it isnt the underlying asset )
    function bTokenSell(
        uint64 seriesId,
        uint256 bTokenAmount,
        address[] calldata path,
        uint256 tokenAmountOutMinimum,
        address sirenAmmAddress,
        uint256 deadline,
        address _router
    ) external nonReentrant returns (uint256[] memory amounts) {
        require(
            path[0] == ISirenTradeAMM(sirenAmmAddress).collateralToken(),
            "SirenExchange: Path does not begin at collateral Token"
        );
        // Calculate the amount of user tokens we will receive from our provided bTokens on the amm
        // The naming is reversed because its from the routers perspective
        uint256 bTokenSellCollateral = ISirenTradeAMM(sirenAmmAddress)
            .bTokenGetCollateralOut(seriesId, bTokenAmount);

        // Calculate the amount of token we will receive for the collateral we are providing from the amm
        uint256[] memory amountsOut = IUniswapV2Router02(_router).getAmountsOut(
            bTokenSellCollateral,
            path
        );

        require(
            amountsOut[amountsOut.length - 1] >= tokenAmountOutMinimum,
            "SirenExchange: Minimum token amount out not met"
        );

        // Transfer bToken from the user to the exchange contract
        erc1155Controller.safeTransferFrom(
            msg.sender,
            address(this),
            SeriesLibrary.bTokenIndex(seriesId),
            bTokenAmount,
            dataReturn()
        );

        erc1155Controller.setApprovalForAll(sirenAmmAddress, true);

        // Sell the bTokens back to the Amm
        ISirenTradeAMM(sirenAmmAddress).bTokenSell(
            seriesId,
            bTokenAmount,
            bTokenSellCollateral
        );

        TransferHelper.safeApprove(path[0], _router, amountsOut[0]);

        // Executes the swap returning the desired user tokens directly back to the sender
        amounts = IUniswapV2Router02(_router).swapExactTokensForTokens(
            bTokenSellCollateral,
            amountsOut[amountsOut.length - 1],
            path,
            msg.sender,
            deadline
        );

        emit BTokenSell(
            amounts,
            path,
            sirenAmmAddress,
            bTokenAmount,
            seriesId,
            msg.sender
        );

        erc1155Controller.setApprovalForAll(sirenAmmAddress, false);

        return amounts;
    }

    /// @notice Sell the wToken of a given series to the AMM in exchange for user tokens
    /// @param seriesId The ID of the Series to buy wToken on
    /// @param wTokenAmount The amount of wToken to sell
    /// @param path The path of the collateral token of the series to the user tokens the caller wishes to receive
    /// @param tokenAmountOutMinimum The lowest amount of user tokens the caller is willing to receive as payment
    /// @param sirenAmmAddress address of the amm that we wish to call
    /// @param deadline deadline the transaction must be completed by
    /// @param _router address of the router we wish to use ( QuickSwap or SushiSwap )
    /// We supply a wToken and then select which user tokens we wish to receive as our payment
    function wTokenSell(
        uint64 seriesId,
        uint256 wTokenAmount,
        address[] calldata path,
        uint256 tokenAmountOutMinimum,
        address sirenAmmAddress,
        uint256 deadline,
        address _router
    ) external nonReentrant returns (uint256[] memory amounts) {
        require(
            path[0] == ISirenTradeAMM(sirenAmmAddress).collateralToken(),
            "SirenExchange: Path does not begin at collateral Token"
        );
        // Calculate the amount of collateral we will receive from our provided wTokens on the amm
        // The naming is reversed because its from the routers perspective
        uint256 wTokenSaleCollateral = ISirenTradeAMM(sirenAmmAddress)
            .wTokenGetCollateralOut(seriesId, wTokenAmount);

        // Calculate the amount of token we will receive for the collateral we are providing from the amm
        uint256[] memory amountsOut = IUniswapV2Router02(_router).getAmountsOut(
            wTokenSaleCollateral,
            path
        );

        // Check to make sure our amountsOut is larger or equal to our min requested
        require(
            amountsOut[amountsOut.length - 1] >= tokenAmountOutMinimum,
            "SirenExchange: Minimum token amount out not met"
        );

        // Transfer wTokens from the user to the exchange
        erc1155Controller.safeTransferFrom(
            msg.sender,
            address(this),
            SeriesLibrary.wTokenIndex(seriesId),
            wTokenAmount,
            dataReturn()
        );

        erc1155Controller.setApprovalForAll(sirenAmmAddress, true);

        // Sell the wTokens back to the Amm
        ISirenTradeAMM(sirenAmmAddress).wTokenSell(
            seriesId,
            wTokenAmount,
            wTokenSaleCollateral
        );

        TransferHelper.safeApprove(path[0], _router, amountsOut[0]);

        // Executes the swap returning the desired user tokens directly back to the sender
        amounts = IUniswapV2Router02(_router).swapExactTokensForTokens(
            wTokenSaleCollateral,
            amountsOut[amountsOut.length - 1],
            path,
            msg.sender,
            deadline
        );

        emit WTokenSell(
            amounts,
            path,
            sirenAmmAddress,
            wTokenAmount,
            seriesId,
            msg.sender
        );

        erc1155Controller.setApprovalForAll(sirenAmmAddress, false);

        return amounts;
    }
}
