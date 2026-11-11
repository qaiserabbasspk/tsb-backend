const mongoose = require("mongoose");

const LeadsSchema = new mongoose.Schema(
    {
        name: {
            type: String,
        },
        email: {
            type: String,
        },
        phone: {
            code: {
                type: String,
            },
            number: {
                type: Number,
            },
        },
        isActive: {
            type: Boolean,
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
            },
        },
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
            },
        },
    }
);

LeadsSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

module.exports = mongoose.model("Lead", LeadsSchema);
