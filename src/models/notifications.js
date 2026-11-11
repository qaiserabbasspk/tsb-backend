const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    senderId: {
      type: String,
      required: true,
    },
    senderType: {
      type: String,
      enum: ["PropertyOwner", "Tenant"], // Defines the type of sender
      required: true,
    },
    recipients: [
      {
        receiverId: {
          type: String,
          required: true,
        },
        receiverType: {
          type: String,
          enum: ["PropertyOwner", "Tenant"], // Defines the type of receiver
          required: true,
        },
        _id: false,
      },
    ],
    message: {
      type: String,
      required: true,
    },
    attachment: {
      type: String,
    },
    status: {
      type: Number,
      default: 0, // 0 = unread, 1 = read
    },
    createdOn: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
    updatedOn: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
    toObject: { virtuals: true },
    toJSON: { virtuals: true },
  }
);

// Virtual field to populate sender (PropertyOwner or Tenant)
notificationSchema.virtual("sender", {
  ref: function () {
    return this.senderType === "Tenant" ? "Tenant" : "PropertyOwner";
  },
  localField: "senderId",
  foreignField: "_id",
  justOne: true,
});


// Virtual field to populate recipient (PropertyOwner or Tenant)
notificationSchema.virtual("receiverDetails", {
  ref: function () {
    return this.recipients.length > 0 && this.recipients[0].receiverType
      ? this.recipients[0].receiverType
      : "PropertyOwner"; // Default to avoid Mongoose errors
  },
  localField: "recipients.receiverId",
  foreignField: "_id",
  justOne: true,
});


notificationSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

module.exports = mongoose.model("Notification", notificationSchema);
