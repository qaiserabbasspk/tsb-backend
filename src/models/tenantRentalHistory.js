const mongoose = require("mongoose");

const tenantRentalHistorySchema = new mongoose.Schema(
    {
        tenantName: {
            type: String,
        },
        currentAddress: {
            type: String,
        },
        propertyMgtCompanyName: {
            type: String,
        },
        pointOfContact: {
            type: String,
        },
        isResident: {
            type: String,
        },
        leaseStartDate: {
            type: Date,
        },
        leasseEndDate: {
            type: Date,
        },
        monthlyRent: {
            type: Number,
            default: 0,
        },
        wouldYouRentAgain: {
            type: Boolean,
        },
        wasVacateNoticeGiven: {
            type: Boolean,
        },
        havePets: {
            type: Boolean,
        },
        pets: {
            type: String,
        },
        petsAllowed: {
            type: Boolean,
        },
        latePayments: {
            type: Boolean,
        },
        anyComplaints: {
            type: Boolean,
        },
        anyDamages: {
            type: Boolean,
        },
        anyOverdueBalance: {
            type: Boolean,
        },
        createdOn: {
            type: Date,
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

tenantRentalHistorySchema.virtual("id").get(function () {
    return this._id.toHexString();
});

module.exports = mongoose.model("TenantRentalHistory", tenantRentalHistorySchema);
