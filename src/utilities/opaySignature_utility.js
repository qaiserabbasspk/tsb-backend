const crypto = require("crypto");

/**
 * Canonical JSON string with object keys sorted alphabetically at every
 * level (OPay's docs say "sort your request payload JSON according to the
 * alphabetical order of the request keys" without specifying nested
 * objects explicitly — sorting recursively is the safer reading of that,
 * and was confirmed against a live create-order call, see
 * OPAY_INTEGRATION_PLAN.md).
 */
function canonicalJson(value) {
    if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(",")}]`;
    }
    if (value && typeof value === "object") {
        const keys = Object.keys(value).sort();
        return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
    }
    return JSON.stringify(value);
}

/** HMAC-SHA512 signature (hex) of the sorted request body, signed with the OPay private key. */
function signOpayRequest(body, privateKey) {
    const sorted = canonicalJson(body);
    const signature = crypto.createHmac("sha512", privateKey).update(sorted).digest("hex");
    return { signature, sorted };
}

module.exports = { canonicalJson, signOpayRequest };
