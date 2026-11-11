const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
    },
    category: {
      type: String,
    },
    status: {
      type: Number,
    },
    createdOn: {
      type: Date,
      immutable: true,
    },
    updatedOn: {
      type: Date,
    },
    ownerCode: {
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

questionSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

module.exports = mongoose.model("Question", questionSchema);
