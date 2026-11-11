const Room = require("../../models/rooms");
const Response = require("../../utilities/response_utility");
const { recordPendingCheckout } = require("../../utilities/pendingReservationCheckout_utility");

module.exports = {
    /**
     * Records the booking a guest is about to pay for via Flutterwave —
     * "payment attempt", not "checkout", to keep this unambiguous from the
     * guest's own stay checkIn/checkOut dates. Unlike OPay, Flutterwave's
     * checkout opens entirely client-side (FlutterwaveCheckout(...), no
     * server call to create an order first) — this endpoint exists purely to
     * give the webhook something to finalize from if the guest's browser
     * never makes it back after paying. Called right before the widget
     * opens; must succeed before payment starts, same as OPay's
     * initiate() already requires.
     */
    recordFlutterwavePending: async (req, res) => {
        try {
            const { roomId, txRef, booking } = req.body || {};

            if (!roomId || !txRef) {
                return Response.errorResponse(res, 400, "roomId and txRef are required.");
            }

            const room = await Room.findById(roomId).select("_id");
            if (!room) {
                return Response.errorResponse(res, 404, "Room not found.");
            }

            const result = await recordPendingCheckout({ txRef, roomId, paymentProvider: "flutterwave", booking, req });
            if (!result.ok) {
                return Response.errorResponse(res, 400, result.message);
            }

            return Response.successResponse(res, 200, { success: true });
        } catch (err) {
            console.error("[Payment Attempt] Failed to record pending Flutterwave payment:", err.message);
            return Response.errorResponse(res, 502, "Could not start checkout — please try again.");
        }
    },
};
