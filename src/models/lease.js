const mongoose = require("mongoose");

const LeaseSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            require: true,
        },
        remark: {
            type: String,
        },
        fromDate: {
            type: Date,
            require: true,
        },
        toDate: {
            type: Date,
            require: true,
        },
        attachments: [
            {
                name: {
                    type: String
                },
                _id: false
            }
        ],
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PropertyOwner"
        },
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant"
        },
        propertyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Property"
        },
        propertyUnitId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PropertyUnit"
        },
        actionBy: {
            type: String,
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        versionKey: false,
        toObject: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.ownerId;
                delete ret.tenantId;
                delete ret.propertyId;
                delete ret.propertyUnitId;
            },
        },
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.ownerId;
                delete ret.tenantId;
                delete ret.propertyId;
                delete ret.propertyUnitId;
            },
        },
    }
);

LeaseSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

LeaseSchema.virtual("owner", {
    ref: "PropertyOwner",
    localField: "ownerId",
    foreignField: "_id",
    justOne: true,
});

LeaseSchema.virtual("tenant", {
    ref: "Tenant",
    localField: "tenantId",
    foreignField: "_id",
    justOne: true,
});

LeaseSchema.virtual("property", {
    ref: "Property",
    localField: "propertyId",
    foreignField: "_id",
    justOne: true,
});

LeaseSchema.virtual("propertyUnit", {
    ref: "PropertyUnit",
    localField: "propertyUnitId",
    foreignField: "_id",
    justOne: true,
});

module.exports = mongoose.model("Lease", LeaseSchema);
