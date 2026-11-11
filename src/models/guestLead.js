const mongoose = require("mongoose");

const GuestLeadSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        name: {
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
        guestId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Guest",
        },
        sources: [
            {
                type: {
                    type: String,
                    enum: ["lead_modal", "booking", "signup"],
                    required: true,
                },
                refId: {
                    type: mongoose.Schema.Types.ObjectId,
                },
                capturedAt: {
                    type: Date,
                    default: Date.now,
                },
                _id: false,
            },
        ],
        marketingConsent: {
            type: Boolean,
            default: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        firstSeenAt: {
            type: Date,
            default: Date.now,
        },
        lastSeenAt: {
            type: Date,
            default: Date.now,
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

GuestLeadSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

module.exports = mongoose.model("GuestLead", GuestLeadSchema);
