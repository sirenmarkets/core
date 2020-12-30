// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";


contract VestingVault {
    using SafeMath for uint256;
    using SafeMath for uint16;

    uint256 constant internal SECONDS_PER_DAY = 86400;

    struct Grant {
        uint256 amount;
        uint16 daysClaimed;
        uint256 totalClaimed;
    }

    event GrantAdded(address indexed recipient, uint256 amount);
    event GrantTokensClaimed(address indexed recipient, uint256 amountClaimed, uint16 daysVested);
    event GrantRemoved(address recipient, uint256 amountVested, uint256 amountNotVested);

    IERC20 public token;
    uint256 public startTime;
    uint16 public vestingDurationInDays;
    uint16 public vestingCliffInDays;

    mapping (address => Grant) public tokenGrants;

    constructor(IERC20 _token, uint256 _startTime, uint16 _vestingDurationInDays, uint16 _vestingCliffInDays) public {
        require(address(_token) != address(0));
        require(_vestingCliffInDays <= 10*365, "more than 10 years");
        require(_vestingDurationInDays <= 25*365, "more than 25 years");
        require(_vestingDurationInDays != 0, "must be non-zero");
        require(_startTime >= now, "not in the past");
        require(_vestingDurationInDays >= _vestingCliffInDays, "Duration < Cliff");

        token = _token;
        startTime = _startTime;
        vestingDurationInDays = _vestingDurationInDays;
        vestingCliffInDays = _vestingCliffInDays;
    }

    function addTokenGrant(
        address _recipient,
        uint256 _amount
    )
        external
    {
        uint256 amountVestedPerDay = _amount.div(vestingDurationInDays);
        require(amountVestedPerDay > 0, "amountVestedPerDay > 0");

        // Transfer the grant tokens under the control of the vesting contract
        require(token.transferFrom(msg.sender, address(this), _amount), "transfer failed");

        Grant memory tokenGrant = tokenGrants[_recipient];
        if (tokenGrant.amount == 0) {
          // Create new grant
          tokenGrant = Grant({
              amount: _amount,
              daysClaimed: 0,
              totalClaimed: 0
          });

          tokenGrants[_recipient] = tokenGrant;
        } else {
          // Add to existing grant
          tokenGrant.amount = uint256(tokenGrant.amount.add(_amount));
        }

        emit GrantAdded(_recipient, _amount);
    }

    /// @notice Calculate the vested and unclaimed months and tokens available for `_recipient` to claim
    /// Due to rounding errors once grant duration is reached, returns the entire left grant amount
    /// Returns (0, 0) if cliff has not been reached
    function calculateGrantClaim(address _recipient) public view returns (uint16, uint256) {
        Grant storage tokenGrant = tokenGrants[_recipient];

        // For grants created with a future start date, that hasn't been reached, return 0, 0
        if (currentTime() < startTime) {
            return (0, 0);
        }

        // Check cliff was reached
        uint elapsedTime = currentTime().sub(startTime);
        uint elapsedDays = elapsedTime.div(SECONDS_PER_DAY);

        if (elapsedDays < vestingCliffInDays) {
            return (uint16(elapsedDays), 0);
        }

        // If over vesting duration, all tokens vested
        if (elapsedDays >= vestingDurationInDays) {
            uint256 remainingGrant = tokenGrant.amount.sub(tokenGrant.totalClaimed);
            return (vestingDurationInDays, remainingGrant);
        } else {
            uint16 daysVested = uint16(elapsedDays.sub(tokenGrant.daysClaimed));
            uint256 amountVestedPerDay = tokenGrant.amount.div(uint256(vestingDurationInDays));
            uint256 amountVested = uint256(daysVested.mul(amountVestedPerDay));
            return (daysVested, amountVested);
        }
    }

    /// @notice Allows a grant recipient to claim their vested tokens. Errors if no tokens have vested
    /// It is advised recipients check they are entitled to claim via `calculateGrantClaim` before calling this
    function claimVestedTokens(address _recipient) external {
        uint16 daysVested;
        uint256 amountVested;
        (daysVested, amountVested) = calculateGrantClaim(_recipient);
        require(amountVested > 0, "amountVested is 0");

        Grant storage tokenGrant = tokenGrants[_recipient];
        tokenGrant.daysClaimed = uint16(tokenGrant.daysClaimed.add(daysVested));
        tokenGrant.totalClaimed = uint256(tokenGrant.totalClaimed.add(amountVested));

        require(token.transfer(_recipient, amountVested), "no tokens");
        emit GrantTokensClaimed(_recipient, amountVested, daysVested);
    }

    function currentTime() private view returns(uint256) {
        return block.timestamp;
    }
}
