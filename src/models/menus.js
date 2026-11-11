const mongoose = require("mongoose");

const menuSchema = new mongoose.Schema(
  {
    // moduleId: {
    //   type: mongoose.Schema.Types.ObjectId,
    //   ref: "Module",
    // },
    parent: {
      type: String,
    },
    url: {
      type: String,
    },
    name: {
      type: String,
    },
    order: {
      type: Number,
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
  },
  {
    versionKey: false,
    toObject: {
      virtuals: true,
      transform: function (doc, ret) {
        // delete ret.moduleId;
        delete ret._id;
      },
    },
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        // delete ret.moduleId;
        delete ret._id;
      },
    },
  }
);

menuSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

// menuSchema.virtual("module", {
//   ref: "Module",
//   localField: "moduleId",
//   foreignField: "_id",
//   justOne: true,
// });

module.exports = mongoose.model("Menu", menuSchema);
