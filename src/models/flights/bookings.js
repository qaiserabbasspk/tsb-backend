const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    booking_ref_no: {
      type: String,
      default: null,
      index: true
    },

    module_type: {
      type: String,
      required: true,
      trim: true
    },

    flight_type: {
      type: String,
      default: null,
      trim: true
    },

    booking_date: {
      type: Date,
      required: true
    },

    booking_status: {
      type: String,
      enum: [
        "Confirmed",
        "Pending",
        "Cancelled",
        "Rejected"
      ],
      default: "Pending",
      required: true
    },

    pnr: {
      type: String,
      default: null,
      trim: true
    },

    bookedseat: {
      type: String,
      default: null
    },

    order_number: {
      type: String,
      default: null,
      index: true
    },

    booking_additional_notes: {
      type: String,
      default: null
    },

    price_original: {
      type: Number,
      required: true,
      min: 0
    },

    baggagetotalPrice: {
      type: String,
      default: null
    },

    price_markup: {
      type: String,
      default: null
    },

    agent_markup_price: {
      type: String,
      default: null
    },

    agent_net_profit: {
      type: String,
      default: null
    },

    agent_markup_percent: {
      type: Number,
      default: null
    },

    checkin: {
      type: String,
      default: null
    },

    checkout: {
      type: String,
      default: null
    },

    booking_nights: {
      type: Number,
      default: null
    },

    adults: {
      type: Number,
      default: 1,
      min: 0
    },

    childs: {
      type: Number,
      default: 0,
      min: 0
    },

    infants: {
      type: Number,
      default: 0,
      min: 0
    },

    currency_original: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },

    currency_markup: {
      type: String,
      default: null,
      trim: true,
      uppercase: true
    },

    payment_date: {
      type: Date,
      default: null
    },

    cancellation_request: {
      type: Number,
      default: 0
    },

    cancellation_status: {
      type: Number,
      default: 0
    },

    booking_data: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },

    booking_response: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },

    error_response: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },

    payment_status: {
      type: String,
      enum: [
        "paid",
        "unpaid",
        "refunded"
      ],
      default: "unpaid",
      required: true
    },

    supplier: {
      type: String,
      required: true,
      trim: true
    },

    transaction_id: {
      type: String,
      default: null,
      index: true
    },

    user_id: {
      type: String,
      default: null,
      index: true
    },

    user_data: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },

    guest: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },

    nationality: {
      type: String,
      default: null,
      trim: true
    },

    routes: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },

    payment_gateway: {
      type: String,
      default: null,
      trim: true
    }
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  }
);

/*
|--------------------------------------------------------------------------
| Indexes
|--------------------------------------------------------------------------
*/

bookingSchema.index({ booking_ref_no: 1 });
bookingSchema.index({ booking_status: 1 });
bookingSchema.index({ payment_status: 1 });
bookingSchema.index({ created_at: -1 });
bookingSchema.index({ transaction_id: 1 });


const flightBookingSchema = new mongoose.Schema({
    // ... your schema fields
    booking_ref_no: String,
    booking_status: String,
    payment_status: String,
});

const Booking = mongoose.model("Booking", bookingSchema);

module.exports = Booking;