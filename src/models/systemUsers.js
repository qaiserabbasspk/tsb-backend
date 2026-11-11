const mongoose = require("mongoose");

const systemUserSchema = new mongoose.Schema(
  {
    code: {
      type: String,
    },
    name: {
      type: String,
    },
    email: {
      type: String,
      // required: true,
    },
    password: {
      type: String,
    },
    avatar: {
      type: String,
    },
    ownerCode: {
      type: String,
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
    },
    isOwner: {
      type: Number,
      // default: 0,
    },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
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

// Add a unique compound index for email and name
systemUserSchema.index({ email: 1, name: 1 }, { unique: true });

systemUserSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

systemUserSchema.virtual("role", {
  ref: "Role",
  localField: "roleId",
  foreignField: "_id",
  justOne: true,
});

module.exports = mongoose.model("SystemUser", systemUserSchema);
