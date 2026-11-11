const mongoose = require("mongoose");

const currenciesSchema = new mongoose.Schema(
  {
    order: {
      type: String,
    },
    name: {
      type: String,
      unique: true,
    },
    symbol: {
      type: String,
    },
    status: {
      type: Number,
    },
    ownerCode: {
      type: String,
    },
    createdOn: {
      type: Date,
      immutable: true,
    },
    updatedOn: {
      type: Date,
    },
  },
  {
    versionKey: false,
    toObject: {
      virtuals: true,
    },
    toJSON: {
      virtuals: true,
    },
  }
);

currenciesSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

module.exports = mongoose.model("Currency", currenciesSchema);
