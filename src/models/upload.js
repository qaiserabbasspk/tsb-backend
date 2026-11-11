const mongoose = require("mongoose");

const uploadSchema = new mongoose.Schema(
  {
    name: {
      type: String,
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

uploadSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

module.exports = mongoose.model("Upload", uploadSchema);
