const mongoose = require("mongoose");

const chargeSchema = new mongoose.Schema(
    {
        propertyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Property",
        },
        propertyUnitId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PropertyUnit",
        },
        chargeTypeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ChargeType",
        },
        ownerCode: {
            type: String,
        },
        status: {
            type: Number,
        },
        currency: {
            type: String,
            // type: mongoose.Schema.Types.ObjectId,
            // ref: "Currency",
        },
        amount: {
            type: Number,
            required: true,
        },
        description: {
            type: String,
            required: true,
        },
        createdOn: {
            type: Date,
            immutable: true,
            default: Date.now,
        },
        updatedOn: {
            type: Date,
            default: Date.now,
        },
    },
    {
        versionKey: false,
        toObject: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.propertyId;
                delete ret.chargeTypeId;
                delete ret.propertyUnitId;
            },
        },
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.propertyId;
                delete ret.chargeTypeId;
                delete ret.propertyUnitId;
            },
        },
    }
);

chargeSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

chargeSchema.virtual("property", {
    ref: "Property",
    localField: "propertyId",
    foreignField: "_id",
    justOne: true,
});

chargeSchema.virtual("unit", {
    ref: "PropertyUnit",
    localField: "propertyUnitId",
    foreignField: "_id",
    justOne: true,
});

chargeSchema.virtual("chargeType", {
    ref: "ChargeType",
    localField: "chargeTypeId",
    foreignField: "_id",
    justOne: true,
});

module.exports = mongoose.model("Charge", chargeSchema);
