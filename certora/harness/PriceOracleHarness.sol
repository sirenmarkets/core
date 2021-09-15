import "../munged/series/PriceOracle.sol";
import "./Oracle.sol";

contract PriceOracleHarness is PriceOracle {
    function getOracleAnswer(address underlying, address currency)
        external
        view
        returns (int256)
    {
        return Oracle(oracles[underlying][currency]).answer();
    }

    /** Overloaded functions assumed to be safe *******************************/

    function updateImplementation(address newPriceOracleImpl)
        external
        view
        override
    {}

    function renounceOwnership() public view override {}

    function transferOwnership(address owner) public view override {}
}
