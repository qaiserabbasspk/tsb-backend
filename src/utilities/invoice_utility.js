const Invoice = require("../models/invoices");
const Tenant = require("../models/tenants");
const PaymentPeriod = require("../models/paymentPeriods");
const PaymentMethod = require("../models/paymentMethods");
const Charge = require("../models/charges");
const ChargeType = require("../models/chargeTypes"); // Ensure ChargeType is used
const Property = require("../models/properties");
const PropertyUnit = require("../models/propertyUnits");
const PropertyOwner = require("../models/propertyOwners");

const { invoiceValidation } = require("../validations/invoices");

const Response = require("../utilities/response_utility");
const ResponseMessage = require("../utilities/messages_utility");
const { createActivityLog } = require("../utilities/activitylog_utility");
const unique = require("../utilities/codegenerator_utility");
const { sendInvoice } = require("../utilities/generateInvoice_utility");

const moduleName = "Invoice";

const createInvoice = async (req, res, isBatch) => {
    try {
        const body = req.body;

        const { error } = invoiceValidation(body);
        if (error) {
            return Response.errorResponse(res, 400, error);
        }

        const tenant = await Tenant.findById(body.tenantId);
        if (!tenant) {
            return Response.customResponse(res, 404, ResponseMessage.NO_TENANT_RECORD);
        }

        const property = await Property.findById(body.propertyId);
        if (!property) {
            return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTY_RECORD);
        }
        // console.log("property:", property);

        const propertyUnit = await PropertyUnit.findById(body.propertyUnitId);
        if (!propertyUnit) {
            return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTYUNIT_RECORD);
        }
        // console.log("propertyUnit:", propertyUnit);

        const paymentPeriod = await PaymentPeriod.findById(body.paymentPeriodId);
        if (!paymentPeriod) {
            return Response.customResponse(res, 404, ResponseMessage.NO_PAYMENTPERIOD_RECORD);
        }

        const paymentOption = await PaymentMethod.findById(body.paymentOptionId);
        if (!paymentOption) {
            return Response.customResponse(res, 404, ResponseMessage.NO_PAYMENTMETHOD_RECORD);
        }

        // Fetch charge details with chargeType
        const chargesWithDetails = await Promise.all(
            body.charges.map(async (charge) => {
                const chargeDetails = await Charge.findById(charge.id);
                if (!chargeDetails) {
                    throw new Error(`Charge with ID ${charge.id} not found.`);
                }

                // Fetch ChargeType for accountType
                const chargeTypeDetails = await ChargeType.findById(chargeDetails.chargeTypeId);
                if (!chargeTypeDetails) {
                    throw new Error(`ChargeType with ID ${chargeDetails.chargeTypeId} not found.`);
                }

                return {
                    id: chargeDetails._id,
                    name: chargeDetails.name,
                    currency: chargeDetails.currency,
                    amount: chargeDetails.amount,
                    accountType: chargeTypeDetails.accountType?.toString().trim() || "Unknown", // Ensure valid string
                    description: chargeDetails.description,
                };
            })
        );

        // console.log("Charges With Details:", chargesWithDetails); // Debugging

        // Calculate total amounts
        const totalAmount = chargesWithDetails.reduce((sum, charge) => sum + charge.amount, 0);

        // Separate summation of expenses and revenues (case-insensitive)
        const totalExpensesAmount = chargesWithDetails
            .filter(charge => charge.accountType.toLowerCase() === "expense")
            .reduce((sum, charge) => sum + charge.amount, 0);

        const totalRevenuesAmount = chargesWithDetails
            .filter(charge => charge.accountType.toLowerCase() === "revenue")
            .reduce((sum, charge) => sum + charge.amount, 0);

        // console.log("Total Amount:", totalAmount);
        // console.log("Total Revenues:", totalRevenuesAmount);
        // console.log("Total Expenses:", totalExpensesAmount);

        // Get currency from the first charge
        const currency = chargesWithDetails.length > 0 ? chargesWithDetails[0].currency : null;

        const uniqueCode = unique.randomCode();

        const owner = await PropertyOwner.findById(property.propertyOwnerId);

        const newInvoice = new Invoice({
            tenantId: body.tenantId,
            propertyId: body.propertyId,
            ownerId: property.propertyOwnerId,
            propertyUnitId: body.propertyUnitId,
            paymentOptionId: body.paymentOptionId,
            paymentPeriodId: body.paymentPeriodId,
            charges: chargesWithDetails,
            invoiceNumber: "I-" + uniqueCode,
            currency: currency,
            totalAmount: totalAmount, // Total of all charge amounts
            totalExpensesAmount: totalExpensesAmount, // Sum of expenses
            totalRevenuesAmount: totalRevenuesAmount, // Sum of revenues
            isActive: true,
            isPaid: false,
            isVoid: false,
            isBatch: isBatch,
            invoiceDate: body.invoiceDate,
            dueDate: body.dueDate,
            ownerCode: body.actionBy == '' || body.actionBy == null ? owner.code : body.actionBy,
        });

        const saveRes = await newInvoice.save();
        const action = `New ${moduleName} - ${newInvoice.invoiceNumber}`;
        const person = body.actionBy;

        await createActivityLog(moduleName, action, person);
        await sendInvoice(newInvoice, tenant, propertyUnit, property, paymentPeriod, paymentOption, res);

        return res.status(201).json(saveRes);
    } catch (error) {
        // console.error("Error Creating Invoice:", error);
        return Response.errorResponse(res, 500, error);
    }
};

module.exports = { createInvoice };
