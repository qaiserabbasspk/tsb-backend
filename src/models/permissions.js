const mongoose = require("mongoose");
const moment = require("moment-timezone");

const permissionSchema = new mongoose.Schema({
  module: {
      type: String,
      required: true,
      unique: true,
  },
  claims: {
      type: [String],
      required: true,
  },
  createdOn: {
      type: Date,
      default: () => moment().tz("Africa/Nairobi").toDate(),
  },
  updatedOn: {
      type: Date,
      default: null,
  },
}, {
  versionKey: false,
  toObject: { virtuals: true },
  toJSON: { virtuals: true },
});

permissionSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

module.exports = mongoose.model("Permission", permissionSchema);
