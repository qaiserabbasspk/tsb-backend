const mongoose = require("mongoose");

const agentSchema = new mongoose.Schema(
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
        password: {
            type: String,
            default: '123@Agent'
        },
        roleId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Role",
        },
        ownerCode: {
            type: String,
        },
        isOwner: {
            type: Number,
            // default: 0,
        },
        // propertyId: {
        //     type: mongoose.Schema.Types.ObjectId,
        //     ref: "Property",
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
                delete ret.propertyId;
                delete ret.password;
            },
        },
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.roleId;
                delete ret.propertyId;
                delete ret.password;
            },
        },
    }
);

agentSchema.index({ email: 1, name: 1 }, { unique: true });

agentSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

agentSchema.virtual("role", {
    ref: "Role",
    localField: "roleId",
    foreignField: "_id",
    justOne: true,
});

// agentSchema.virtual("property", {
//     ref: "Property",
//     localField: "propertyId",
//     foreignField: "_id",
//     justOne: true,
// });

module.exports = mongoose.model("PropertyAgent", agentSchema);
