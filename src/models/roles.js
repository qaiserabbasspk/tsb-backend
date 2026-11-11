const mongoose = require("mongoose");

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      unique: true,
      require: true,
    },
    description: {
      type: String,
    },
    claims: [String],
    status: {
      type: Number,
      // default: 1,
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

roleSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

module.exports = mongoose.model("Role", roleSchema);
