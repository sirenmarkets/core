pragma solidity 0.6.12;

interface IDelegatableERC20 {
    function delegate(address delegatee) external;
}