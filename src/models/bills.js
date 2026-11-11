const mongoose = require("mongoose");

const billSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            require: true,
        },
        reason: {
            type: String,
            require: true,
        },
        remark: {
            type: String,
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
            },
        },
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.ownerId;
                delete ret.tenantId;
            },
        },
    }
);

billSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

billSchema.virtual("owner", {
    ref: "PropertyOwner",
    localField: "ownerId",
    foreignField: "_id",
    justOne: true,
});

billSchema.virtual("tenant", {
    ref: "Tenant",
    localField: "tenantId",
    foreignField: "_id",
    justOne: true,
});

module.exports = mongoose.model("Bill", billSchema);
