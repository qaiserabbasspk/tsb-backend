const BatchInvoice = require("../models/batchInvoices");
const Tenant = require("../models/tenants");
const PaymentPeriod = require("../models/paymentPeriods");
const PaymentMethod = require("../models/paymentMethods");
const Charge = require("../models/charges");
const Property = require("../models/properties");
const PropertyUnit = require("../models/propertyUnits");

const { invoiceValidation } = require("../validations/invoices");

const Response = require("../utilities/response_utility");
const MessageUtility = require("../utilities/messages_utility");
const { createActivityLog } = require("../utilities/activitylog_utility");
const unique = require("../utilities/codegenerator_utility");

const moduleName = "BatchInvoice";

const createInvoiceBatch = async (req, res, isBatch, batchInvoiceId) => {
    try {
        const body = req.body;

        const { error } = invoiceValidation(body);
        if (error) {
            return Response.errorResponse(res, 400, error);
        }

        const tenant = await Tenant.findById(body.tenantId);
        if (!tenant) {
            return Response.customResponse(res, 404, MessageUtility.NO_TENANT_RECORD);
        }

        const property = await Property.findById(body.propertyId);
        if (!property) {
            return Response.customResponse(res, 404, MessageUtility.NO_PROPERTY_RECORD);
        }

        const propertyUnit = await PropertyUnit.findById(body.propertyUnitId);
        if (!propertyUnit) {
            return Response.customResponse(res, 404, MessageUtility.NO_PROPERTYUNIT_RECORD);
        }

        const paymentPeriod = await PaymentPeriod.findById(body.paymentPeriodId);
        if (!paymentPeriod) {
            return Response.customResponse(res, 404, MessageUtility.NO_PAYMENTPERIOD_RECORD);
        }

        const paymentOption = await PaymentMethod.findById(body.paymentOptionId);
        if (!paymentOption) {
            return Response.customResponse(res, 404, MessageUtility.NO_PAYMENTMETHOD_RECORD);
        }

        // Fetch charge details for each charge.id
        const chargesWithDetails = await Promise.all(
            body.charges.map(async (charge) => {
                const chargeDetails = await Charge.findById(charge.id);
                if (!chargeDetails) {
                    throw new Error(`Charge with ID ${charge.id} not found.`);
                }
                return {
                    id: chargeDetails._id,
                    name: chargeDetails.name,
                    currency: chargeDetails.currency,
                    amount: chargeDetails.amount,
                    description: chargeDetails.description,
                };
            })
        );

        // Calculate total amount by summing all charges' amounts
        const totalAmount = chargesWithDetails.reduce((sum, charge) => sum + charge.amount, 0);

        const uniqueCode = unique.randomCode();

        const newInvoice = new BatchInvoice({
            tenantId: body.tenantId,
            propertyId: body.propertyId,
            propertyUnitId: body.propertyUnitId,
            paymentOptionId: body.paymentOptionId,
            paymentPeriodId: body.paymentPeriodId,
            charges: chargesWithDetails,
            invoiceNumber: "I-" + uniqueCode,
            amount: totalAmount, // Total sum of all charge amounts
            batchInvoiceId: batchInvoiceId,
            isActive: true,
            isPaid: false,
            isVoid: false,
            isBatch: isBatch,
            invoiceDate: body.invoiceDate,
            dueDate: body.dueDate,
            ownerCode: body.actionBy,
        });

        const saveRes = await newInvoice.save();
        const action = `New ${moduleName} - ${newInvoice.invoiceNumber}`;
        const person = body.actionBy;

        await createActivityLog(moduleName, action, person);

        return res.status(201).json(saveRes);
    } catch (error) {
        return Response.errorResponse(res, 500, error);
    }
};

module.exports = { createInvoice }; const createInvoice = async (req, res, isBatch) => {
    try {
        const body = req.body;

        const { error } = invoiceValidation(body);
        if (error) {
            return Response.errorResponse(res, 400, error);
        }

        const tenant = await Tenant.findById(body.tenantId);
        if (!tenant) {
            return Response.customResponse(res, 404, MessageUtility.NO_TENANT_RECORD);
        }

        const property = await Property.findById(body.propertyId);
        if (!property) {
            return Response.customResponse(res, 404, MessageUtility.NO_PROPERTY_RECORD);
        }

        const propertyUnit = await PropertyUnit.findById(body.propertyUnitId);
        if (!propertyUnit) {
            return Response.customResponse(res, 404, MessageUtility.NO_PROPERTYUNIT_RECORD);
        }

        const paymentPeriod = await PaymentPeriod.findById(body.paymentPeriodId);
        if (!paymentPeriod) {
            return Response.customResponse(res, 404, MessageUtility.NO_PAYMENTPERIOD_RECORD);
        }

        const paymentOption = await PaymentMethod.findById(body.paymentOptionId);
        if (!paymentOption) {
            return Response.customResponse(res, 404, MessageUtility.NO_PAYMENTMETHOD_RECORD);
        }

        // Fetch charge details for each charge.id
        const chargesWithDetails = await Promise.all(
            body.charges.map(async (charge) => {
                const chargeDetails = await Charge.findById(charge.id);
                if (!chargeDetails) {
                    throw new Error(`Charge with ID ${charge.id} not found.`);
                }
                return {
                    id: chargeDetails._id,
                    name: chargeDetails.name,
                    currency: chargeDetails.currency,
                    amount: chargeDetails.amount,
                    description: chargeDetails.description,
                };
            })
        );

        // Calculate total amount by summing all charges' amounts
        const totalAmount = chargesWithDetails.reduce((sum, charge) => sum + charge.amount, 0);

        const uniqueCode = unique.randomCode();

        const newInvoice = new Invoice({
            tenantId: body.tenantId,
            propertyId: body.propertyId,
            propertyUnitId: body.propertyUnitId,
            paymentOptionId: body.paymentOptionId,
            paymentPeriodId: body.paymentPeriodId,
            charges: chargesWithDetails,
            invoiceNumber: "I-" + uniqueCode,
            amount: totalAmount, // Total sum of all charge amounts
            isActive: true,
            isPaid: false,
            isVoid: false,
            isBatch: isBatch,
            invoiceDate: body.invoiceDate,
            dueDate: body.dueDate,
            ownerCode: body.actionBy,
        });

        const saveRes = await newInvoice.save();
        const action = `New ${moduleName} - ${newInvoice.invoiceNumber}`;
        const person = body.actionBy;

        await createActivityLog(moduleName, action, person);

        return res.status(201).json(saveRes);
    } catch (error) {
        return Response.errorResponse(res, 500, error);
    }
};

module.exports = { createInvoiceBatch };