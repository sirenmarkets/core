// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >=0.5.0 <=0.8.0;
import "../amm/ISirenTradeAMM.sol";
import "../series/SeriesLibrary.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@uniswap/lib/contracts/libraries/TransferHelper.sol";

/// This is an implementation of exchanging collateral tokens for different collateral tokens that represent the underlying asset for series in SirenMarkets
/// this then allows you to Buy and Sell bTokens as well as to Sell wTokens using MinterAmm.sol
///
/// For example, a sender could use WETH to trade on WBTC/USDC strikes of WBTC/USDC calls/puts using
/// WETH as the collateral instead of needing to have either WETH or USDC for call and puts.
/// This allows senders to trade multiple tokens for call or put options without needing to exchange these tokens outside of siren
///
/// This is accomplished using UniswapV2Router02 interface https://docs.uniswap.org/protocol/V2/reference/smart-contracts/router-02
/// Since SirenMarkets is deployed on polygon so the routers used are supplied by:
///                                                                               QuickSwap: https://github.com/QuickSwap/quickswap-core
///                                                                               SusiSwap: https://dev.sushi.com/sushiswap/contracts
///
/// We take the router address in as a variable so we can choose which router has a better reserve at the time of the exchange.
contract SirenExchange is ERC1155Holder {
    IERC1155 public immutable erc1155Controller;

    constructor(IERC1155 erc1155Controller_) public {
        erc1155Controller = erc1155Controller_;
    }

    event BTokenBuy(
        uint256[] amounts,
        address[] path,
        address indexed sirenAmmAddress,
        uint256 bTokenAmount,
        uint64 indexed seriesId,
        address buyer
    );

    event BTokenSell(
        uint256[] amounts,
        address[] path,
        address indexed sirenAmmAddress,
        uint256 bTokenAmount,
        uint64 indexed seriesId,
        address seller
    );

    event WTokenSell(
        uint256[] amounts,
        address[] path,
        address indexed sirenAmmAddress,
        uint256 wTokenAmount,
        uint64 indexed seriesId,
        address seller
    );

    /// @dev Returns bytes to be used in safeTransferFrom ( prevents stack to deep error )
    function dataReturn() public returns (bytes memory data) {
        return data;
    }

    /// @notice Buy the bToken of a given series to the AMM in exchange for collateral token
    /// @param seriesId The ID of the Series to buy wToken on
    /// @param bTokenAmount The amount of bToken to buy (bToken has the same decimals as the underlying)
    /// @param path The path of the collateral token we supply to the collateral the series wishes to receive
    /// @param tokenAmountInMaximum The largest amount of collateral the caller is willing to pay for the bTokens
    /// @param sirenAmmAddress address of the amm that we wish to call
    /// @param deadline deadline the transaction must be completed by
    /// @param _router address of the router we wish to use ( QuickSwap or SushiSwap )
    /// @dev Exchange collateral for bToken for a given series.
    /// We supply a collateral that is not the underlying token of this series and then find the route
    /// Of the collateral provided to the underlying token using Uniswap router the addresses provided are currently from QuickSwap and SushiSwap.
    /// We then call bTokenBuy in MinterAMM to buy the bTokens and then send the bought bTokens to the user
    function bTokenBuy(
        uint64 seriesId,
        uint256 bTokenAmount,
        address[] calldata path,
        uint256 tokenAmountInMaximum,
        address sirenAmmAddress,
        uint256 deadline,
        address _router
    ) external returns (uint256[] memory amounts) {
        //Calculate the amount of underlying collateral we need to provide to get the desired bTokens
        uint256 collateralPremium = ISirenTradeAMM(sirenAmmAddress)
            .bTokenGetCollateralIn(seriesId, bTokenAmount);

        //Calculate the amount of token we need to provide to the router so we can get the needed underlying collateral
        uint256[] memory amountsIn = IUniswapV2Router02(_router).getAmountsIn(
            collateralPremium,
            path
        );

        require(amountsIn[0] <= tokenAmountInMaximum, "Not Enough tokens sent");

        //Transfer the tokens from user to the contract
        TransferHelper.safeTransferFrom(
            path[0],
            msg.sender,
            address(this),
            amountsIn[0]
        );
        TransferHelper.safeApprove(
            path[0],
            address(IUniswapV2Router02(_router)),
            amountsIn[0]
        );

        // Executes the swap giving the needed collateral amount to the siren exchange
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

        //Call MinterAmm bTokenBuy contract
        ISirenTradeAMM(sirenAmmAddress).bTokenBuy(
            seriesId,
            bTokenAmount,
            collateralPremium
        );

        //Transfer the btokens to the correct address ( caller of this contract)
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

    /// @notice Sell the wToken of a given series to the AMM in exchange for collateral token
    /// @param seriesId The ID of the Series to buy wToken on
    /// @param bTokenAmount The amount of bToken to sell (bToken has the same decimals as the underlying)
    /// @param path The path of the collateral token of the series to the collateral the caller wishes to receive
    /// @param tokenAmountOutMinimum The lowest amount of collateral the caller is willing to receive as payment
    /// @param sirenAmmAddress address of the amm that we wish to call
    /// @param deadline deadline the transaction must be completed by
    /// @param _router address of the router we wish to use ( QuickSwap or SushiSwap )
    /// We supply a bToken and then select which collateral we wish to receive as our payment ( if it isnt the underlying asset )
    function bTokenSell(
        uint64 seriesId,
        uint256 bTokenAmount,
        address[] calldata path,
        uint256 tokenAmountOutMinimum,
        address sirenAmmAddress,
        uint256 deadline,
        address _router
    ) external returns (uint256[] memory amounts) {
        //Calculate the amount of collateral we will receive from our provided bTokens on the amm
        //The naming is reversed because its from the routers perspective
        uint256 collateralAmountIn = ISirenTradeAMM(sirenAmmAddress)
            .bTokenGetCollateralOut(seriesId, bTokenAmount);

        //Calculate the amount of token we will receive for the collateral we are providing from the amm
        uint256[] memory amountsOut = IUniswapV2Router02(_router).getAmountsOut(
            collateralAmountIn,
            path
        );

        require(
            amountsOut[amountsOut.length - 1] >= tokenAmountOutMinimum,
            "Minimum token ammunt out not met"
        );

        //Transfer bToken from the user to the exchange contract
        erc1155Controller.safeTransferFrom(
            msg.sender,
            address(this),
            SeriesLibrary.bTokenIndex(seriesId),
            bTokenAmount,
            dataReturn()
        );

        erc1155Controller.setApprovalForAll(address(sirenAmmAddress), true);

        //Sell the bTokens back to the Amm
        ISirenTradeAMM(sirenAmmAddress).bTokenSell(
            seriesId,
            bTokenAmount,
            collateralAmountIn
        );

        TransferHelper.safeApprove(
            path[0],
            address(IUniswapV2Router02(_router)),
            amountsOut[0]
        );

        // Executes the swap returning the desired collateral directly back to the sender
        amounts = IUniswapV2Router02(_router).swapExactTokensForTokens(
            collateralAmountIn,
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
        return amounts;
    }

    /// @notice Sell the wToken of a given series to the AMM in exchange for collateral token
    /// @param seriesId The ID of the Series to buy wToken on
    /// @param wTokenAmount The amount of wToken to sell (wToken has the same decimals as the underlying)
    /// @param path The path of the collateral token of the series to the collateral the caller wishes to receive
    /// @param tokenAmountOutMinimum The lowest amount of collateral the caller is willing to receive as payment
    /// @param sirenAmmAddress address of the amm that we wish to call
    /// @param deadline deadline the transaction must be completed by
    /// @param _router address of the router we wish to use ( QuickSwap or SushiSwap )
    /// We supply a wToken and then select which collateral we wish to receive as our payment ( if it isnt the underlying asset )
    function wTokenSell(
        uint64 seriesId,
        uint256 wTokenAmount,
        address[] calldata path,
        uint256 tokenAmountOutMinimum,
        address sirenAmmAddress,
        uint256 deadline,
        address _router
    ) external returns (uint256[] memory amounts) {
        //Calculate the amount of collateral we will receive from our provided wTokens on the amm
        //The naming is reversed because its from the routers perspective
        uint256 collateralAmountIn = ISirenTradeAMM(sirenAmmAddress)
            .wTokenGetCollateralOut(seriesId, wTokenAmount);

        //Calculate the amount of token we will receive for the collateral we are providing from the amm
        uint256[] memory amountsOut = IUniswapV2Router02(_router).getAmountsOut(
            collateralAmountIn,
            path
        );

        //Check to make sure our amountsOut is larger or equal to our min requested
        require(
            amountsOut[amountsOut.length - 1] >= tokenAmountOutMinimum,
            "Minimum token ammunt out not met"
        );

        //Transfer wTokens from the user to the exchange
        erc1155Controller.safeTransferFrom(
            msg.sender,
            address(this),
            SeriesLibrary.wTokenIndex(seriesId),
            wTokenAmount,
            dataReturn()
        );

        erc1155Controller.setApprovalForAll(address(sirenAmmAddress), true);

        //Sell the wTokens back to the Amm
        ISirenTradeAMM(sirenAmmAddress).wTokenSell(
            seriesId,
            wTokenAmount,
            collateralAmountIn
        );

        TransferHelper.safeApprove(
            path[0],
            address(IUniswapV2Router02(_router)),
            amountsOut[0]
        );

        // Executes the swap returning the desired collateral directly back to the sender
        amounts = IUniswapV2Router02(_router).swapExactTokensForTokens(
            collateralAmountIn,
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

        return amounts;
    }
}
