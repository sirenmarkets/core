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

    event BTokenBuy(
        uint256[] amounts,
        address[] path,
        address sirenAmmAddress,
        uint256 bTokenAmount,
        uint64 seriesId,
        address buyer
    );

    function bTokenBuy(
        uint64 seriesId,
        uint256 bTokenAmount,
        address[] calldata path,
        uint256 tokenAmountInMaximum,
        address sirenAmmAddress,
        uint256 deadline
    )
        external
        returns (
            // Returns The input token amount and all subsequent output token amounts.
            uint256[] memory amounts
        )
    {
        // Emitted when the amm is created

        uint256 collateralPremium = ISirenTradeAMM(sirenAmmAddress)
            .bTokenGetCollateralIn(seriesId, bTokenAmount);

        uint256[] memory amountsIn = router.getAmountsIn(
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
        TransferHelper.safeApprove(path[0], address(router), amountsIn[0]);

        // Executes the swap, returning the amountIn actually spent.
        amounts = router.swapTokensForExactTokens(
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

        ISirenTradeAMM(sirenAmmAddress).bTokenBuy(
            seriesId,
            bTokenAmount,
            collateralPremium
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

        return amounts;
        // emit BTokenBuy(
        //     amounts,
        //     path,
        //     sirenAmmAddress,
        //     bTokenAmount,
        //     seriesId,
        //     msg.sender
        // );
    }

    function bTokenSell(
        uint64 seriesId,
        uint256 bTokenAmount,
        address[] calldata path,
        uint256 tokenAmountOutMinimum,
        address sirenAmmAddress,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        uint256 collateralAmountIn = ISirenTradeAMM(sirenAmmAddress)
            .bTokenGetCollateralOut(seriesId, bTokenAmount);
        uint256[] memory amountsOut = router.getAmountsOut(
            collateralAmountIn,
            path
        );

        require(
            amountsOut[amountsOut.length - 1] >= tokenAmountOutMinimum,
            "Minimum token ammunt out not met"
        );

        //Transfer token back to the user
        bytes memory data;
        erc1155Controller.safeTransferFrom(
            msg.sender,
            address(this),
            SeriesLibrary.bTokenIndex(seriesId),
            bTokenAmount,
            data
        );

        erc1155Controller.setApprovalForAll(address(sirenAmmAddress), true);

        ISirenTradeAMM(sirenAmmAddress).bTokenSell(
            seriesId,
            bTokenAmount,
            collateralAmountIn
        );

        TransferHelper.safeApprove(path[0], address(router), amountsOut[0]);
        // Executes the swap, returning the amountIn actually spent.
        amounts = router.swapExactTokensForTokens(
            collateralAmountIn,
            amountsOut[amountsOut.length - 1],
            path,
            msg.sender,
            deadline
        );
        return amounts;
    }

    function wTokenSell(
        uint64 seriesId,
        uint256 wTokenAmount,
        address[] calldata path,
        uint256 tokenAmountOutMinimum,
        address sirenAmmAddress,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        uint256 collateralAmountIn = ISirenTradeAMM(sirenAmmAddress)
            .wTokenGetCollateralOut(seriesId, wTokenAmount);
        uint256[] memory amountsOut = router.getAmountsOut(
            collateralAmountIn,
            path
        );

        require(
            amountsOut[amountsOut.length - 1] >= tokenAmountOutMinimum,
            "Minimum token ammunt out not met"
        );

        //Transfer token back to the user
        erc1155Controller.setApprovalForAll(address(sirenAmmAddress), true);
        bytes memory data;
        erc1155Controller.safeTransferFrom(
            msg.sender,
            address(this),
            SeriesLibrary.wTokenIndex(seriesId),
            wTokenAmount,
            data
        );

        ISirenTradeAMM(sirenAmmAddress).wTokenSell(
            seriesId,
            wTokenAmount,
            collateralAmountIn
        );

        TransferHelper.safeApprove(
            path[0],
            address(sirenAmmAddress),
            amountsOut[0]
        );
        // Executes the swap, returning the amountIn actually spent.
        amounts = router.swapExactTokensForTokens(
            collateralAmountIn,
            amountsOut[amountsOut.length - 1],
            path,
            msg.sender,
            deadline
        );
        return amounts;
    }
}
