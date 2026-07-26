import assert from "node:assert/strict";
import test from "node:test";
import { getRequestClientIp } from "../lib/request-ip";

function withIpEnv(
  values: { trustedHeader?: string; trustedProxyCount?: string },
  run: () => void,
) {
  const previousHeader = process.env.TRUSTED_CLIENT_IP_HEADER;
  const previousProxyCount = process.env.TRUSTED_PROXY_COUNT;

  if (values.trustedHeader === undefined) {
    delete process.env.TRUSTED_CLIENT_IP_HEADER;
  } else {
    process.env.TRUSTED_CLIENT_IP_HEADER = values.trustedHeader;
  }
  if (values.trustedProxyCount === undefined) {
    delete process.env.TRUSTED_PROXY_COUNT;
  } else {
    process.env.TRUSTED_PROXY_COUNT = values.trustedProxyCount;
  }

  try {
    run();
  } finally {
    if (previousHeader === undefined) delete process.env.TRUSTED_CLIENT_IP_HEADER;
    else process.env.TRUSTED_CLIENT_IP_HEADER = previousHeader;
    if (previousProxyCount === undefined) delete process.env.TRUSTED_PROXY_COUNT;
    else process.env.TRUSTED_PROXY_COUNT = previousProxyCount;
  }
}

test("client IP ignores untrusted Cloudflare and X-Real-IP headers", () => {
  withIpEnv({}, () => {
    const request = new Request("https://pay.example.test", {
      headers: {
        "cf-connecting-ip": "10.0.0.8",
        "x-real-ip": "10.0.0.9",
        "x-forwarded-for": "198.51.100.7, 203.0.113.12",
      },
    });

    assert.equal(getRequestClientIp(request), "203.0.113.12");
  });
});

test("client IP uses only the configured edge-injected header", () => {
  withIpEnv({ trustedHeader: "x-novapay-client-ip" }, () => {
    const request = new Request("https://pay.example.test", {
      headers: {
        "x-novapay-client-ip": "192.0.2.44",
        "cf-connecting-ip": "10.0.0.8",
        "x-forwarded-for": "10.0.0.9",
      },
    });

    assert.equal(getRequestClientIp(request), "192.0.2.44");
  });
});

test("client IP selects the configured trusted hop from the right", () => {
  withIpEnv({ trustedProxyCount: "2" }, () => {
    const request = new Request("https://pay.example.test", {
      headers: { "x-forwarded-for": "198.51.100.1, 203.0.113.2, 192.0.2.3" },
    });

    assert.equal(getRequestClientIp(request), "203.0.113.2");
  });
});

test("client IP rejects malformed trusted-header values", () => {
  withIpEnv({ trustedHeader: "x-novapay-client-ip" }, () => {
    const request = new Request("https://pay.example.test", {
      headers: { "x-novapay-client-ip": "192.0.2.44, 10.0.0.1" },
    });

    assert.equal(getRequestClientIp(request), null);
  });
});
