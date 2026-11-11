const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema(
    {
        tenantId: { // customerId
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
        },
        ownerId: { // customerId
            type: mongoose.Schema.Types.ObjectId,
            ref: "PropertyOwner",
        },
        propertyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Property",
        },
        propertyUnitId: { // companyId
            type: mongoose.Schema.Types.ObjectId,
            ref: "PropertyUnit",
        },
        paymentPeriodId: { // year
            type: mongoose.Schema.Types.ObjectId,
            ref: "PaymentPeriod",
        },
        paymentOptionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PaymentMethod",
        },
        invoiceNumber: {
            type: String
        },
        charges: [
            {
                id: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Charge",
                },
                name: { // retrieve from the name of ChargeType
                    type: String,
                },
                description: {
                    type: String,
                },
                currency: {
                    type: String,
                },
                amount: {
                    type: Number,
                },
                accountType: {
                    type: String,
                },
                _id: false,
            },
        ],
        currency: {
            type: String,
        },
        penaltyAmount: {
            type: Number,
            default: 0
        },
        // penaltyHistory: [
        //     {
        //         penaltyAmount: { type: Number },
        //         date: { type: Date, default: Date.now },
        //     }
        // ],
        totalAmount: { // is the total sum of all charges in the charges[]
            type: Number
        },
        totalExpensesAmount: {
            type: Number
        },
        totalRevenuesAmount: {
            type: Number
        },
        isActive: {
            type: Boolean
        },
        isPaid: {
            type: Boolean
        },
        isVoid: {
            type: Boolean
        },
        isBatch: {
            type: Boolean
        },
        // batchInvoiceId: {
        //     type: mongoose.Schema.Types.ObjectId,
        //     ref: "BatchInvoice",
        // },
        invoiceDate: {
            type: Date,
            default: Date.now,
        },
        dueDate: {
            type: Date,
        },
        ownerCode: {
            type: String,
        },
    },
    {
        versionKey: false,
        toObject: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.ownerId;
                delete ret.tenantId;
                delete ret.propertyId;
                delete ret.propertyUnitId;
                delete ret.paymentPeriodId;
                delete ret.paymentOptionId;
                delete ret.batchInvoiceId;
            },
        },
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.ownerId;
                delete ret.tenantId;
                delete ret.propertyId;
                delete ret.propertyUnitId;
                delete ret.paymentPeriodId;
                delete ret.paymentOptionId;
                delete ret.batchInvoiceId;
            },
        },
    }
);

invoiceSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

invoiceSchema.virtual("property", {
    ref: "Property",
    localField: "propertyId",
    foreignField: "_id",
    justOne: true,
});

invoiceSchema.virtual("unit", {
    ref: "PropertyUnit",
    localField: "propertyUnitId",
    foreignField: "_id",
    justOne: true,
});

invoiceSchema.virtual("tenant", {
    ref: "Tenant",
    localField: "tenantId",
    foreignField: "_id",
    justOne: true,
});

invoiceSchema.virtual("owner", {
    ref: "PropertyOwner",
    localField: "ownerId",
    foreignField: "_id",
    justOne: true,
});

invoiceSchema.virtual("paymentPeriod", {
    ref: "PaymentPeriod",
    localField: "paymentPeriodId",
    foreignField: "_id",
    justOne: true,
});

invoiceSchema.virtual("paymentOption", {
    ref: "PaymentMethod",
    localField: "paymentOptionId",
    foreignField: "_id",
    justOne: true,
});

// invoiceSchema.virtual("batchInvoice", {
//     ref: "BatchInvoice",
//     localField: "batchInvoiceId",
//     foreignField: "_id",
//     justOne: true,
// });

invoiceSchema.virtual("chargeDetail", {
    ref: "Charge",
    localField: "charges.id",
    foreignField: "_id",
    justOne: false,
});

// Populate charges with details from Charge schema and ChargeType schema
invoiceSchema.pre("save", async function (next) {
    if (this.charges && this.charges.length > 0) {
        // const Charge = mongoose.model("Charge");
        // const ChargeType = mongoose.model("ChargeType");
        const Charge = require("./charges"); // ✅ 
        const ChargeType = require("./chargeTypes"); // 

        const populatedCharges = await Promise.all(
            this.charges.map(async (charge) => {
                const chargeDetails = await Charge.findById(charge.id).populate("chargeTypeId");

                if (!chargeDetails) {
                    console.error(`Charge with ID ${charge.id} not found.`);
                    return null;
                }

                // console.log("Charge Details:", chargeDetails);

                const chargeTypeDetails = await ChargeType.findById(chargeDetails.chargeTypeId);

                if (!chargeTypeDetails) {
                    console.error(`ChargeType with ID ${chargeDetails.chargeTypeId} not found.`);
                    return null;
                }

                // console.log("ChargeType Details:", chargeTypeDetails);

                return {
                    id: charge.id,
                    name: chargeTypeDetails.name,
                    currency: charge.currency,
                    amount: chargeDetails.amount,
                    accountType: chargeTypeDetails.accountType,
                    description: chargeDetails.description,
                };
            })
        );

        // Remove any null values (if a chargeType was not found)
        this.charges = populatedCharges.filter(Boolean);
    }
    next();
});


module.exports = mongoose.model("Invoice", invoiceSchema);
