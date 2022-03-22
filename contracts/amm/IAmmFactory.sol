pragma solidity 0.8.0;

interface IAmmFactory {
    function amms(bytes32 assetPair) external view returns (address);
}
