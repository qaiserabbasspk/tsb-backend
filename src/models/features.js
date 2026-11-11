const mongoose = require("mongoose");

const featureSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            require: true,
        },
        subtitle: {
            type: String,
            require: true,
        },
        icon: {
            type: String,
        },
        iconCodePoint: {
            type: String,
        },
        actionBy: {
            type: String,
        },
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

featureSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

module.exports = mongoose.model("Features", featureSchema);
