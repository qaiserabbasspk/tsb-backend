const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema(
  {
    propertyUnitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PropertyUnit",
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PropertyOwner",
    },
    fullName: {
      type: String
    },
    email: {
      type: String,
    },
    phone: {
      type: String,
    },
    appointmentDate: {
      type: Date,
    },
    appointmentTime: {
      type: String,
    },
    comments: {
      type: String,
    },
    appointmentStatus: {
      type: String,
      // default: 0, // 0 = open, 1 = closed
    },
    createdAt: {
      type: Date,
      immutable: true,
    },
    updatedAt: {
      type: Date,
    },
  },
  {
    versionKey: false,
    toObject: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret._id;
        delete ret.propertyUnitId;
        delete ret.ownerId;
      },
    },
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret._id;
        delete ret.propertyUnitId;
        delete ret.ownerId;
      },
    },
  }
);

appointmentSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

appointmentSchema.virtual("propertyUnit", {
  ref: "PropertyUnit",
  localField: "propertyUnitId",
  foreignField: "_id",
  justOne: true,
});

appointmentSchema.virtual("owner", {
  ref: "PropertyOwner",
  localField: "ownerId",
  foreignField: "_id",
  justOne: true,
});

module.exports = mongoose.model("TourSchedule", appointmentSchema);
