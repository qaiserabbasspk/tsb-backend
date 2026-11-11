const mongoose = require("mongoose");

const tenantSchema = new mongoose.Schema(
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
    isOwner: {
      type: Number,
      // default: 0,
    },
    password: {
      type: String,
      default: '123@Tenant'
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
    ownerCode: {
      type: String,
    },
    address: {
      city: { type: String },
      state: { type: String },
      zipcode: { type: String },
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

tenantSchema.index({ email: 1, name: 1 }, { unique: true });

tenantSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

tenantSchema.virtual("role", {
  ref: "Role",
  localField: "roleId",
  foreignField: "_id",
  justOne: true,
});

module.exports = mongoose.model("Tenant", tenantSchema);
