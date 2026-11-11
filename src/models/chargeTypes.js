const mongoose = require("mongoose");
// lease,rent,repair fee, application fee , late fee, parking, security, other

const chargeTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
    },
    description: {
      type: String,
    },
    status: {
      type: Number,
    },
    ownerCode: {
      type: String,
    },
    accountType: {
      type: String,
      // type: mongoose.Schema.Types.ObjectId,
      // ref: "AccountType",
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

chargeTypeSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

module.exports = mongoose.model("ChargeType", chargeTypeSchema);
