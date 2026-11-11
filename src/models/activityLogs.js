const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      require: true,
    },
    action: {
      type: String,
    },
    userCode: {
      type: String,
      require: true,
    },
    actionOn:{
      type: Date,
      immutable: true,
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

activityLogSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

module.exports = mongoose.model("ActivityLog", activityLogSchema);
