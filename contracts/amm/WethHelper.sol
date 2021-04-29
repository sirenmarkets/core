pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";

import "../market/IMarket.sol";

interface IWETH {
    function deposit() external payable;
    function transfer(address to, uint value) external returns (bool);
    function withdraw(uint) external;
}

interface IMinterAmm {
    function bTokenBuy(
        uint256 marketIndex,
        uint256 bTokenAmount,
        uint256 collateralMaximum
    ) external returns (uint256);

    function bTokenSell(
        uint256 marketIndex,
        uint256 bTokenAmount,
        uint256 collateralMinimum
    ) external returns (uint256);

    function provideCapital(uint256 collateralAmount, uint256 lpTokenMinimum) external;

    function getMarket(uint256 marketIndex) external view returns (IMarket);

    function lpToken() external view returns (ISimpleToken);
}

contract WethHelper {
    using SafeERC20 for IERC20;

    address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    constructor() public {

    }

    function provideCapital(address poolAddress, uint256 collateralAmount, uint256 lpTokenMinimum)
        external payable
    {
      require(msg.value > 0, "No value passed");

      IMinterAmm amm = IMinterAmm(poolAddress);

      // Wrap ETH
      IWETH(WETH).deposit{value: msg.value}();

      // Approve WETH
      IERC20(WETH).approve(poolAddress, collateralAmount);

      // Deposit collateral
      amm.provideCapital(collateralAmount, lpTokenMinimum);

      // Forward LP token to the caller
      ISimpleToken lpToken = amm.lpToken();
      lpToken.transfer(msg.sender, lpToken.balanceOf(address(this)));
    }

    function bTokenBuy(
        address poolAddress,
        uint256 marketIndex,
        uint256 bTokenAmount,
        uint256 collateralMaximum
    ) external payable returns (uint256) {
      require(msg.value > 0, "No value passed");

      // Wrap ETH
      IWETH(WETH).deposit{value: msg.value}();

      // Approve WETH
      IERC20(WETH).approve(poolAddress, collateralMaximum);

      IMinterAmm amm = IMinterAmm(poolAddress);

      // bTokenBuy
      amm.bTokenBuy(marketIndex, bTokenAmount, collateralMaximum);

      // Forward bToken to the caller
      amm.getMarket(marketIndex).bToken().transfer(msg.sender, bTokenAmount);
    }

    function bTokenSell(
        address poolAddress,
        uint256 marketIndex,
        uint256 bTokenAmount,
        uint256 collateralMinimum
    ) external returns (uint256) {
      IMinterAmm amm = IMinterAmm(poolAddress);
      ISimpleToken bToken =  amm.getMarket(marketIndex).bToken();

      // Transfer bToken from sender
      bToken.transferFrom(msg.sender, address(this), bTokenAmount);

      // Approve bToken for tranfer from the AMM
      bToken.approve(address(this), bTokenAmount);

      // Sell bToken
      uint256 wethAmount = amm.bTokenSell(marketIndex, bTokenAmount, collateralMinimum);

      // Unwrap WETH
      IWETH(WETH).withdraw(wethAmount);

      // Transfer ETH to sender
      msg.sender.transfer(wethAmount);
    }
}