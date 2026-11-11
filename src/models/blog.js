const mongoose = require("mongoose");

const blogSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            require: true,
        },
        slug: {
            type: String,
        },
        content: {
            type: String,
        },
        featuredImage: {
            type: String,
        },
        publisher: {
            type: String,
        },
        location: {
            type: String,
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

blogSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

module.exports = mongoose.model("Blog", blogSchema);
