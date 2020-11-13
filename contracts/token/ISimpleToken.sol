pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";

/** Interface for any Siren SimpleToken
 */
interface ISimpleToken is IERC20 {
    function initialize(
        string memory name,
        string memory symbol,
        uint8 decimals
    ) external;

    function mint(address to, uint256 amount) external;

    function burn(address account, uint256 amount) external;

    function selfDestructToken(address payable refundAddress) external;
}
