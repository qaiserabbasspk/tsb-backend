const mongoose = require("mongoose");

const administratorSchema = new mongoose.Schema(
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
        password: {
            type: String,
        },
        avatar: {
            type: String,
        },
        status: {
            type: Number,
        },
        isAdmin: {
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
                delete ret.password;
            },
        },
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.password;
            },
        },
    }
);

// Add a unique compound index for email and name
administratorSchema.index({ email: 1, name: 1 }, { unique: true });

administratorSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

module.exports = mongoose.model("Administrator", administratorSchema);
