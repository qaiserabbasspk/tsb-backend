const mongoose = require("mongoose");
// residential,commercial,mixed use,land, industrial etc

const propertyCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      unix: true,
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

propertyCategorySchema.virtual("id").get(function () {
  return this._id.toHexString();
});

module.exports = mongoose.model("PropertyCategory", propertyCategorySchema);
