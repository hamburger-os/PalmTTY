import assert from "node:assert/strict";
import test from "node:test";
import {
  developmentWebOrigins,
  isPrivateDevelopmentIpv4,
  privateLanIpv4Addresses
} from "./dev-network.mjs";

test("private development IPv4 classification is bounded", () => {
  for (const address of [
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.254",
    "192.168.31.3",
    "169.254.10.20",
    "100.64.0.1",
    "100.127.255.254"
  ]) {
    assert.equal(isPrivateDevelopmentIpv4(address), true, address);
  }

  for (const address of [
    "8.8.8.8",
    "172.15.255.255",
    "172.32.0.1",
    "100.63.255.255",
    "100.128.0.1",
    "10..1.2",
    "not-an-ip"
  ]) {
    assert.equal(isPrivateDevelopmentIpv4(address), false, address);
  }
});

test("LAN address discovery ignores public, internal, and IPv6 entries", () => {
  const interfaces = {
    Ethernet: [
      {
        address: "192.168.31.3",
        family: "IPv4",
        internal: false
      },
      {
        address: "8.8.8.8",
        family: "IPv4",
        internal: false
      }
    ],
    Tailscale: [
      {
        address: "100.90.80.70",
        family: 4,
        internal: false
      }
    ],
    Loopback: [
      {
        address: "127.0.0.1",
        family: "IPv4",
        internal: true
      },
      {
        address: "::1",
        family: "IPv6",
        internal: true
      }
    ]
  };

  assert.deepEqual(privateLanIpv4Addresses(interfaces), [
    "100.90.80.70",
    "192.168.31.3"
  ]);
});

test("default wildcard listener produces only exact loopback and private origins", () => {
  const interfaces = {
    Ethernet: [{
      address: "192.168.31.3",
      family: "IPv4",
      internal: false
    }],
    Public: [{
      address: "203.0.113.9",
      family: "IPv4",
      internal: false
    }]
  };

  assert.deepEqual(developmentWebOrigins("0.0.0.0", interfaces), [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://192.168.31.3:5173"
  ]);
});

test("explicit development host does not broaden to other LAN interfaces", () => {
  const interfaces = {
    Ethernet: [{
      address: "192.168.31.3",
      family: "IPv4",
      internal: false
    }]
  };

  assert.deepEqual(developmentWebOrigins("127.0.0.1", interfaces), [
    "http://127.0.0.1:5173",
    "http://localhost:5173"
  ]);
});
