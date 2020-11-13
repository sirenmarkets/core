pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "./SimpleToken.sol";
import "./ILPToken.sol";

/**
 * This is a token contract that can track a separate token as a dividend to all LP token holders.
 * Every time a transfer is performed of the LP token, it will check to see if the token holders
 * (both sending and receiving addresses) are owed any dividends.  If so, it will send them out and
 * reset the baseline "points owed" to each account.  This value is then used in the future to see if
 * more dividends have accrued.  Minting and Burning also trigger
 */
contract LPToken is SimpleToken, ILPToken {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    uint256 internal constant pointMultiplier = 10**18;

    uint256 internal _totalPoints;
    mapping(address => uint256) internal _distributionPoints;

    IERC20 public distributionToken = IERC20(address(0));

    /**
     * Initialize tokens with standard ERC20 info plus the dividend token
     */
    function initialize(
        string memory name,
        string memory symbol,
        uint8 decimals,
        address _distributionToken
    ) public override {
        require(address(distributionToken) == address(0), "already init");
        distributionToken = IERC20(_distributionToken);

        SimpleToken.initialize(name, symbol, decimals);
    }

    /**
     * Public getter to see how many dividend tokens are in the contract
     */
    function unclaimed() public view returns (uint256) {
        return distributionToken.balanceOf(address(this));
    }

    /** Send tokens as distributions */
    function _distributeDividend(address _account, uint256 _outstanding)
        internal
    {
        distributionToken.safeTransfer(_account, _outstanding);
    }

    /** Pulls in dividend token */
    function _ensureFunding(uint256 _amount) internal {
        distributionToken.safeTransferFrom(
            _msgSender(),
            address(this),
            _amount
        );
    }

    /**
     * Called when distributions are sent as dividends to all LP token holders
     * DO NOT just send tokens into this contract and expect them to be distributed
     */
    function sendDistributionFunds(uint256 _amount) public override {
        _ensureFunding(_amount);
        _totalPoints = _totalPoints.add(
            _amount.mul(pointMultiplier).div(totalSupply())
        );
    }

    //
    // Distribution Logic
    //

    function _outstandingPoints(address _account)
        internal
        view
        returns (uint256)
    {
        if (_account == address(this)) {
            return 0;
        }
        uint256 _outstanding = _totalPoints.sub(_distributionPoints[_account]);
        return (balanceOf(_account).mul(_outstanding)).div(pointMultiplier);
    }

    function _runDistributions(address _account) internal {
        uint256 _outstanding = _outstandingPoints(_account);

        // Send out tokens if they are owed
        if (_outstanding > 0) {
            /* NB: This is the part where we actually distribute */
            _distributeDividend(_account, _outstanding);
        }

        // Always set the current points if it is not already set
        if (_distributionPoints[_account] != _totalPoints) {
            _distributionPoints[_account] = _totalPoints;
        }
    }

    //
    // Extend ERC20 to avoid bricking things
    //

    // make sure that errors in _distribution issuance can't lock an account
    function transferDividend(address _recipient) public returns (bool) {
        uint256 _outstanding = _outstandingPoints(_msgSender());
        _distributionPoints[_msgSender()] = _totalPoints;
        _distributeDividend(_recipient, _outstanding);
    }

    //
    // ERC20 functions wrapped with _runDistributions()
    //
    function transfer(address recipient, uint256 amount)
        public
        override(ERC20UpgradeSafe, IERC20)
        returns (bool)
    {
        _runDistributions(_msgSender());
        _runDistributions(recipient);
        return ERC20UpgradeSafe.transfer(recipient, amount);
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public override(ERC20UpgradeSafe, IERC20) returns (bool) {
        _runDistributions(sender);
        _runDistributions(recipient);
        return ERC20UpgradeSafe.transferFrom(sender, recipient, amount);
    }

    function mint(address account, uint256 amount)
        public
        override(ISimpleToken, SimpleToken)
    {
        _runDistributions(account);
        return SimpleToken.mint(account, amount);
    }

    function burn(address account, uint256 value)
        public
        override(ISimpleToken, SimpleToken)
    {
        _runDistributions(account);
        return SimpleToken.burn(account, value);
    }
}
