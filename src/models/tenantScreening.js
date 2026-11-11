
const mongoose = require("mongoose");

const tenantScreeningSchema = new mongoose.Schema(
    {
        code: {
            type: String,
        },
        applicationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "TenantApplication",
        },
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
        createdOn: {
            type: Date,
        },
        ////
        personalInformation: {
            tenantName: { type: String },
            phone: {
                code: { type: String, },
                number: { type: String, },
            },
            address: {
                city: { type: String },
                state: { type: String },
                zipcode: { type: String },
            },
        },
        emergencyContact: {
            emergencyName: { type: String },
            phone: {
                code: { type: String, },
                number: { type: String, },
            },
            address: {
                city: { type: String },
                state: { type: String },
                zipcode: { type: String },
            },
        },
        currentAddress: {
            QA: {
                question: { type: String },
                answer: { type: Number },
            },        
            propertyAddress: { type: String },
            unit: { type: String },
            city: { type: String, },
            state: { type: String, },
            zipcode: { type: String, },
            moveInDate: { type: Date },
            moveOutDate: { type: Date },
            monthlyRent: {
                currency: { type: String },
                amount: { type: String },
            },
            landLord: {
                name: { type: String },
                email: { type: String },
                phone: {
                    code: { type: String, },
                    number: { type: String, },
                },
            },
            reasonForLeaving: {
                type: String,
            },
        },
        references: [
            {
                referenceName: { type: String },
                phone: {
                    code: { type: String, },
                    number: { type: String, },
                },
                _id: false
            },
        ],
        identityVerification:
        {
            SSNorTIN: { type: String },
            drivingLicense: { type: String },
            drivingLicenseState: { type: String },
        },
        bankInformation:
        {
            bankName: { type: String },
            bankBalance: { type: String },
            bank2Name: { type: String },
            bank2Balance: { type: String },
        },
        currentEmployment: {
            QA: {
                question: { type: String },
                answer: { type: Number },
            },
            occupation: { type: String },
            companyName: { type: String },
            companyAddress: { type: String },
            city: { type: String, },
            state: { type: String, },
            zipcode: { type: String, },
            supervisorName: { type: String, },
            supervisorPhone: {
                code: { type: String, },
                number: { type: String, },
            },
            jobStartDate: { type: Date, },
            annualSalary: { type: String },
        },
        previousEmployment: {
            QA: {
                question: { type: String },
                answer: { type: Number },
            },
            occupation: { type: String },
            companyName: { type: String },
            companyAddress: { type: String },
            city: { type: String, },
            state: { type: String, },
            zipcode: { type: String, },
            supervisorName: { type: String, },
            supervisorPhone: {
                code: { type: String, },
                number: { type: String, },
            },
            jobStartDate: { type: Date, },
            jobEndDate: { type: Date, },
            annualSalary: { type: String },
        },
        educationInformation:
        {
            schoolLastAttended: { type: String },
            startDate: { type: Date },
            endDate: { type: Date },
            degree: { type: String },
        },
        guarantorInformation: {
            QA: [
                {
                    question: { type: String },
                    answer: { type: Number },
                    _id: false
                }
            ],
            homeAddress: { type: String },
            unit: { type: String },
            city: { type: String, },
            state: { type: String, },
            zipcode: { type: String, },
            occupation: { type: String, },
            companyName: { type: String, },
            companyAddress: { type: String, },
            moveInDate: { type: Date, },
            monthlyRent: { type: String },
            jobStartDate: { type: Date },
            annualSalary: { type: String },
            checkingAccountBankName: { type: String },
            checkingAccountNumber: { type: String },
            savingAccountBankName: { type: String },
            savingAccountNumber: { type: String },
            SSNorTIN: { type: String },
            drivingLicense: { type: String },
            drivingLicenseState: { type: String },
        },
        additionalInformation:
        {
            QA: [
                {
                    question: { type: String },
                    answer: { type: Number },
                    description: { type: String },
                    _id: false
                }
            ],
        },
        occupants:
        {
            totalOccupantsIncludingYou: { type: String },
        },
        vehicleInformation: {
            QA: {
                question: { type: String },
                answer: { type: Number },
            },
            vehicle1LicensePlate: { type: String },
            vehicle1MakeAndModel: { type: String },
            vehicle1ModelYear: { type: String, },
            vehicle1State: { type: String, },
            vehicle2LicensePlate: { type: String },
            vehicle2MakeAndModel: { type: String },
            vehicle2ModelYear: { type: String, },
            vehicle2State: { type: String, },
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
        ownerCode: {
            type: String,
        },
        screeningStatus: {
            type: Number, //in-cmplete, in-review, requires-update, complete
        },
        reason: {
            type: String,
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

tenantScreeningSchema.virtual("property", {
    ref: "Property",
    localField: "propertyId",
    foreignField: "_id",
    justOne: true,
});

tenantScreeningSchema.virtual("unit", {
    ref: "PropertyUnit",
    localField: "propertyUnitId",
    foreignField: "_id",
    justOne: true,
});

tenantScreeningSchema.virtual("customer", {
    ref: "Tenant",
    localField: "tenantId",
    foreignField: "_id",
    justOne: true,
});

tenantScreeningSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

module.exports = mongoose.model("TenantScreening", tenantScreeningSchema);
