// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0 <=0.8.0;
import "../amm/ISirenTradeAMM.sol";
import "../series/SeriesLibrary.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import "@uniswap/lib/contracts/libraries/Babylonian.sol";
import "hardhat/console.sol";

contract SirenExchange is ERC1155Holder {
    IUniswapV2Router02 public immutable router;
    IERC1155 public immutable erc1155Controller;

    constructor(address router_, IERC1155 erc1155Controller_) public {
        router = IUniswapV2Router02(router_);
        erc1155Controller = erc1155Controller_;
    }

    function bTokenBuy(
        uint64 seriesId,
        uint256 bTokenAmount,
        address[] calldata path,
        uint256 tokenAmountInMaximum,
        address sirenAmmAddress,
        uint256 deadline
    ) external {
        // Uniswap v2 logic below for example, but this will work for quickswap or sushiswap
        uint256 collateralAmountOut = ISirenTradeAMM(sirenAmmAddress)
            .bTokenGetCollateralIn(seriesId, bTokenAmount);

        console.log("Series ID", seriesId);

        uint256[] memory amountsIn = router.getAmountsIn(
            collateralAmountOut,
            path
        );

        require(amountsIn[0] <= tokenAmountInMaximum, "Not Enough tokens sent");

        TransferHelper.safeTransferFrom(
            path[0],
            msg.sender,
            address(this),
            amountsIn[0]
        );
        TransferHelper.safeApprove(path[0], address(router), amountsIn[0]);

        // Executes the swap, returning the amountIn actually spent.
        uint256[] memory amountInSpent = router.swapTokensForExactTokens(
            collateralAmountOut,
            amountsIn[0],
            path,
            address(this),
            deadline
        );

        TransferHelper.safeApprove(
            path[path.length - 1],
            sirenAmmAddress,
            collateralAmountOut
        );

        ISirenTradeAMM(sirenAmmAddress).bTokenBuy(
            seriesId,
            bTokenAmount,
            collateralAmountOut
        );

        //Transfer token back to the user
        bytes memory data;
        erc1155Controller.safeTransferFrom(
            address(this),
            msg.sender,
            SeriesLibrary.bTokenIndex(seriesId),
            bTokenAmount,
            data
        );
    }

    // function bTokenSell(
    //     uint64 seriesId,
    //     uint256 bTokenAmount,
    //     address[] calldata path,
    //     uint256 tokenAmountOutMinimum,
    //     address sirenAmmAddress,
    //     uint256 deadline
    // ) external {
    //         uint256 collateralAmountIn = ISirenTradeAMM(sirenAmmAddress).bTokenGetCollateralOut(seriesId, bTokenAmount);
    //         uint[] memory amountsOut = router.getAmountsOut(collateralAmountIn, path);

    //         require( amountsOut[amountsOut.length - 1] >= tokenAmountOutMinimum, "Minimum token ammunt not met");

    //          //Transfer token back to the user
    //         bytes memory data;
    //         erc1155Controller.safeTransferFrom(
    //                             msg.sender,
    //                             address(this),
    //                             SeriesLibrary.bTokenIndex(seriesId),
    //                             bTokenAmount,
    //                             data);

    //         ISirenTradeAMM(sirenAmmAddress).bTokenSell(seriesId, bTokenAmount, collateralAmountIn);

    //         // Executes the swap, returning the amountIn actually spent.
    //         uint256[] memory amountOutRecieved = router.swapExactTokensForTokens(
    //         collateralAmountIn,
    //         amountsOut[amountsOut.length - 1],
    //         path,
    //         msg.sender,
    //         deadline
    //         );

    // }

    // function wTokenSell(
    //     uint64 seriesId,
    //     uint256 wTokenAmount,
    //     uint256 tokenInAddress, // token that AMM is giving in return for wToken, this token goes into Router
    //     uint256 tokenOutAddress, // token that user gets in the end
    //     uint256 tokenAmountOutMinimum,
    //     address routerAddress,
    //     address[] calldata path,
    //     address sirenAmmAddress,
    // ) external {

    // }
}
