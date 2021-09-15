import "../munged/series/ERC1155Controller.sol";

contract ERC1155ControllerHarness is ERC1155Controller {
    // SMT solver can't work with bytes and the mint function doesn't actually use these
    function SMTSafe_mint(
        address to,
        uint256 id,
        uint256 amount
    ) public {
        bytes memory data;
        mint(to, id, amount, data);
    }

    function SMTSafe_mintBatch(
        address to,
        uint256[] memory ids,
        uint256[] memory amounts
    ) public {
        bytes memory data;
        mintBatch(to, ids, amounts, data);
    }

    function isOwner() public returns (bool) {
        return hasRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }
}
