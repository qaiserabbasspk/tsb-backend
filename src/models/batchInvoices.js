const mongoose = require("mongoose");

const batchInvoiceSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
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
        charges: [
            {
                id: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Charge",
                },
                name: {
                    type: String,
                },
                currency: {
                    type: String,
                },
                amount: {
                    type: Number,
                },
                description: {
                    type: String,
                },
                _id: false,
            },
        ],
        amount: { // is the total sum of all charges in the charges[]
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
        batchInvoiceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "BatchInvoice",
        },
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
                delete ret.tenantId;
                delete ret.propertyId;
                delete ret.propertyUnitId;
                delete ret.paymentPeriodId;
                delete ret.paymentOptionId;
            },
        },
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.tenantId;
                delete ret.propertyId;
                delete ret.propertyUnitId;
                delete ret.paymentPeriodId;
                delete ret.paymentOptionId;
            },
        },
    }
);

batchInvoiceSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

batchInvoiceSchema.virtual("property", {
    ref: "Property",
    localField: "propertyId",
    foreignField: "_id",
    justOne: true,
});

batchInvoiceSchema.virtual("unit", {
    ref: "PropertyUnit",
    localField: "propertyUnitId",
    foreignField: "_id",
    justOne: true,
});

batchInvoiceSchema.virtual("customer", {
    ref: "Tenant",
    localField: "tenantId",
    foreignField: "_id",
    justOne: true,
});

batchInvoiceSchema.virtual("year", {
    ref: "PaymentPeriod",
    localField: "paymentPeriodId",
    foreignField: "_id",
    justOne: true,
});

batchInvoiceSchema.virtual("paymentOption", {
    ref: "PaymentMethod",
    localField: "paymentOptionId",
    foreignField: "_id",
    justOne: true,
});

batchInvoiceSchema.virtual("chargeDetail", {
    ref: "Charge",
    localField: "charges.id",
    foreignField: "_id",
    justOne: false,
});

// Populate charges with details from Charge schema and ChargeType schema
batchInvoiceSchema.pre("save", async function (next) {
    if (this.charges && this.charges.length > 0) {
        const Charge = mongoose.model("Charge");
        const ChargeType = mongoose.model("ChargeType");

        const populatedCharges = await Promise.all(
            this.charges.map(async (charge) => {
                const chargeDetails = await Charge.findById(charge.id).populate("chargeTypeId");
                if (!chargeDetails) {
                    throw new Error(`Charge with ID ${charge.id} not found.`);
                }

                const chargeTypeDetails = await ChargeType.findById(chargeDetails.chargeTypeId);
                if (!chargeTypeDetails) {
                    throw new Error(`ChargeType with ID ${chargeDetails.chargeTypeId} not found.`);
                }

                return {
                    id: charge.id,
                    name: chargeTypeDetails.name,
                    amount: chargeDetails.amount,
                    description: chargeDetails.description,
                };
            })
        );

        this.charges = populatedCharges;
    }
    next();
});

module.exports = mongoose.model("BatchInvoice", batchInvoiceSchema);
