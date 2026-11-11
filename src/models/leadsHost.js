const mongoose = require("mongoose");

const LeadsHostSchema = new mongoose.Schema(
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
        businessName: {
            type: String,
        },
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
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
                delete ret.categoryId;
            },
        },
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret.categoryId;
                delete ret._id;
            },
        },
    }
);

LeadsHostSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

LeadsHostSchema.virtual("category", {
    ref: "Category",
    localField: "categoryId",
    foreignField: "_id",
    justOne: true,
});

module.exports = mongoose.model("LeadHost", LeadsHostSchema);
