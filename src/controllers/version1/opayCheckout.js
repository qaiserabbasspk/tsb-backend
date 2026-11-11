const axios = require("axios");
const Room = require("../../models/rooms");
const Response = require("../../utilities/response_utility");
const { recordPendingCheckout } = require("../../utilities/pendingReservationCheckout_utility");

const NAIRA_TO_KOBO = 100;

function opayBaseUrl() {
    return process.env.OPAY_MODE === "live"
        ? "https://liveapi.opaycheckout.com"
        : "https://testapi.opaycheckout.com";
}

module.exports = {
    /**
     * Creates an OPay Cashier order server-side (keys never reach the
     * frontend) and returns the hosted `cashierUrl` for the guest to be
     * redirected to. `amount` is the frontend's own computed total (whole
     * NGN, same value it would otherwise send to Flutterwave) — trusted
     * here the same way Flutterwave's inline widget trusts a client-supplied
     * amount for initiating a charge. The actual source of truth is
     * `reservation.js`'s independent server-side re-verification once the
     * guest comes back, exactly mirroring how Flutterwave charges are
     * handled today.
     */
    initiate: async (req, res) => {
        try {
            const { roomId, txRef, amount, booking } = req.body || {};

            if (!roomId || !txRef || !amount || Number(amount) <= 0) {
                return Response.errorResponse(res, 400, "roomId, txRef and a positive amount are required.");
            }

            const room = await Room.findById(roomId).select("title");
            if (!room) {
                return Response.errorResponse(res, 404, "Room not found.");
            }

            // Snapshot of the booking the guest is about to pay for — the ONLY
            // record of it until the guest's browser makes it back to
            // finalize. Without this, OPay's webhook (which can arrive before
            // that happens) has no way to create the reservation on its own.
            // Required, not best-effort: proceeding without it would silently
            // reintroduce that exact gap.
            const pendingResult = await recordPendingCheckout({ txRef, roomId, paymentProvider: "opay", booking, req });
            if (!pendingResult.ok) {
                return Response.errorResponse(res, 400, pendingResult.message);
            }

            const publicKey = process.env.OPAY_PUBLIC_KEY;
            const privateKey = process.env.OPAY_PRIVATE_KEY;
            const merchantId = process.env.OPAY_MERCHANT_ID;
            if (!publicKey || !privateKey || !merchantId) {
                console.error("[OPay] OPAY_PUBLIC_KEY/OPAY_PRIVATE_KEY/OPAY_MERCHANT_ID not configured");
                return Response.errorResponse(res, 503, "OPay is not available right now — please try another payment method.");
            }

            const frontendUrl = process.env.FRONTEND_URL || "https://quickbooking.org";
            const backendUrl = process.env.BACKEND_URL || "https://www.rentrack.shop";

            const body = {
                reference: txRef,
                country: "NG",
                amount: {
                    total: Math.round(Number(amount) * NAIRA_TO_KOBO),
                    currency: "NGN",
                },
                returnUrl: `${frontendUrl}/booking-confirmed?id=${encodeURIComponent(roomId)}&tx_ref=${encodeURIComponent(txRef)}&provider=opay`,
                callbackUrl: `${backendUrl}/api/v1/webhook/opay`,
                product: {
                    name: "QuickBooking reservation",
                    description: room.title || "Room reservation payment",
                },
            };

            // Confirmed correct against both OPay's sandbox (2026-08-24, see
            // OPAY_INTEGRATION_PLAN.md) and OPay's live API (2026-09-07,
            // this session) — cashier/create authenticates with the raw
            // public key as a bearer token, not a computed signature.
            const { data: opayResponse } = await axios.post(
                `${opayBaseUrl()}/api/v1/international/cashier/create`,
                body,
                {
                    headers: {
                        Authorization: `Bearer ${publicKey}`,
                        MerchantId: merchantId,
                        "Content-Type": "application/json",
                    },
                    timeout: 10000,
                }
            );

            if (opayResponse.code !== "00000" || !opayResponse.data?.cashierUrl) {
                console.error("[OPay] Create order failed:", opayResponse.code, opayResponse.message);
                return Response.errorResponse(res, 502, "Could not start OPay checkout — please try another payment method.");
            }

            return Response.successResponse(res, 200, {
                success: true,
                cashierUrl: opayResponse.data.cashierUrl,
                reference: opayResponse.data.reference,
                orderNo: opayResponse.data.orderNo,
            });
        } catch (err) {
            console.error("[OPay] initiate failed:", err.response?.data || err.message);
            return Response.errorResponse(res, 502, "Could not start OPay checkout — please try another payment method.");
        }
    },
};
