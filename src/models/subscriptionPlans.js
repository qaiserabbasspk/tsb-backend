const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
    {
        name: {
            type: String,
        },
        description: {
            type: String,
            required: true,
        },
        currency: {
            type: String,
            // type: mongoose.Schema.Types.ObjectId,
            // ref: "Currency",
        },
        amount: {
            type: Number,
            required: true,
        },
        status: {
            type: Number,
        },
        ownerCode: {
            type: String,
        },
        createdOn: {
            type: Date,
            immutable: true,
        },
        updatedOn: {
            type: Date,
            immutable: true,
        },
    },
    {
        versionKey: false,
        toObject: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                // delete ret.currencyId;
            },
        },
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                // delete ret.currencyId;
            },
        },
    }
);

subscriptionSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

// subscriptionSchema.virtual("currency", {
//     ref: "Currency",
//     localField: "currencyId",
//     foreignField: "_id",
//     justOne: true,
// });

module.exports = mongoose.model("SubscriptionPlan", subscriptionSchema);
