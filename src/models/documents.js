const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
    },
    documentype: {
      type: String,
    },
    status: {
      type: Number,
      default: 1,
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

documentSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

module.exports = mongoose.model("Document", documentSchema);
