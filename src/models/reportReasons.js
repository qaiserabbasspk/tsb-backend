const mongoose = require("mongoose");

const reportReasonSchema = new mongoose.Schema(
    {
        reason: {
            type: String,
        },
        createdOn: {
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

reportReasonSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

module.exports = mongoose.model("ReportReason", reportReasonSchema);
