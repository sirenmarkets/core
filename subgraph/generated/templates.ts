// THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.

import {
  Address,
  DataSourceTemplate,
  DataSourceContext
} from "@graphprotocol/graph-ts";

export class SimpleToken extends DataSourceTemplate {
  static create(address: Address): void {
    DataSourceTemplate.create("SimpleToken", [address.toHex()]);
  }

  static createWithContext(address: Address, context: DataSourceContext): void {
    DataSourceTemplate.createWithContext(
      "SimpleToken",
      [address.toHex()],
      context
    );
  }
}

export class Amm extends DataSourceTemplate {
  static create(address: Address): void {
    DataSourceTemplate.create("Amm", [address.toHex()]);
  }

  static createWithContext(address: Address, context: DataSourceContext): void {
    DataSourceTemplate.createWithContext("Amm", [address.toHex()], context);
  }
}
