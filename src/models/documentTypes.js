const mongoose = require("mongoose");

const documentTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
    },
    // type: {
    //   type: mongoose.Schema.Types.ObjectId,
    //   ref: "UserType", // Company or Individual
    // },
    ownerCode: {
      type: String,
    },
    status: {
      type: Number,
    },
  },
  {
    versionKey: false,
    // timestamps: true, // Automatically adds createdOn and updatedOn fields
    toObject: { virtuals: true },
    toJSON: { virtuals: true },
  }
);

// Virtual field for id (copy of _id)
documentTypeSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

// Virtual population for userType
// documentTypeSchema.virtual("userType", {
//   ref: "UserType",
//   localField: "type",
//   foreignField: "_id",
//   justOne: true,
// });

// Custom transformation to modify the JSON response
documentTypeSchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id.toHexString(); // Add id field
    delete ret._id; // Remove _id
    delete ret.__v; // Remove version key
  },
});

module.exports = mongoose.model("DocumentType", documentTypeSchema);
