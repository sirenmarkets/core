// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >=0.5.0 <=0.8.0;
import "../amm/ISirenTradeAMM.sol";
import "../series/SeriesLibrary.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@uniswap/lib/contracts/libraries/TransferHelper.sol";

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

    /// @notice Sell the wToken of a given series to the AMM in exchange for collateral token
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
        uint256 collateralPremium = ISirenTradeAMM(sirenAmmAddress)
            .bTokenGetCollateralIn(seriesId, bTokenAmount);

        uint256[] memory amountsIn = IUniswapV2Router02(_router).getAmountsIn(
            collateralPremium,
            path
        );

        require(amountsIn[0] <= tokenAmountInMaximum, "Not Enough tokens sent");

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

        // Executes the swap, returning the amountIn actually spent.
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
        uint256 collateralAmountIn = ISirenTradeAMM(sirenAmmAddress)
            .bTokenGetCollateralOut(seriesId, bTokenAmount);
        uint256[] memory amountsOut = IUniswapV2Router02(_router).getAmountsOut(
            collateralAmountIn,
            path
        );

        require(
            amountsOut[amountsOut.length - 1] >= tokenAmountOutMinimum,
            "Minimum token ammunt out not met"
        );

        //Transfer token back to the user
        erc1155Controller.safeTransferFrom(
            msg.sender,
            address(this),
            SeriesLibrary.bTokenIndex(seriesId),
            bTokenAmount,
            dataReturn()
        );

        erc1155Controller.setApprovalForAll(address(sirenAmmAddress), true);

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
        // Executes the swap, returning the amountIn actually spent.
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
        uint256 collateralAmountIn = ISirenTradeAMM(sirenAmmAddress)
            .wTokenGetCollateralOut(seriesId, wTokenAmount);

        uint256[] memory amountsOut = IUniswapV2Router02(_router).getAmountsOut(
            collateralAmountIn,
            path
        );

        require(
            amountsOut[amountsOut.length - 1] >= tokenAmountOutMinimum,
            "Minimum token ammunt out not met"
        );

        //Transfer token back to the user
        erc1155Controller.safeTransferFrom(
            msg.sender,
            address(this),
            SeriesLibrary.wTokenIndex(seriesId),
            wTokenAmount,
            dataReturn()
        );

        erc1155Controller.setApprovalForAll(address(sirenAmmAddress), true);

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
        // Executes the swap, returning the amountIn actually spent.
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
