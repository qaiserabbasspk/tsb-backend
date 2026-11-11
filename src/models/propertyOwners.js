const mongoose = require("mongoose");

const propertyOwnerSchema = new mongoose.Schema(
  {
    code: {
      type: String,
    },
    name: {
      type: String,
    },
    email: {
      type: String,
      required: true,
    },
    avatar: {
      type: String,
    },
    password: {
      type: String,
      default: '123@Owner'
    },
    isOwner: {
      type: Number,
      // default: 0,
    },
    ownerCode: {
      type: String,
    },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
    },
    phone: {
      code: {
        type: String,
      },
      number: {
        type: Number,
      },
    },
    address: {
      city: { type: String },
      state: { type: String },
      zipcode: { type: String },
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
        delete ret.roleId;
        delete ret.password;
      },
    },
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret._id;
        delete ret.roleId;
        delete ret.password;
      },
    },
  }
);

propertyOwnerSchema.index({ email: 1, name: 1 }, { unique: true });

propertyOwnerSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

propertyOwnerSchema.virtual("role", {
  ref: "Role",
  localField: "roleId",
  foreignField: "_id",
  justOne: true,
});

module.exports = mongoose.model("PropertyOwner", propertyOwnerSchema);
