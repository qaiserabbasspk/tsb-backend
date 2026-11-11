const mongoose = require("mongoose");

const propertyUnitSchema = new mongoose.Schema(
  {
    code: { type: String },
    status: { type: Number },
    name: { type: String },
    description: { type: String },
    ownerCode: { type: String, },
    currency: { type: String },
    price: { type: Number },
    size: { type: Number },
    unit: { type: String },
    bedRoom: { type: Number },
    bathRoom: { type: Number },
    kitchen: { type: Number },
    parking: { type: Number },
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property"
    },
    propertyStatusId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PropertyStatus"
    },
    gallery: [
      {
        name: {
          type: String
        },
        _id: false
      }
    ],
    createdOn: { type: Date, immutable: true },
    updatedOn: { type: Date },
  },
  {
    versionKey: false,
    toObject: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret._id;
        delete ret.propertyId;
        delete ret.propertyStatusId;
      },
    },
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret._id;
        delete ret.propertyId;
        delete ret.propertyStatusId;
      },
    },
  }
);

propertyUnitSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

propertyUnitSchema.virtual("property", {
  ref: "Property",
  localField: "propertyId",
  foreignField: "_id",
  justOne: true,
});

propertyUnitSchema.virtual("availabilityStatus", {
  ref: "PropertyStatus",
  localField: "propertyStatusId",
  foreignField: "_id",
  justOne: true,
});

module.exports = mongoose.model("PropertyUnit", propertyUnitSchema);
