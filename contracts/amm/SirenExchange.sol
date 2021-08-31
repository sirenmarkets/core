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
    // IUniswapV2Router02 public immutable router;
    IERC1155 public immutable erc1155Controller;

    // IUniswapV2Router02 public router;

    constructor(IERC1155 erc1155Controller_) public {
        // router = IUniswapV2Router02(router_);
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

    function dataReturn() public returns (bytes memory data) {
        return data;
    }

    /// @dev Exchange collateral for bToken for a given series.
    /// We supply a collateral that is not the underlying token of this series and then find the route
    /// Of the collateral provided to the underlying token using Uniswaps router the addresses provided are currently from quickswap and sushiswap.
    /// We then call bTokenBuy in MinterAMM to buy the btokens and then send the bought bTokens to the user
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
