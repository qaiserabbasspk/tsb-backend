const mongoose = require("mongoose");
// pending, accepted,rejected, change requested etc

const applicationStatusSchema = new mongoose.Schema(
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

applicationStatusSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

module.exports = mongoose.model("ApplicationStatus", applicationStatusSchema);
