const mongoose = require("mongoose");

const reportUserSchema = new mongoose.Schema(
    {
        reporterId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Host"
        },
        targetUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Host"
        },
        reasonId: {
            type: String
        },
        createdOn: { type: Date, immutable: true },
    },
    {
        versionKey: false,
        toObject: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.reporterId;
                delete ret.targetUserId;
                delete ret.reasonId;
            },
        },
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.reporterId;
                delete ret.targetUserId;
                delete ret.reasonId;
            },
        },
    }
);

reportUserSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

reportUserSchema.virtual("reporter", {
    ref: "Host",
    localField: "reporterId",
    foreignField: "_id",
    justOne: true,
});

reportUserSchema.virtual("targetUser", {
    ref: "Host",
    localField: "targetUserId",
    foreignField: "_id",
    justOne: true,
});

reportUserSchema.virtual("reason", {
    ref: "ReportReason",
    localField: "reasonId",
    foreignField: "_id",
    justOne: true,
});

module.exports = mongoose.model("ReportUser", reportUserSchema);
