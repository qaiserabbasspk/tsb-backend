const mongoose = require("mongoose");
// apartment,condo, duplex house, townhouse etc

const propertyTypeSchema = new mongoose.Schema(
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

propertyTypeSchema.virtual("id").get(function () {
  return this._id.toHexString();
});


module.exports = mongoose.model("PropertyType", propertyTypeSchema);
