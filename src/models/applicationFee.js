const mongoose = require("mongoose");
// lease,rent,repair fee, application fee , late fee, parking, security, other

const applicationFeeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
    },
    description: {
      type: String,
    },
    amount: {
      type: Number,
    },
    currency: {
      // type: mongoose.Schema.Types.ObjectId,
      // ref: "Currency",
      type: String,
    },
    chargeTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChargeType",
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
      transform: function (doc, ret) {
        delete ret._id;
        delete ret.chargeTypeId;
        // delete ret.currencyId;

      },
    },
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret._id;
        delete ret.chargeTypeId;
        // delete ret.currencyId;

      },
    },
  }
);

applicationFeeSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

applicationFeeSchema.virtual("chargeType", {
  ref: "ChargeType",
  localField: "chargeTypeId",
  foreignField: "_id",
  justOne: true,
});

// applicationFeeSchema.virtual("currency", {
//   ref: "Currency",
//   localField: "currencyId",
//   foreignField: "_id",
//   justOne: true,
// });

module.exports = mongoose.model("ApplicationFee", applicationFeeSchema);
