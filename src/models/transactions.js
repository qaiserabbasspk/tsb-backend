const mongoose = require("mongoose");
const { Schema } = mongoose;

// Define the base transaction schema
const transactionSchema = new mongoose.Schema(
  {
    contractId: {
      type: Schema.Types.ObjectId,
      ref: "Contract",
    },
    ownerCode: {
      type: String,
    },
    currency: { type: String },
    status: { type: String },
    accountId: { type: Schema.Types.ObjectId, ref: "Account" },
    accnumber: {
      type: String
    },
    transactionDate: { type: Date },
    paymentTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentType",
    },
    credit: { type: Number },
    debit: { type: Number },
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
  },
  { discriminatorKey: "PaymentType" }
);

transactionSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

transactionSchema.virtual("paymentType", {
  ref: "PaymentType",
  localField: "paymentTypeId",
  foreignField: "_id",
  justOne: true,
});

transactionSchema.virtual("account", {
  ref: "Account",
  localField: "accountId",
  foreignField: "_id",
  justOne: true,
});

transactionSchema.virtual("contract", {
  ref: "Contract",
  localField: "contractId",
  foreignField: "_id",
  justOne: true,
});

const Transaction = mongoose.model("Transaction", transactionSchema);

const fullPaymentSchema = new Schema({
  // No additional fields required for FullPayment
});

const FullPayment = Transaction.discriminator("FullPayment", fullPaymentSchema);

const installmentSchema = new Schema({
  duration: { type: Number, required: true },
  percentage: { type: Number, required: true },
  numberOfInstallments: { type: Number, required: false },
  downPaymentPercentage: { type: Number, required: false }, // Optional percentage field
});

const Installment = Transaction.discriminator("Installment", installmentSchema);

module.exports = {
  Transaction,
  FullPayment,
  Installment,
};
