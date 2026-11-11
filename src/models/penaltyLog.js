const mongoose = require("mongoose");

const penaltyLogSchema = new mongoose.Schema({
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Invoice",
    required: true,
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tenant",
    required: true,
  },
  penaltyAmount: {
    type: Number,
    required: true,
  },
  penaltyRate: {
    type: Number, required: true
  },
  penaltyweek: {
    type: String, required: true
  },
  appliedOn: {
    type: Date,
    default: Date.now,
  },
},
  {
    versionKey: false,
    toObject: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret._id;
        delete ret.tenantId;
        delete ret.invoiceId;
      },
    },
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret._id;
        delete ret.tenantId;
        delete ret.invoiceId;
      },
    },
  }
);

penaltyLogSchema.virtual("tenant", {
  ref: "Tenant",
  localField: "tenantId",
  foreignField: "_id",
  justOne: true,
});

penaltyLogSchema.virtual("invoice", {
  ref: "Invoice",
  localField: "invoiceId",
  foreignField: "_id",
  justOne: true,
});

module.exports = mongoose.model("PenaltyLog", penaltyLogSchema);