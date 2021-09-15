# SeriesVault Contract

## Contract description

The Serires Vault is responsible for holding customer tokens, setting erc20 allowances, and ensuring proper authorization for both erc20 and erc1155 tokens. The Series Vault will approve tokens always and only if the approval is requested by the authorized series controller and the spender of said token is the authorized series controller.

### Bugs found and recommendations

- Reccomendation: The allowance for ERC20 tokens is only set upon approval, since it is set to max_uint256 it would take an astronomical amount of transactions for the allowance to detract to a point where that would impede the transaction of that token. However, this should be considered should Siren consider using flash loans or any other high transaction volume operations.

### Assumptions made during verification

- We assume openzeppelin initializations and upgradables are without error or vulnerability
- We assume openzeppelin transfer is without error or vulnerability
- We assume that the series controller is properly handling requests to withdraw funds
- We assume the proper series controller is passed upon initialization

### Important state variables and invariants

The following variables define the state of the seriesVault

- owner: The contract owner
- controller: The authorized series controller
- initialization: Whether or not the vault is in the initialized state

We have verified that these state variables are related as follows:

1. Controller
   1.1 (![passing]) `[controller_defined]`: The controller is only and always non-zero once the state is initialized
   1.2 (![passing]) `[spender_only]`: Tokens are only defined when the spender is the authorized controller

### State evolution

1. Controller
   1.1 (![passing]) `[single_definition]`: Once set, the controller may never be changed
   1.2 (![passing]) `[initialize_only]`: The controller may only be changed through the initialize function

2. Initialization
   1.2 (![passing]) `[single_call]`: Initialization may only occur once

3. ERC20 Approvals
   3.1 (![passing]) `[Initialized Only]`: Only approved if the state is initialized
   3.2 (![passing]) `[Authorized Only]`: Only approved if the msg.sender and the token's spender is the priveleged controller

4. ERC1155 Approvals
   4.1 (![passing]) `[Initialized Only]`: Only approved if the state is initialized
   4.3 (![passing]) `[Authorized Only]`: Only the authorized controller may approv 1155 tokens

### Wishlist

1. Guarantee of Approval for ERC1155 and ERC20 tokens by the series vault: With the proper environment and controller, any token requested for approval should receive approval. This rule has been drafted as an assert in the respective ERC1155 and ERC20 approval unit test rules
