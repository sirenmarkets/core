// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.8.0;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";

import "../amm/IMinterAmm.sol";
import "../amm/IAmmFactory.sol";
import "../proxy/Proxiable.sol";
import "./ISeriesController.sol";
import "./SeriesLibrary.sol";

contract SeriesDeployer is
    Proxiable,
    Initializable,
    AccessControlUpgradeable,
    ERC1155HolderUpgradeable
{
    /// @dev These contract variables, as well as the `nonReentrant` modifier further down below,
    /// are copied from OpenZeppelin's ReentrancyGuard contract. We chose to copy ReentrancyGuard instead of
    /// having SeriesController inherit it because we intend use this SeriesController contract to upgrade already-deployed
    /// SeriesController contracts. If the SeriesController were to inherit from ReentrancyGuard, the ReentrancyGuard's
    /// contract storage variables would overwrite existing storage variables on the contract and it would
    /// break the contract. So by manually implementing ReentrancyGuard's logic we have full control over
    /// the position of the variable in the contract's storage, and we can ensure the SeriesController's contract
    /// storage variables are only ever appended to. See this OpenZeppelin article about contract upgradeability
    /// for more info on the contract storage variable requirement:
    /// https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable#modifying-your-contracts
    uint256 internal constant _NOT_ENTERED = 1;
    uint256 internal constant _ENTERED = 2;
    uint256 internal _status;

    IAddressesProvider public addressesProvider;

    /// @notice Check if the msg.sender is the privileged DEFAULT_ADMIN_ROLE holder
    modifier onlyOwner() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Not Owner");

        _;
    }

    /// @dev Prevents a contract from calling itself, directly or indirectly.
    /// Calling a `nonReentrant` function from another `nonReentrant`
    /// function is not supported. It is possible to prevent this from happening
    /// by making the `nonReentrant` function external, and make it call a
    /// `private` function that does the actual work.
    modifier nonReentrant() {
        // On the first call to nonReentrant, _notEntered will be true
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");

        // Any calls to nonReentrant after this point will fail
        _status = _ENTERED;

        _;

        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _status = _NOT_ENTERED;
    }

    function __SeriesDeployer_init(IAddressesProvider _addressesProvider)
        external
        initializer
    {
        __AccessControl_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);

        addressesProvider = _addressesProvider;
    }

    /// @dev added since both base classes implement this function
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(AccessControlUpgradeable, ERC1155ReceiverUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /// @notice Update the addressProvider used for other contract lookups
    function setAddressesProvider(address _addressesProvider)
        external
        onlyOwner
    {
        require(_addressesProvider != address(0x0), "Invalid Address");
        addressesProvider = IAddressesProvider(_addressesProvider);
    }

    /// @dev This function allows any address to spin up a new series if it doesn't already exist and buy bTokens.
    /// The existing AMM address provided must have been deployed from the Siren AMM Factory to ensure no
    /// malicious AMM can be passed by the user.  The tokens from the AMM are used in the series creation.
    /// The strike price and expiration dates must have been pre-authorized for that asset in the Series Controller.
    /// Once the series is created, the function will purchase the requested tokens for the user from the AMM.
    function autoCreateSeriesAndBuy(
        IMinterAmm _existingAmm,
        uint256 _strikePrice,
        uint40 _expirationDate,
        bool _isPutOption,
        uint256 _bTokenAmount,
        uint256 _collateralMaximum
    ) public nonReentrant returns (uint64) {
        // Save off the ammTokens
        ISeriesController.Tokens memory ammTokens = ISeriesController.Tokens(
            address(_existingAmm.getUnderlyingToken()),
            address(_existingAmm.getPriceToken()),
            address(_existingAmm.getCollateralToken())
        );

        // Validate the asset triplet was deployed to the amm address through the factory
        require(
            IAmmFactory(addressesProvider.getAmmFactory()).amms(
                keccak256(
                    abi.encode(
                        address(_existingAmm.getUnderlyingToken()),
                        address(_existingAmm.getPriceToken()),
                        address(_existingAmm.getCollateralToken())
                    )
                )
            ) == address(_existingAmm),
            "Invalid AMM"
        );

        // Create memory arrays to pass to create function
        uint256[] memory strikes = new uint256[](1);
        uint40[] memory expirations = new uint40[](1);
        address[] memory minters = new address[](1);
        strikes[0] = _strikePrice;
        expirations[0] = _expirationDate;
        minters[0] = address(_existingAmm);

        // Get the series controller and create the series
        ISeriesController(addressesProvider.getSeriesController()).createSeries(
                ammTokens,
                strikes,
                expirations,
                minters,
                _isPutOption
            );

        // We know the series we just created is the latest minus 1
        uint64 createdSeriesId = ISeriesController(
            addressesProvider.getSeriesController()
        ).latestIndex() - 1;

        // Move the collateral into this address and approve the AMM
        IERC20(ammTokens.collateralToken).transferFrom(
            msg.sender,
            address(this),
            _collateralMaximum
        );
        IERC20(ammTokens.collateralToken).approve(
            address(_existingAmm),
            _collateralMaximum
        );

        // Buy options
        uint256 amtBought = IMinterAmm(_existingAmm).bTokenBuy(
            createdSeriesId,
            _bTokenAmount,
            _collateralMaximum
        );

        // Send bTokens to buyer
        bytes memory data;
        IERC1155(addressesProvider.getErc1155Controller()).safeTransferFrom(
            address(this),
            msg.sender,
            SeriesLibrary.bTokenIndex(createdSeriesId),
            amtBought,
            data
        );

        // Send any unused collateral back to buyer
        if (IERC20(ammTokens.collateralToken).balanceOf(address(this)) > 0) {
            IERC20(ammTokens.collateralToken).transfer(
                msg.sender,
                IERC20(ammTokens.collateralToken).balanceOf(address(this))
            );
        }

        // Revoke any remaining allowance
        IERC20(ammTokens.collateralToken).approve(address(_existingAmm), 0);

        return createdSeriesId;
    }
}
