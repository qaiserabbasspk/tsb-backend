const mongoose = require("mongoose");

const tenantApplicationSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
        },
        propertyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Property",
        },
        propertyUnitId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PropertyUnit",
        },
        code: {
            type: String,
        },
        ownerCode: {
            type: String,
        },
        documents: [
            {
                id: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "DocumentType",
                },
                documentType: {
                    type: String,
                },
                documentName: {
                    type: String,
                },
                tenantCode: {
                    type: String,
                },
                _id: false,
            },
        ],
        contractStartDate: {
            type: Date,
        },
        contractEndDate: {
            type: Date,
        },
        tenantSign: {
            type: Number,
            default: 0,
        },
        applicationStatus: {
            type: Number, // in-cmplete, in-review, requires-update, complete
            // type: mongoose.Schema.Types.ObjectId,
            // ref: "ApplicationStatus",
            // default: 'Pending'
        },
        createdOn: {
            type: Date,
        },
        updatedOn: {
            type: Date,
        },
    },
    {
        versionKey: false,
        toObject: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret.tenantId;
                delete ret.propertyId;
                delete ret.propertyUnitId;
                delete ret.applicationStatusId;
                delete ret._id;
            },
        },
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret.tenantId;
                delete ret.propertyId;
                delete ret.propertyUnitId;
                delete ret.applicationStatusId;
                delete ret._id;
            },
        },
    }
);

tenantApplicationSchema.virtual("property", {
    ref: "Property",
    localField: "propertyId",
    foreignField: "_id",
    justOne: true,
});

tenantApplicationSchema.virtual("unit", {
    ref: "PropertyUnit",
    localField: "propertyUnitId",
    foreignField: "_id",
    justOne: true,
});

tenantApplicationSchema.virtual("customer", {
    ref: "Tenant",
    localField: "tenantId",
    foreignField: "_id",
    justOne: true,
});

// tenantApplicationSchema.virtual("applicationStatus", {
//     ref: "ApplicationStatus",
//     localField: "applicationStatusId",
//     foreignField: "_id",
//     justOne: true,
// });


tenantApplicationSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

// Populate documents with details from DocumentType schema
// tenantApplicationSchema.pre("save", async function (next) {
//     if (this.documents && this.documents.length > 0) {
//         // const Charge = mongoose.model("Charge");
//         const DocumentType = mongoose.model("DocumentType");

//         const populatedDocuments = await Promise.all(
//             this.documents.map(async (document) => {
//                 const documentDetails = await DocumentType.findById(document.id);

//                 if (!documentDetails) {
//                     console.error(`DocumentType with ID ${document.id} not found.`);
//                     return null;
//                 }

//                 // console.log("DocumentType Details:", documentDetails);

//                 return {
//                     id: document.id,
//                     documentType: documentDetails.name?.toString().trim() || "Unknown", // Ensure valid string
//                     documentName: document.documentName,

//                 };
//             })
//         );

//         // Remove any null values (if a documentType was not found)
//         this.documents = populatedDocuments.filter(Boolean);
//     }
//     next();
// });

module.exports = mongoose.model("TenantApplication", tenantApplicationSchema);
