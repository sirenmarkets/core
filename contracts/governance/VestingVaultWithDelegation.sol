pragma solidity 0.6.12;

import "../staking/VestingVault.sol";
import "./IDelegatableERC20.sol";

/**
 * The goal of this contract is to create a vesting vault that allows any voting power to be delegated
 * to the recipient even in the tokens are still locked.
 */
contract VestingVaultWithDelegation is VestingVault {
    /** This vesting vault can only have one recipient */
    address public onlyRecipient;

    constructor(
        address _onlyRecipient,
        IERC20 _token, 
        uint256 _startTime, 
        uint16 _vestingDurationInDays, 
        uint16 _vestingCliffInDays
    ) 
    VestingVault(
        _token, 
        _startTime, 
        _vestingDurationInDays, 
        _vestingCliffInDays
    )
    public { 
        onlyRecipient = _onlyRecipient;
    }

    function addTokenGrant(
        address _recipient,
        uint256 _amount
    )
        public
        override
    {                
        // Specific logic to this contract
        require(_recipient == onlyRecipient, "Invalid recipient");

        VestingVault.addTokenGrant(_recipient, _amount);

        // Delegate all votes to recipient
        IDelegatableERC20(address(token)).delegate(_recipient);
    }
}