const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000"
const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000"

/**
 * Ensure 2 address lists are the exact same list
 * @param {*} addrList1
 * @param {*} addrList2
 */
const assertNonzeroAddressesMatch = (addrList1, addrList2) => {
  // Verify the lengths match
  assert.equal(addrList1.length, addrList2.length)

  // Interate over the items
  for (let i = 0; i < addrList1.length; i++) {
    // Ensure it is not the zero address
    assert.notEqual(addrList1[i], ADDRESS_ZERO)
    // Ensure the index matches on the 2 arrays
    assert.equal(addrList1[i], addrList2[i])
  }
}

export default {
  ADDRESS_ZERO,
  ZERO_BYTES32,
  assertNonzeroAddressesMatch,
}
