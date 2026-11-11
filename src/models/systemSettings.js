const mongoose = require("mongoose");

// Singleton document holding super-admin feature toggles. Defaults keep the
// original behaviour (verification + review ON) until an admin turns them off.
const systemSettingsSchema = new mongoose.Schema(
    {
        hostEmailVerificationEnabled: {
            type: Boolean,
            default: true,
        },
        listingReviewEnabled: {
            type: Boolean,
            default: true,
        },
        updatedBy: {
            type: String,
        },
        updatedOn: {
            type: Date,
        },
    },
    {
        versionKey: false,
    }
);

module.exports = mongoose.model("SystemSettings", systemSettingsSchema);
