import "../munged/series/SeriesController.sol";
import "../munged/token/IERC20Lib.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";

contract SeriesControllerHarness is SeriesController {
    ////////////////////////////////////////////////////////////////////////////
    // Overloaded methods (simplifcations) /////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    function getSeriesName(
        address _underlyingToken,
        address _priceToken,
        address _collateralToken,
        uint256 _strikePrice,
        uint40 _expirationDate,
        bool _isPutOption
    ) internal view override returns (string memory) {
        return "";
    }

    function getCollateralPerOptionTokenInternal(
        uint64 _seriesId,
        uint256 _optionTokenAmount,
        uint256 _price
    ) internal view override returns (uint256) {
        Series memory series = allSeries[_seriesId];

        // is it a call option?
        if (!series.isPutOption) {
            // for call options this conversion is simple, because 1 optionToken locks
            // 1 unit of collateral token
            return _optionTokenAmount;
        }

        // we use symbolic value here
        return _optionTokenAmount * _price;
    }

    function getBShare(uint64 seriesId, uint256 optionTokenAmount)
        public
        view
        returns (uint256)
    {
        (uint256 bShare, ) = getSettlementAmounts(seriesId, optionTokenAmount);
        return bShare;
    }

    function getWShare(uint64 seriesId, uint256 optionTokenAmount)
        public
        view
        returns (uint256)
    {
        (, uint256 wShare) = getSettlementAmounts(seriesId, optionTokenAmount);
        return wShare;
    }

    function getShareSum(uint64 seriesId, uint256 optionTokenAmount)
        public
        view
        returns (uint256)
    {
        (uint256 bShare, uint256 wShare) = super.getSettlementAmounts(
            seriesId,
            optionTokenAmount
        );
        return bShare + wShare;
    }

    mapping(uint64 => uint256) bShare;
    mapping(uint64 => uint256) wShare;

    function getSettlementAmounts(uint64 _seriesId, uint256 _optionTokenAmount)
        internal
        view
        override
        returns (uint256, uint256)
    {
        uint256 buyerShare = bShare[_seriesId] * _optionTokenAmount;
        uint256 writerShare = wShare[_seriesId] * _optionTokenAmount;

        // NOTE: this requirement is justified because of the shareSum rule: we
        // verify that the actual implementation of this method in the contract
        // satisfies this property, and therefore it is safe to replace this
        // method with one that returns an arbitrary value satisfying it
        require(
            buyerShare + writerShare ==
                getCollateralPerOptionTokenInternal(
                    _seriesId,
                    _optionTokenAmount,
                    settlementPrice[_seriesId]
                )
        );

        return (buyerShare, writerShare);
    }

    mapping(uint64 => uint256) settlementPrice;
    mapping(uint64 => bool) isSettled;

    function getSettlementPrice(uint64 _seriesId)
        public
        view
        override
        returns (bool, uint256)
    {
        return (isSettled[_seriesId], settlementPrice[_seriesId]);
    }

    function calculateFee(uint256 amount, uint16 basisPoints)
        public
        pure
        override
        returns (uint256)
    {
        return 0;
    }

    // returns the total liabilities for the series, assuming the
    // series is a call option.  In this case, the liabilities are
    // the bShare and wShare of the total supply of bTokens and wTokens
    // (because collateralPerOption is 1).
    function callLiabilities(uint64 seriesId) public view returns (uint256) {
        require(!allSeries[seriesId].isPutOption);
        (uint256 bLiabilities, ) = getSettlementAmounts(
            seriesId,
            bTokenSupply(seriesId)
        );
        (, uint256 wLiabilities) = getSettlementAmounts(
            seriesId,
            wTokenSupply(seriesId)
        );
        return wLiabilities + bLiabilities;
    }

    ////////////////////////////////////////////////////////////////////////////
    // Helper functions for spec file //////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    function callMulSol(uint256 x, uint256 y) public returns (uint256) {
        return x * y;
    }

    function tokenBalanceOf(address token, address user)
        public
        returns (uint256)
    {
        return IERC20(token).balanceOf(user);
    }

    function getVault() public returns (address) {
        return vault;
    }

    function wTokenSupply(uint64 seriesId) public view returns (uint256) {
        uint256 wTokenId = SeriesLibrary.wTokenIndex(seriesId);
        return
            IERC1155Controller(erc1155Controller).optionTokenTotalSupply(
                wTokenId
            );
    }

    function bTokenSupply(uint64 seriesId) public view returns (uint256) {
        uint256 bTokenId = SeriesLibrary.bTokenIndex(seriesId);
        return
            IERC1155Controller(erc1155Controller).optionTokenTotalSupply(
                bTokenId
            );
    }

    function wTokenBalance(uint64 seriesId, address user)
        public
        returns (uint256)
    {
        uint256 wTokenId = SeriesLibrary.wTokenIndex(seriesId);
        return IERC1155Upgradeable(erc1155Controller).balanceOf(user, wTokenId);
    }

    function bTokenBalance(uint64 seriesId, address user)
        public
        returns (uint256)
    {
        uint256 bTokenId = SeriesLibrary.bTokenIndex(seriesId);
        return IERC1155Upgradeable(erc1155Controller).balanceOf(user, bTokenId);
    }

    function isExpired(uint64 seriesId) public returns (bool) {
        return state(seriesId) == SeriesState.EXPIRED;
    }

    function isOpen(uint64 seriesId) public returns (bool) {
        return state(seriesId) == SeriesState.OPEN;
    }

    function getFeeReceiver() public returns (address) {
        return fees.feeReceiver;
    }
}
