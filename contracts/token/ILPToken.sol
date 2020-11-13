pragma solidity 0.6.12;

import "./ISimpleToken.sol";

/** Interface for any Siren SimpleToken
 */
interface ILPToken is ISimpleToken {
    function initialize(
        string memory name,
        string memory symbol,
        uint8 decimals,
        address _distributionToken
    ) external;

    function sendDistributionFunds(uint256 _amount) external;
}
