const mongoose = require("mongoose");

const maintenanceRequestSchema = new mongoose.Schema(
  {
    code: {
      type: String,
    },
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
    },
    propertyUnitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PropertyUnit",
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PropertyOwner",
    },
    message: {
      type: String,
      required: true,
    },
    messageStatus: {
      type: Number,
      default: 0, // 0 = Pending, 1 = Assigned, 2 = Completed
    },
    senderCode: {
      type: String,
    },
    handyMenAssigned: [
      {
        id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "HandyMan",
        },
        code: { type: String, },
        name: { type: String, },
        email: { type: String, },
        phone: {
          code: { type: String, },
          number: { type: Number, },
        },
        address: {
          city: { type: String },
          state: { type: String },
          zipcode: { type: String },
        },
        _id: false,
      },
    ],
    problemGallery: [
      {
        name: {
          type: String,
        },
        _id: false,
      },
    ],
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
        delete ret.propertyId;
        delete ret.propertyUnitId;
        delete ret.tenantId;
        delete ret.ownerId;
      },
    },
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret._id;
        delete ret.propertyId;
        delete ret.propertyUnitId;
        delete ret.tenantId;
        delete ret.ownerId;
      },
    },
  }
);

maintenanceRequestSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

maintenanceRequestSchema.virtual("property", {
  ref: "Property",
  localField: "propertyId",
  foreignField: "_id",
  justOne: true,
});

maintenanceRequestSchema.virtual("unit", {
  ref: "PropertyUnit",
  localField: "propertyUnitId",
  foreignField: "_id",
  justOne: true,
});

maintenanceRequestSchema.virtual("tenant", {
  ref: "Tenant",
  localField: "tenantId",
  foreignField: "_id",
  justOne: true,
});

maintenanceRequestSchema.virtual("owner", {
  ref: "PropertyOwner",
  localField: "ownerId",
  foreignField: "_id",
  justOne: true,
});

maintenanceRequestSchema.virtual("assignedHandyMen", {
  ref: "HandyMan",
  localField: "handyMenAssigned.id",
  foreignField: "_id",
  justOne: false,
});

// Populate handyMenAssigned with details from HandyMan schema
maintenanceRequestSchema.pre("save", async function (next) {
  if (this.handyMenAssigned && this.handyMenAssigned.length > 0) {
    const HandyMan = mongoose.model("HandyMan");

    const populatedHandyMen = await Promise.all(
      this.handyMenAssigned.map(async (handy) => {
        const handyManDetails = await HandyMan.findById(handy.id);

        if (!handyManDetails) {
          console.error(`HandyMan with ID ${handy.id} not found.`);
          return null;
        }
        // console.log("HandyMan Details:", handyManDetails);


        return {
          id: handy.id,
          code: handy.code,
          name: handy.name,
          email: handy.email,
          phone: {
            code: handy.phone.code,
            number: handy.phone.number,
          },
          address: {
            city: handy.address.city,
            state: handy.address.state,
            zipcode: handy.address.zipcode,
          },
        };
      })
    );

    // Remove any null values (if a HandyMan was not found)
    this.handyMenAssigned = populatedHandyMen.filter(Boolean);
  }
  next();
});

module.exports = mongoose.model("MaintenanceRequest", maintenanceRequestSchema);
