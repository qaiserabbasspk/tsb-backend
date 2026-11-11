const axios = require("axios");
const { signOpayRequest } = require("./opaySignature_utility");

const NAIRA_TO_KOBO = 100;

function opayBaseUrl() {
    return process.env.OPAY_MODE === "live"
        ? "https://liveapi.opaycheckout.com"
        : "https://testapi.opaycheckout.com";
}

/**
 * Verifies an OPay Cashier order against OPay's own status endpoint.
 * Returns { valid, status, amount, currency, reference } or { valid: false, reason }.
 *
 * expectedAmount is in whole NGN (matching this codebase's convention
 * everywhere else) — OPay's `amount.total` is in kobo (100 kobo = 1 NGN,
 * confirmed via OPay's "Regional Payment Methods" docs), converted here so
 * callers never have to think about the unit split.
 */
async function verifyOpayTransaction(reference, expectedAmount) {
    const privateKey = process.env.OPAY_PRIVATE_KEY;
    const publicKey = process.env.OPAY_PUBLIC_KEY;
    const merchantId = process.env.OPAY_MERCHANT_ID;

    if (!privateKey || !publicKey || !merchantId) {
        console.error("[OPay] OPAY_PRIVATE_KEY/OPAY_PUBLIC_KEY/OPAY_MERCHANT_ID not set — skipping verification");
        return { valid: false, reason: "Payment verification not configured" };
    }

    if (!reference) {
        return { valid: false, reason: "Reference is required to verify payment" };
    }

    const body = { reference, country: "NG" };

    try {
        // Status/query calls sign with the private key per OPay's docs — unlike
        // cashier/create, which (per those same docs, inconsistently) may use
        // the raw public key instead. See opayCheckout.js for that unresolved
        // half; this one is the more consistently-documented side.
        const { signature } = signOpayRequest(body, privateKey);

        const { data: responseBody } = await axios.post(
            `${opayBaseUrl()}/api/v1/international/cashier/status`,
            body,
            {
                headers: {
                    Authorization: `Bearer ${signature}`,
                    MerchantId: merchantId,
                    "Content-Type": "application/json",
                },
                timeout: 10000,
            }
        );

        if (responseBody.code !== "00000") {
            return { valid: false, reason: `OPay returned code ${responseBody.code}: ${responseBody.message || "unknown error"}` };
        }

        const txData = responseBody.data;
        const status = String(txData?.status || "").toUpperCase();

        if (status !== "SUCCESS") {
            return { valid: false, reason: `Transaction status is ${status || "unknown"}` };
        }

        if (txData.reference !== reference) {
            return { valid: false, reason: "Transaction reference mismatch" };
        }

        const paidCurrency = String(txData.amount?.currency || "").trim().toUpperCase();
        if (paidCurrency !== "NGN") {
            return { valid: false, reason: `Currency mismatch — expected NGN, got ${paidCurrency || "none"}` };
        }

        const paidKobo = Number(txData.amount?.total ?? 0);
        const paidNaira = paidKobo / NAIRA_TO_KOBO;
        const expectedKobo = Math.round(Number(expectedAmount) * NAIRA_TO_KOBO);

        if (paidKobo < expectedKobo) {
            return { valid: false, reason: `Amount mismatch — expected ${expectedAmount} NGN, got ${paidNaira} NGN` };
        }

        return {
            valid: true,
            status,
            amount: paidNaira,
            currency: "NGN",
            reference: txData.reference,
            orderNo: txData.orderNo,
        };
    } catch (err) {
        console.error("[OPay] Verification request failed:", err.response?.data || err.message);
        return { valid: false, reason: "Could not reach OPay to verify payment" };
    }
}

module.exports = { verifyOpayTransaction };
