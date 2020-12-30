// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "../proxy/Proxiable.sol";

contract Lockdown is OwnableUpgradeSafe, Proxiable {

    /**
     * Set the owner to the address that will be locking down the contract
     */
    constructor(address owner) public {
        __Ownable_init();
        super.transferOwnership(owner);
    }

    /**
     * The owner can update the contract logic address in the proxy itself to upgrade
     */
    function updateAmmImplementation(address newAmmImplementation)
        public
        onlyOwner
    {
        require(newAmmImplementation != address(0x0), "Invalid newAmmImplementation");

        // Call the proxiable update
        _updateCodeAddress(newAmmImplementation);
    }

    /**
     * Update the logic address of this Market
     */
    function updateImplementation(address newImplementation) public onlyOwner {
        require(newImplementation != address(0x0), "Invalid newImplementation");

        _updateCodeAddress(newImplementation);
    }
}
