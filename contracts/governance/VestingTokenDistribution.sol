pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "./VestingVaultWithDelegation.sol";

/**
 * The goal of this contract is to send vesting tokens to a list of users and allow the 
 * token voting to be delegated to the user while it is vesting.
 */
contract VestingTokenDistribution is OwnableUpgradeSafe {  
  using SafeERC20 for IERC20;
  
  IERC20 token;
  uint256 count;
  address[] public recipients;
  uint256[] public amounts;
  uint256 startTime;
  uint16 vestingDurationInDays;
  uint16 vestingCliffInDays;

  event VaultCreated(address vault, address recipient, uint256 amount);

  constructor(
    IERC20 _token,
    uint256 _startTime, 
    uint16 _vestingDurationInDays, 
    uint16 _vestingCliffInDays
  ) public {
    // Set up the initialization of the inherited ownable contract
    __Ownable_init();
    token = _token;
    startTime = _startTime;
    vestingDurationInDays = _vestingDurationInDays;
    vestingCliffInDays = _vestingCliffInDays;
  }

  function addRecipients(address[] memory _recipientsToAdd, uint[] memory _amountsToAdd)
    public
    onlyOwner
  { 
      // Verify array lengths match
      require(_recipientsToAdd.length == _amountsToAdd.length, "Invalid arrays");

      // Iterate over the list
      for(uint i = 0 ; i < _recipientsToAdd.length; i++) {

        // Verify valid values are passed in
        require(_recipientsToAdd[i] != address(0), "Invalid addr");
        require(_amountsToAdd[i] != 0, "Invalid amt");

        // Push them onto the list
        recipients.push(_recipientsToAdd[i]);
        amounts.push(_amountsToAdd[i]);
      }      
  }
  
  function distribute(uint256 batchSize) 
    public 
    onlyOwner 
  {
    // Track how many distributions are done
    uint256 distributed = 0;

    while(count < amounts.length && distributed <= batchSize) {  
      // Verify enough tokens to distribute
      require(token.balanceOf(address(this)) >= amounts[count], "Out of tokens");    

      address recipient = recipients[count];
      uint256 amount = amounts[count];

      // Create vesting contract
      VestingVaultWithDelegation created = new VestingVaultWithDelegation(
          recipient,
          token, 
          startTime, 
          vestingDurationInDays, 
          vestingCliffInDays
      );

      // Approve and allow tokens to be moved to contract
      token.approve(address(created), amount);
      created.addTokenGrant(recipient, amount);

      emit VaultCreated(address(created), recipient, amount);

      // Update counts
      count = count + 1;
      distributed = distributed + 1;
    }
  }

  function recoverTokens(IERC20 tokenToRecover) public onlyOwner {
      // Get the balance
      uint256 balance = tokenToRecover.balanceOf(address(this));

      // Sweep out
      tokenToRecover.safeTransfer(owner(), balance);
  }
}