const crypto = require("crypto");
const { canonicalJson, signOpayRequest } = require("./opaySignature_utility");

describe("canonicalJson", () => {
    test("sorts top-level keys alphabetically", () => {
        expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    });

    test("sorts nested object keys too", () => {
        expect(canonicalJson({ b: { d: 1, c: 2 }, a: 3 })).toBe(
            '{"a":3,"b":{"c":2,"d":1}}'
        );
    });

    test("preserves array order", () => {
        expect(canonicalJson({ b: [3, 1, 2], a: 1 })).toBe('{"a":1,"b":[3,1,2]}');
    });
});

describe("signOpayRequest", () => {
    test("produces an HMAC-SHA512 hex signature over the sorted body", () => {
        const body = { b: 1, a: 2 };
        const { signature, sorted } = signOpayRequest(body, "secret");
        expect(sorted).toBe('{"a":2,"b":1}');
        expect(signature).toBe(
            crypto.createHmac("sha512", "secret").update(sorted).digest("hex")
        );
    });

    test("key order in the input object doesn't affect the signature", () => {
        const a = signOpayRequest({ x: 1, y: 2 }, "secret");
        const b = signOpayRequest({ y: 2, x: 1 }, "secret");
        expect(a.signature).toBe(b.signature);
    });
});
