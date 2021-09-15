# ERC1155Controller Contract

## Contract description

The ERC1155Controller is built on top of the open zeppelin ERC1155PresetMinterPauserUpgradeable to mint and burn ERC1155 tokens while keeping track of the total supply of tokens available for given id.

### Bugs found and recommendations

No bugs or vulnverabilities found

Reccomendation: To ensure that controller is always properly set in the right scenario, adding a check to make sure the value of controller passed is not 0 is suggested, however this is not believed to affect any validity of the code

### Assumptions made during verification

- We assume openzeppelin initializations and upgradables are without error or vulnerability
- We assume the proper series controller is passed upon initialization

### Important state variables and invariants

1. Controller
   1.1 (![failing])`[controller_initialized]`: Controller is only and always non-zero once initialized

2. Token Supply
   2.1 (![passing]) `[supply_equality]`: Supply of tokens held by the 1155controller is equivalent to that held in the balance
   2.2 (![passing)) `[token_supply_overflow]`: The supply of tokens is bounded by 0 and max_int, such that no overflow occurs

### State evolution

3. Tokens
   3.1 (![passing]) `[token_controller_only]`: Tokens may only be minted or burned by the authorized controller
   3.2 (![passing]) `[token_valid_functions]`: Only minting or burning may change the supply of tokens

4. Minting
   3.1/2 (![passing])[^manual]`[mint_increasing]`: Mint and the corresponding batch function will always increase the supply, and by the proper amount
   3.3 (![passing]) `[mintBatch_additivity]`: Mint Batch function guarantees proper functionality with multiple copies of the same id

5. Burning
   4.1/2 (![passing])[^manual] `[burn_decreasing]`: Burning and the corresponding batch function will always decrease the supply, and by the proper amount
   4.3 (![passing]) `[burnBatch_additivity]`: Burn Batch function guarantees proper functionality with multiple copies of the same id

[^manual]: For both mint and burn batch function increasing we were not able to get the logic to work out for arbitrary length arrays, as a result this was tested manually with an array of 4 seperate ids and amounts to cover the rule to a reasonable level. The code for arbitrary length batch increasing/decreasing is left commented

6. Owner
   5.1 (![passing]) `[updateImplementation_onlyOwner]`: Implementation of contract may only be updated by the owner
   5.2 (![passing]) `[transferOwnership_onlyOwner]`: Ownership of contract may only be transfered by the current owner

7. Initialization
   6.1 (![failing]) `[initialization_single_call]`: Initialization may not occur twice

:::info
Note: As far as we can tell the initialization single call rule should be passing through looking at the code and should not be taken as a concern
:::
