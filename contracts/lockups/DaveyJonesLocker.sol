pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/TokenTimelock.sol";

contract DaveyJonesLocker is TokenTimelockUpgradeSafe {

  constructor(IERC20 token, address beneficiary, uint256 releaseTime) public {
    require(address(token) != address(0x0), "token Invalid");
    require(beneficiary != address(0x0), "beneficiary Invalid");
    
    // Init the timelock
    __TokenTimelock_init(token, beneficiary, releaseTime);
  }

}