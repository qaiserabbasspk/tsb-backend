const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            require: true,
        },
        icon: {
            type: String,
        },
        iconCodePoint: {
            type: String,
        },
        image: {
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

categorySchema.virtual("id").get(function () {
    return this._id.toHexString();
});

module.exports = mongoose.model("Category", categorySchema);
