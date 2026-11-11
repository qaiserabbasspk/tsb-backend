const mongoose = require("mongoose");

const propertySchema = new mongoose.Schema(
  {
    code: { type: String },
    description: { type: String },
    yearBuilt: { type: Number },
    image: { type: String },
    status: { type: Number },
    address: {
      city: { type: String },
      state: { type: String },
      zipcode: { type: String },
    },
    propertyCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PropertyCategory"
    },
    propertyTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PropertyType"
    },
    propertyOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PropertyOwner"
    },
    ownerCode: { type: String },
    createdOn: { type: Date, immutable: true },
    updatedOn: { type: Date },
  },
  {
    versionKey: false,
    toObject: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret._id;
        delete ret.propertyTypeId;
        delete ret.propertyOwnerId;
        delete ret.propertyCategoryId;
      },
    },
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret._id;
        delete ret.propertyTypeId;
        delete ret.propertyOwnerId;
        delete ret.propertyCategoryId;
      },
    },
  }
);

propertySchema.virtual("owner", {
  ref: "PropertyOwner",
  localField: "propertyOwnerId",
  foreignField: "_id",
  justOne: true,
});

propertySchema.virtual("category", {
  ref: "PropertyCategory",
  localField: "propertyCategoryId",
  foreignField: "_id",
  justOne: true,
});

propertySchema.virtual("propertyType", {
  ref: "PropertyType",
  localField: "propertyTypeId",
  foreignField: "_id",
  justOne: true,
});

module.exports = mongoose.model("Property", propertySchema);
