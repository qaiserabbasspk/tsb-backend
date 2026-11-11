const mongoose = require("mongoose");

const hostsSchema = new mongoose.Schema(
    {
        code: {
            type: String,
        },
        name: {
            type: String,
        },
        email: {
            type: String,
        },
        bio: {
            type: String,
        },
        password: {
            type: String,
        },
        avatar: {
            type: String,
        },
        rating: {
            type: Number,
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
            country: { type: String },
            city: { type: String },
            state: { type: String },
            zipcode: { type: String },
        },
        status: {
            type: Number,
        },
        isEmailVerified: {
            type: Boolean,
            default: false,
        },
        emailVerificationToken: {
            type: String,
        },
        emailVerificationExpiry: {
            type: Date,
        },
        isAdmin: {
            type: Number,
        },
        isHost: {
            type: Number,
        },
        createdOn: {
            type: Date,
            immutable: true,
        },
        updatedOn: {
            type: Date,
        },
        bankName: {
            type: String,
        },
        bankAccount: {
            type: String,
        },
    },

    {
        versionKey: false,
        toObject: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.password;
                delete ret.emailVerificationToken;
                delete ret.emailVerificationExpiry;
            },
        },
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.password;
                delete ret.emailVerificationToken;
                delete ret.emailVerificationExpiry;
            },
        },
    }
);

// Add a unique compound index for email and name
hostsSchema.index({ email: 1, name: 1 }, { unique: true });

hostsSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

module.exports = mongoose.model("Host", hostsSchema);
