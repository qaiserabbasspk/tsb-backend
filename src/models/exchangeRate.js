const mongoose = require("mongoose");

// Cached NGN-independent FX rate for an arbitrary (sourceCurrency -> destCurrency)
// pair, since rooms can be listed in any supported currency, not just NGN.
// One document per pair; refreshed lazily by services/currency.js on a 6h TTL.
const exchangeRateSchema = new mongoose.Schema(
  {
    sourceCurrency: { type: String, required: true, uppercase: true },
    destCurrency: { type: String, required: true, uppercase: true },
    rate: { type: Number, required: true },
    markupPercent: { type: Number, default: 0 },
    fetchedAt: { type: Date, required: true },
  },
  {
    versionKey: false,
    toObject: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret._id;
      },
    },
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret._id;
      },
    },
  }
);

exchangeRateSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

// One cached rate per currency pair.
exchangeRateSchema.index({ sourceCurrency: 1, destCurrency: 1 }, { unique: true });

module.exports = mongoose.model("ExchangeRate", exchangeRateSchema);
