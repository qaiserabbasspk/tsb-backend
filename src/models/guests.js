const mongoose = require("mongoose");

const guestsSchema = new mongoose.Schema(
    {
        code: { type: String },
        firstName: { type: String, required: true },
        lastName: { type: String, required: true },
        email: { type: String, required: true, unique: true },
        password: { type: String },
        avatar: { type: String },
        phone: { type: String },
        address: {
            country: { type: String },
            state: { type: String },
            town: { type: String },
            streetAddress: { type: String },
        },
        googleId: { type: String },
        isEmailVerified: { type: Boolean, default: false },
        emailVerificationToken: { type: String },
        emailVerificationExpiry: { type: Date },
        passwordResetToken: { type: String },
        passwordResetExpiry: { type: Date },
        pendingEmail: { type: String },
        emailChangeToken: { type: String },
        emailChangeExpiry: { type: Date },
        status: { type: Number, default: 1 },
        createdOn: { type: Date, immutable: true, default: Date.now },
        updatedOn: { type: Date },
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
                delete ret.passwordResetToken;
                delete ret.passwordResetExpiry;
                delete ret.pendingEmail;
                delete ret.emailChangeToken;
                delete ret.emailChangeExpiry;
            },
        },
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.password;
                delete ret.emailVerificationToken;
                delete ret.emailVerificationExpiry;
                delete ret.passwordResetToken;
                delete ret.passwordResetExpiry;
                delete ret.pendingEmail;
                delete ret.emailChangeToken;
                delete ret.emailChangeExpiry;
            },
        },
    }
);

guestsSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

// Guests store first/last name separately (unlike Host's single `name` field).
// This lets code that treats reviewers/users polymorphically (e.g. Review.user)
// read a consistent `name` regardless of which collection it populated from.
guestsSchema.virtual("name").get(function () {
    return `${this.firstName || ""} ${this.lastName || ""}`.trim();
});

module.exports = mongoose.model("Guest", guestsSchema);
