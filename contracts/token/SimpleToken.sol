// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/GSN/Context.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20Burnable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20Pausable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "./ISimpleToken.sol";

// Adapted from @openzeppelin/contracts-ethereum-package/contracts/presets/ERC20PresetMinterBurner.sol

/**
 * Simple token that will be used for wTokens and bTokens in the Siren system.
 * Name and symbol are created with an "Initialize" call before the token is set up.
 * Mint and Burn are allowed by the owner.
 * Can be destroyed by owner
 */
contract SimpleToken is
    Initializable,
    ContextUpgradeSafe,
    AccessControlUpgradeSafe,
    ERC20BurnableUpgradeSafe,
    ERC20PausableUpgradeSafe,
    ISimpleToken
{
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    // Track the address that deployed this contract
    address public deployer;

    /** Emitted when contract is destroyed */
    event TokenDestroyed();

    /**
     * @dev Grants `DEFAULT_ADMIN_ROLE`, `MINTER_ROLE` and `PAUSER_ROLE` to the
     * account that deploys the contract.
     *
     * See {ERC20-constructor}.
     */

    function initialize(
        string memory name,
        string memory symbol,
        uint8 decimals
    ) public override {
        __ERC20PresetMinterBurner_init(name, symbol, decimals);
    }

    function __ERC20PresetMinterBurner_init(
        string memory name,
        string memory symbol,
        uint8 decimals
    ) internal initializer {
        __Context_init_unchained();
        __AccessControl_init_unchained();
        __ERC20_init_unchained(name, symbol);
        __ERC20Burnable_init_unchained();
        __Pausable_init_unchained();
        __ERC20Pausable_init_unchained();
        __ERC20PresetMinterBurner_init_unchained();

        // Set decimals
        _setupDecimals(decimals);
    }

    function __ERC20PresetMinterBurner_init_unchained() internal initializer {
        // Save off the address that deployed this contract and will be given permissions
        deployer = _msgSender();

        _setupRole(DEFAULT_ADMIN_ROLE, deployer);

        _setupRole(MINTER_ROLE, deployer);
        _setupRole(BURNER_ROLE, deployer);
    }

    /**
     * @dev Creates `amount` new tokens for `to`.
     *
     * See {ERC20-_mint}.
     *
     * Requirements:
     *
     * - the caller must have the `MINTER_ROLE`.
     */
    function mint(address to, uint256 amount) public virtual override {
        require(
            hasRole(MINTER_ROLE, _msgSender()),
            "ERC20PresetMinterBurner: must have minter role to mint"
        );
        _mint(to, amount);
    }

    /**
     * @dev Burns tokens from any account.
     *
     * Requirements:
     *
     * - the caller must have the `BURNER_ROLE`.
     * - target account must have the balance to burn
     */
    function burn(address account, uint256 amount) public virtual override {
        require(
            hasRole(BURNER_ROLE, _msgSender()),
            "ERC20PresetMinterBurner: must have burner role to admin burn"
        );
        _burn(account, amount);
    }

    /**
     * Allow the owner to destroy the token
     */
    function selfDestructToken(address payable refundAddress) public override {
        require(refundAddress != address(0x0), "Invalid refundAddress");        
        require(
            hasRole(DEFAULT_ADMIN_ROLE, _msgSender()),
            "SimpleToken: must have admin role to destroy contract"
        );

        // Emit the event
        emit TokenDestroyed();

        // Destroy the contract and forward any ETH
        selfdestruct(refundAddress);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20UpgradeSafe, ERC20PausableUpgradeSafe) {
        super._beforeTokenTransfer(from, to, amount);
    }
}
