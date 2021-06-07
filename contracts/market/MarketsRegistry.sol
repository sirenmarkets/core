// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "./IMarket.sol";
import "./IMarketsRegistry.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "../proxy/Proxy.sol";
import "../proxy/Proxiable.sol";
import "../amm/InitializeableAmm.sol";

/**
 * The Markets Registry is responsible for creating and tracking markets
 */
contract MarketsRegistry is OwnableUpgradeSafe, Proxiable, IMarketsRegistry {
    /** Use safe ERC20 functions for any token transfers since people don't follow the ERC20 standard */
    using SafeERC20 for IERC20;

    /** Mapping of authorized fee receivers */
    mapping(address => bool) public feeReceivers;

    /** Mapping of market names to addresses */
    mapping(string => address) public override markets;
    mapping(bytes32 => address[]) marketsByAssets;

    /** Mapping of keccak256(abi.encode(address(_collateralToken), address(_paymentToken))) 
     * bytes32 keys to AMM (Automated Market Maker) addresses
     */
    mapping(bytes32 => address) public override amms;

    /** Implementation address for token contracts - can be upgraded by owner */
    address public tokenImplementation;

    /** Implementation address for the markets contract - can be upgraded by owner */
    address public marketImplementation;

    /** Implementation address for the AMM contract - can be upgraded by owner */
    address public ammImplementation;

    /** Emitted when the owner updates the token implementation address */
    event TokenImplementationUpdated(address newAddress);

    /** Emitted when the owner updates the market implementation address */
    event MarketImplementationUpdated(address newAddress);

    /** Emitted when the owner updates the amm implementation address */
    event AmmImplementationUpdated(address newAddress);

    /** Emitted when the owner creates a new market */
    event MarketCreated(string name, address newAddress, uint256 marketIndex);

    /** Emitted when contract is destroyed */
    event MarketDestroyed(address market);

    /** Emitted when tokens are recovered */
    event TokensRecovered(
        address indexed token,
        address indexed to,
        uint256 value
    );

    /** Emitted when a new AMM is created and initialized */
    event AmmCreated(address amm);

    /** Emitted when a new LiquidVault is authorized */
    event LiquidVaultAdded(address liquidVault);

    /**
     * Called to set this contract up
     * Creation and initialization should be called in a single transaction.
     */
    function initialize(
        address _tokenImplementation,
        address _marketImplementation,
        address _ammImplementation
    ) public override {
        __MarketsRegistry_init(
            _tokenImplementation,
            _marketImplementation,
            _ammImplementation
        );
    }

    /**
     * Initialization function that only allows itself to be called once
     */
    function __MarketsRegistry_init(
        address _tokenImplementation,
        address _marketImplementation,
        address _ammImplementation
    ) internal initializer {
        // Verify addresses
        require(_tokenImplementation != address(0x0), "Invalid _tokenImplementation");
        require(_marketImplementation != address(0x0), "Invalid _marketImplementation");
        require(_ammImplementation != address(0x0), "Invalid _ammImplementation");

        // Save off implementation addresses
        tokenImplementation = _tokenImplementation;
        marketImplementation = _marketImplementation;
        ammImplementation = _ammImplementation;

        // Set up the initialization of the inherited ownable contract
        __Ownable_init();
    }

    /**
     * The owner can update the token implementation address that will be used for future markets
     */
    function updateTokenImplementation(address newTokenImplementation)
        public
        override
        onlyOwner
    {
        require(newTokenImplementation != address(0x0), "Invalid newTokenImplementation");

        // Update the address
        tokenImplementation = newTokenImplementation;

        // Emit the event
        emit TokenImplementationUpdated(tokenImplementation);
    }

    /**
     * The owner can update the market implementation address that will be used for future markets
     */
    function updateMarketImplementation(address newMarketImplementation)
        public
        override
        onlyOwner
    {
        require(newMarketImplementation != address(0x0), "Invalid newMarketImplementation");

        // Update the address
        marketImplementation = newMarketImplementation;

        // Emit the event
        emit MarketImplementationUpdated(marketImplementation);
    }

    /**
     * The owner can update the AMM implementation address that will be used for future AMMs
     */
    function updateAmmImplementation(address newAmmImplementation)
        public
        override
        onlyOwner
    {
        require(newAmmImplementation != address(0x0), "Invalid newAmmImplementation");

        // Update the address
        ammImplementation = newAmmImplementation;

        // Emit the event
        emit AmmImplementationUpdated(ammImplementation);
    }

    /**
     * The owner can update the contract logic address in the proxy itself to upgrade
     */
    function updateMarketsRegistryImplementation(
        address newMarketsRegistryImplementation
    ) public override onlyOwner {
        require(newMarketsRegistryImplementation != address(0x0), "Invalid newMarketsRegistryImplementation");

        // Call the proxiable update
        _updateCodeAddress(newMarketsRegistryImplementation);
    }


    /**
     * The owner can update the contract logic address of a particular Market
     * in the proxy itself to upgrade
     */
    function updateImplementationForMarket(
        IMarket market,
        address newMarketImplementation
    ) public override onlyOwner {
        require(newMarketImplementation != address(0x0), "Invalid newMarketImplementation");

        // Call the proxiable update
        market.updateImplementation(newMarketImplementation);
    }

    /**
     * The owner can create new markets
     */
    function createMarket(
        string calldata _marketName,
        address _collateralToken,
        address _paymentToken,
        IMarket.MarketStyle _marketStyle,
        uint256 _priceRatio,
        uint256 _expirationDate,
        uint16 _exerciseFeeBasisPoints,
        uint16 _closeFeeBasisPoints,
        uint16 _claimFeeBasisPoints,
        address _amm
    ) public override onlyOwner returns (address) {
        require(_collateralToken != address(0x0), "Invalid _collateralToken");
        require(_paymentToken != address(0x0), "Invalid _paymentToken");

        // Verify a market with this name does not exist
        require(
            markets[_marketName] == address(0x0),
            "Market name already registered"
        );

        // Deploy a new proxy pointing at the market impl
        Proxy marketProxy = new Proxy(marketImplementation);
        IMarket newMarket = IMarket(address(marketProxy));

        // Initialize it
        newMarket.initialize(
            _marketName,
            _collateralToken,
            _paymentToken,
            _marketStyle,
            _priceRatio,
            _expirationDate,
            _exerciseFeeBasisPoints,
            _closeFeeBasisPoints,
            _claimFeeBasisPoints,
            tokenImplementation
        );

        // only allow a particular AMM to mint options from this Market
        newMarket.updateRestrictedMinter(address(_amm));

        // Save off the new market
        markets[_marketName] = address(newMarket);

        // Add to list of markets by assets
        bytes32 assetPair = keccak256(abi.encode(address(_collateralToken), address(_paymentToken)));
        marketsByAssets[assetPair].push(address(newMarket));

        // Emit the event
        emit MarketCreated(_marketName, address(newMarket), marketsByAssets[assetPair].length - 1);

        // Return the address of the market that was created
        return address(newMarket);
    }

    /**
     * The owner can create new AMM's for different asset pairs
     */
    function createAmm(
        AggregatorV3Interface _priceOracle,
        IERC20 _paymentToken,
        IERC20 _collateralToken,
        uint16 _tradeFeeBasisPoints,
        bool _shouldInvertOraclePrice
    ) public override onlyOwner returns (address) {
        require(address(_priceOracle) != address(0x0), "Invalid _priceOracle");
        require(address(_paymentToken) != address(0x0), "Invalid _paymentToken");
        require(address(_collateralToken) != address(0x0), "Invalid _collateralToken");

        // Verify a amm with this name does not exist
        bytes32 assetPair = keccak256(abi.encode(address(_collateralToken), address(_paymentToken)));

        require(
            amms[assetPair] == address(0x0),
            "AMM name already registered"
        );

        // Deploy a new proxy pointing at the AMM impl
        Proxy ammProxy = new Proxy(ammImplementation);
        InitializeableAmm newAmm = InitializeableAmm(address(ammProxy));

        newAmm.initialize(
            this,
            _priceOracle,
            _paymentToken,
            _collateralToken,
            tokenImplementation,
            _tradeFeeBasisPoints,
            _shouldInvertOraclePrice
        );

        // Set owner to msg.sender
        newAmm.transferOwnership(msg.sender);

        // Save off the new AMM
        amms[assetPair] = address(newAmm);

        // Emit the event
        emit AmmCreated(address(newAmm));

        // Return the address of the AMM that was created
        return address(newAmm);
    }

    /**
     * The owner can destroy a market (only once the market has closed)
     */
    function selfDestructMarket(IMarket market, address payable refundAddress)
        public
        override
        onlyOwner
    {
        require(refundAddress != address(0x0), "Invalid refundAddress");

        // Get the market pair list that needs to be updated
        bytes32 assetPair = keccak256(abi.encode(address(market.collateralToken()), address(market.paymentToken())));
        require(marketsByAssets[assetPair].length > 0, "Unknown market pair");

        // Remove the market from the list
        bool found = false;
        for(uint i = 0 ; i < marketsByAssets[assetPair].length - 1; i++) {
            // Check to see if the item was found at an index
            if(marketsByAssets[assetPair][i] == address(market)) {
                found = true;
            }
            
            // If the item was already found, then shift elements
            if(found) {
                marketsByAssets[assetPair][i] = marketsByAssets[assetPair][i + 1];
            }
        }

        // If the item was not found, it should be the last item in the list
        if(!found) {
            require(marketsByAssets[assetPair][marketsByAssets[assetPair].length -1] == address(market), "Market not found");            
        }

        // Always remove the last element from the list
        marketsByAssets[assetPair].pop();

        // Remove it from the markets mapping via name lookup
        markets[market.marketName()] = address(0);

        // Destroy the market
        market.selfDestructMarket(refundAddress);

        // Emit the event
        emit MarketDestroyed(address(market));
    }

    function setFeeReceiver(address receiver) public onlyOwner {
        require(receiver != address(0x0), "Invalid fee receiver address");

        feeReceivers[receiver] = true;
    }

    function removeFeeReceiver(address receiver) public onlyOwner {
        require(receiver != address(0x0), "Invalid fee receiver address");

        feeReceivers[receiver] = false;
    }

    /**
     * Allow owner to move tokens from the registry
     */
    function recoverTokens(IERC20 token, address destination)
        public
        override
        // onlyOwner
    {
        require(destination != address(0x0), "Invalid destination");
        require(
            feeReceivers[msg.sender] 
            && feeReceivers[destination] 
            || owner() == msg.sender,
            "Sender and destination address must be an authorized receiver or an owner"
        );
        // Get the balance
        uint256 balance = token.balanceOf(address(this));

        // Sweep out
        token.safeTransfer(destination, balance);

        // Emit the event
        emit TokensRecovered(address(token), destination, balance);
    }

    function getMarketsByAssetPair(bytes32 assetPair)
        public
        view
        override
        returns (address[] memory)
    {
        return marketsByAssets[assetPair];
    }
}
