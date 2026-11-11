const mongoose = require("mongoose");

// Reference list of real countries/regions/cities, imported once from
// GeoNames (scripts/importGeoNames.js) — independent of our own listings
// catalog. Used by utilities/geoPlaceResolver_utility.js to recognize a
// guest's search as a genuine place (so it scopes strictly to country/city
// and correctly returns zero results for a real place we don't operate in)
// instead of guessing from our own catalog data, which conflates "is this a
// real place?" with "do we have inventory there?" — see that utility's own
// doc comment for the concrete bug this fixes.
//
// Permanent, not cached with a TTL — place names don't expire the way an
// exchange rate does. Re-import to refresh (new countries/cities added to
// GeoNames over time), no automatic invalidation needed.
const geoPlaceSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["country", "region", "city"], required: true },
    name: { type: String, required: true },
    asciiName: { type: String, required: true },
    countryCode: { type: String, required: true },
    countryName: { type: String, required: true },
    // Only meaningful for type: "city" — the admin1 region/state/province it
    // sits in, denormalized here at import time so a city document carries
    // its full hierarchy without a runtime join.
    regionName: { type: String },
    population: { type: Number, default: 0 },
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

geoPlaceSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

geoPlaceSchema.index({ asciiName: 1 });
geoPlaceSchema.index({ type: 1 });

module.exports = mongoose.model("GeoPlace", geoPlaceSchema);
