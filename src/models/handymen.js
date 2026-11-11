const mongoose = require("mongoose");

const handyManSchema = new mongoose.Schema(
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
        isOwner: {
            type: Number,
            // default: 0,
        },
        avatar: {
            type: String,
        },
        password: {
            type: String,
            default: '123@handyman'
        },
        roleId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Role",
        },
        ownerCode: {
            type: String,
        },
        // maintenanceRequestId: {
        //     type: mongoose.Schema.Types.ObjectId,
        //     ref: "MaintenanceRequest",
        // },
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
                // delete ret.maintenanceRequestId;
                delete ret.password;
            },
        },
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.roleId;
                // delete ret.maintenanceRequestId;
                delete ret.password;
            },
        },
    }
);

handyManSchema.index({ email: 1, name: 1 }, { unique: true });

handyManSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

handyManSchema.virtual("role", {
    ref: "Role",
    localField: "roleId",
    foreignField: "_id",
    justOne: true,
});

// handyManSchema.virtual("serviceRequest", {
//     ref: "MaintenanceRequest",
//     localField: "maintenanceRequestId",
//     foreignField: "_id",
//     justOne: true,
// });

module.exports = mongoose.model("HandyMan", handyManSchema);
