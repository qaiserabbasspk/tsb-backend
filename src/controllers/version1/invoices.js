require('dotenv').config();
const stripe = require('stripe')('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');
// const stripe = require('stripe')('sk_test_51M4faDIJ5Vh9F5wkj8BTsmpZawTsNrCk1AqeeAuvSkNZ77DRtZVubQKvY4d2R7apADw86phVINocKygK6tLKVQ4L00Tdbw7ZXG');

const Tenant = require("../../models/tenants");
const Invoice = require("../../models/invoices");
const Property = require("../../models/properties");
const BatchInvoice = require("../../models/batchInvoices");
const PropertyUnit = require("../../models/propertyUnits");
// const PenaltyLog = require("../../models/penaltyLog");

const { sendEmail } = require("../../utilities/emailer");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const { createInvoice } = require("../../utilities/invoice_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");

const moduleName = "Invoice";

module.exports = {
    create: async (req, res) => {
        await createInvoice(req, res, false);
    },

    getAll: async (req, res) => {
        try {
            const totalInvoices = await Invoice.countDocuments();
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalInvoices
            );

            if (pagination.page > pagination.pages) {
                return Response.customResponse(
                    res,
                    404,
                    ResponseMessage.OUTOF_DATA
                );
            }

            pagination.data = await Invoice.find()
                .populate([
                    { path: "property", select: "id code description" },
                    { path: "unit", select: "id code name" },
                    { path: "tenant", select: "id code name email avatar" },
                    { path: "owner", select: "id code name email avatar" },
                    { path: "paymentPeriod", select: "id name" },
                    { path: "paymentOption", select: "id name" },
                    // { path: "chargeDetail", select: "id name description currency amount" },
                ])
                .select("-password")
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            if (totalInvoices === 0) {
                return Response.customResponse(
                    res,
                    404,
                    ResponseMessage.NO_DATA
                );
            }

            pagination.data = pagination.data.map((item) => ({
                ...item.toJSON(),
            }));

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (error) {
            return Response.errorResponse(res, 500, error);
        }
    },

    getByTenant: async (req, res) => {
        try {
            const totalInvoices = await Invoice.countDocuments({ tenantId: req.params.tenantId });
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalInvoices
            );

            if (pagination.page > pagination.pages) {
                return Response.customResponse(
                    res,
                    404,
                    ResponseMessage.OUTOF_DATA
                );
            }

            pagination.data = await Invoice.find({ tenantId: req.params.tenantId })
                .populate([
                    { path: "property", select: "id code description" },
                    { path: "unit", select: "id code name" },
                    { path: "tenant", select: "id code name email avatar" },
                    { path: "owner", select: "id code name email avatar" },
                    { path: "paymentPeriod", select: "id name" },
                    { path: "paymentOption", select: "id name" },
                    // { path: "chargeDetail", select: "id name description currency amount" },
                ])
                .select("-password")
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            if (totalInvoices === 0) {
                return Response.customResponse(
                    res,
                    404,
                    ResponseMessage.NO_DATA
                );
            }

            pagination.data = pagination.data.map((item) => ({
                ...item.toJSON(),
            }));

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (error) {
            return Response.errorResponse(res, 500, error);
        }
    },

    getByOwner: async (req, res) => {
        try {
            const totalInvoices = await Invoice.countDocuments({ ownerId: req.params.ownerId });
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalInvoices
            );

            if (pagination.page > pagination.pages) {
                return Response.customResponse(
                    res,
                    404,
                    ResponseMessage.OUTOF_DATA
                );
            }

            pagination.data = await Invoice.find({ ownerId: req.params.ownerId })
                .populate([
                    { path: "property", select: "id code description" },
                    { path: "unit", select: "id code name" },
                    { path: "tenant", select: "id code name email avatar" },
                    { path: "owner", select: "id code name email avatar" },
                    { path: "paymentPeriod", select: "id name" },
                    { path: "paymentOption", select: "id name" },
                    // { path: "chargeDetail", select: "id name description currency amount" },
                ])
                .select("-password")
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            if (totalInvoices === 0) {
                return Response.customResponse(
                    res,
                    404,
                    ResponseMessage.NO_DATA
                );
            }

            pagination.data = pagination.data.map((item) => ({
                ...item.toJSON(),
            }));

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (error) {
            return Response.errorResponse(res, 500, error);
        }
    },

    getById: async (req, res) => {
        try {
            const invoice = await Invoice.findById(req.params.id)
                .populate([
                    { path: "property", select: "id code description" },
                    { path: "unit", select: "id code name" },
                    { path: "tenant", select: "id code name email avatar" },
                    { path: "owner", select: "id code name email avatar" },
                    { path: "paymentPeriod", select: "id name" },
                    { path: "paymentOption", select: "id name" },
                    // { path: "chargeDetail", select: "id name description currency amount" },
                ]);
            if (!invoice) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            return Response.successResponse(res, res.statusCode, invoice);
        } catch (error) {
            return Response.errorResponse(res, 500, error);
        }
    },

    payInvoice: async (req, res) => {
        try {
            const body = req.body;

            const invoice = await Invoice.findOne({ invoiceNumber: body.invoiceNumber });
            // console.log(`invoice1: ${invoice.invoiceNumber} invoice2: ${invoice.totalAmount} invoice3: ${body.invoiceNumber}`);

            if (!invoice) {
                return Response.customResponse(res, 404, ResponseMessage.NO_INVOICE_RECORD);
            };

            if (invoice.isPaid) {
                return Response.customResponse(res, 404, ResponseMessage.INVOICE_ALREADY_PAID);
            };

            if (invoice.isVoid) {
                return Response.customResponse(res, 404, ResponseMessage.INVOICE_VOIDED);
            };

            // console.log(`test1: ${invoice.totalAmount} test2: ${body.amount}`);
            if (invoice.totalAmount != body.amount) {
                return Response.customResponse(res, 404, ResponseMessage.AMOUNT_ERROR);
            };

            invoice.isPaid = true;
            await invoice.save();

            if (invoice.isBatch) {
                const batchInvoice = await BatchInvoice.findById(invoice.batchInvoiceId);
                batchInvoice.isPaid = true;
                await batchInvoice.save();
            }

            const action = `${moduleName} - ${invoice.invoiceNumber}`;
            const person = body.actionBy;
            await createActivityLog(moduleName, action, person);

            const tenant = await Tenant.findById(invoice.tenantId);

            if (!tenant) {
                return Response.customResponse(res, 404, ResponseMessage.NO_TENANT_RECORD);
            }

            var receiverName = `${tenant.name}`;
            var receiverEmail = `${tenant.email}`;
            const formattedInvoiceDate = new Date(invoice.invoiceDate).toLocaleDateString('en-GB', {
                year: 'numeric', month: 'long', day: 'numeric'
            });

            const emailSubject = `Payment Confirmation for Invoice ${invoice.invoiceNumber}`;
            const emailText = `Dear ${receiverName}, <br><br>
            This email confirms that we have received your payment for invoice <a href="https://admin.rentrack.org" target="_blank">
            <strong>${invoice.invoiceNumber}</strong></a>, dated ${formattedInvoiceDate}, 
            in the amount of <strong>$.${invoice.totalAmount}</strong>.<br><br>

            We appreciate your prompt payment and value your business<br><br>

            Best Regards <br>Rentrack Support<br><br>
            <a href="https://rentrack.org" target="_blank">
            <img src="https://quickbooking.org/quickbooking-logo-wide.png" alt="QuickBooking Logo" style="width: 150px; height: auto;">
            </a><br>
            &copy; ${new Date().getFullYear()} All rights reserved.`;

            try {
                await sendEmail(receiverEmail, emailSubject, emailText, res);
                // return Response.customResponse(res, res.statusCode, ResponseMessage.EMAIL_SUCCESS);
            } catch (error) {
                console.error("Email Error2: ", error);
                // return Response.customResponse(res, 500, "Email sending failed");
            }

            return res.status(res.statusCode).json({
                message: ResponseMessage.SUCCESS_MESSAGE,
            });

        } catch (error) {
            return Response.errorResponse(res, 500, error);
        }

    },

    voidInvoice: async (req, res) => {
        try {
            const invoice = await Invoice.findById(req.params.id);

            if (!invoice) {
                return Response.customResponse(res, 404, ResponseMessage.NO_INVOICE_RECORD);
            };

            if (invoice.isPaid) {
                return Response.customResponse(res, 404, ResponseMessage.INVOICE_ALREADY_PAID);
            };

            if (invoice.isVoid) {
                return Response.customResponse(res, 404, ResponseMessage.INVOICE_VOIDED);
            };

            invoice.isVoid = true;
            await invoice.save();

            const tenant = await Tenant.findById(invoice.tenantId);

            if (!tenant) {
                return Response.customResponse(res, 404, ResponseMessage.NO_TENANT_RECORD);
            }

            var receiverName = `${tenant.name}`;
            var receiverEmail = `${tenant.email}`;
            const formattedInvoiceDate = new Date(invoice.invoiceDate).toLocaleDateString('en-GB', {
                year: 'numeric', month: 'long', day: 'numeric'
            });

            const emailSubject = `Invoice ${invoice.invoiceNumber} Cancelled`;
            const emailText = `Dear ${receiverName}, <br><br>
            We've identified an error in the original invoice number <a href="https://admin.rentrack.org" target="_blank"><strong>${invoice.invoiceNumber}</strong></a> dated ${formattedInvoiceDate}, 
            and this is a cancellation of that invoice to reflect the correct amount<br><br>

            If you have any questions or require further information, please do not hesitate to contact us.<br><br>

            Best Regards <br>Rentrack Support<br><br>
            <a href="https://rentrack.org" target="_blank">
            <img src="https://quickbooking.org/quickbooking-logo-wide.png" alt="QuickBooking Logo" style="width: 150px; height: auto;">
            </a><br>
            &copy; ${new Date().getFullYear()} All rights reserved.`;

            try {
                await sendEmail(receiverEmail, emailSubject, emailText, res);
                // return Response.customResponse(res, res.statusCode, ResponseMessage.EMAIL_SUCCESS);
            } catch (error) {
                // console.error("Email Error2: ", error);
                return Response.customResponse(res, 500, "Email sending failed");
            }

            const action = `${moduleName} - ${invoice.invoiceNumber}`;
            const person = req.params.code;
            await createActivityLog(moduleName, action, person);

            return res.status(res.statusCode).json({
                message: ResponseMessage.SUCCESS_MESSAGE,
            });
        } catch (error) {
            return Response.errorResponse(res, 500, error);
        }
    },

    delete: async (req, res) => {
        try {
            const invoice = await Invoice.findById(req.params.id);

            if (!invoice) {
                return Response.customResponse(res, 404, ResponseMessage.NO_INVOICE_RECORD);
            };

            if (invoice.isPaid) {
                return Response.customResponse(res, 404, ResponseMessage.INVOICE_ALREADY_PAID);
            };

            await invoice.deleteOne();

            const action = `${moduleName} - ${invoice.invoiceNumber}`;
            const person = req.params.code;
            await createActivityLog(moduleName, action, person);

            return res.status(res.statusCode).json({
                message: ResponseMessage.SUCCESS_MESSAGE,
            });
        } catch (error) {
            return Response.errorResponse(res, 500, error);
        }
    },

    search: async (req, res) => {
        try {
            const body = req.body;

            // Check if IDs exist
            const property = body.propertyId ? await Property.findById(body.propertyId) : null;
            const propertyUnit = body.propertyUnitId ? await PropertyUnit.findById(body.propertyUnitId) : null;

            if (body.propertyId && !property) return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTY_RECORD);
            if (body.propertyUnitId && !propertyUnit) return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTY_UNIT);

            // Build query
            const searchText = req.query.searchText || "";
            let query = {};

            if (searchText) {
                query.$or = [
                    { invoiceNumber: { $regex: searchText, $options: "i" } },
                    { ownerCode: { $regex: searchText, $options: "i" } },
                    { "owner.name": { $regex: searchText, $options: "i" } },
                    { "tenant.name": { $regex: searchText, $options: "i" } },
                    { "paymentPeriod.name": { $regex: searchText, $options: "i" } },
                    { "paymentOption.name": { $regex: searchText, $options: "i" } },
                ];
            }

            if (body.propertyId) query.propertyId = body.propertyId;
            if (body.propertyUnitId) query.propertyUnitId = body.propertyUnitId;

            // Price range filter
            if (body.minPrice || body.maxPrice) {
                query.price = {};
                if (body.minPrice) query.price.$gte = body.minPrice;
                if (body.maxPrice) query.price.$lte = body.maxPrice;
            }

            // Get total Invoices
            const totalInvoices = await Invoice.countDocuments(query);
            // console.log("Total Invoices Found:", totalInvoices);

            if (totalInvoices === 0) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            // Get pagination
            const { pagination, skip } = await PaginationUtility.paginationParams(req, totalInvoices);
            // console.log("Pagination:", pagination);

            if (pagination.page > pagination.pages || pagination.page < 1) {
                return Response.customResponse(res, 400, "Page is Out of Range");
            }

            // Get paginated Invoices
            const Invoices = await Invoice.find(query)
                .populate([
                    { path: "property", select: "id code description" },
                    { path: "unit", select: "id code name" },
                    { path: "owner", select: "id code name email avatar" },
                    { path: "tenant", select: "id code name email avatar" },
                    { path: "paymentPeriod", select: "id name" },
                    { path: "paymentOption", select: "id name" },
                ])
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            const responseData = Invoices.map((item) => ({
                ...item.toJSON(),
                property: item.property ? item.property : null,
                owner: item.owner ? item.owner : null,
                tenant: item.tenant ? item.tenant : null,
                paymentPeriod: item.paymentPeriod ? item.paymentPeriod : null,
                paymentOption: item.paymentOption ? item.paymentOption : null,
            }));

            pagination.data = responseData;
            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            // console.error("Error:", err);
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    makePayment: async (req, res) => {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: req.body.name
                        },
                        unit_amount: req.body.amount // $19.99
                    },
                    quantity: req.body.quantity
                }
            ],
            mode: 'payment',
            success_url: `https://admin.rentrack.org/#/invoice/view-invoice?success=true&invoiceNumber=${req.body.name}&amount=${req.body.amount}`,
            cancel_url: 'https://admin.rentrack.org/#/invoice/view-invoice',
            billing_address_collection: 'auto'
        });

        //res.json({ id: session.id });
        return res.status(200).json({
            id: session.id
        });
    },

    sendDueInvoiceReminder: async (req, res) => {
        try {
            // const { receiverName, receiverEmail, invoice, amount, invoiceDueDate } = req.body;
            const { receiverId, invoice, amount, invoiceDueDate } = req.body;
            // console.log('Request Body:', JSON.stringify(req.body, null, 2));

            const tenant = await Tenant.findById(receiverId);

            if (!tenant) {
                return Response.customResponse(res, 404, ResponseMessage.NO_TENANT_RECORD);
            }

            var receiverName = `${tenant.name}`;
            var receiverEmail = `${tenant.email}`;
            const formattedDueDate = new Date(invoiceDueDate).toLocaleDateString('en-GB', {
                year: 'numeric', month: 'long', day: 'numeric'
            });

            const emailSubject = `Invoice ${invoice} Overdue`;
            const emailText = `Dear ${receiverName}, <br><br>
            I hope this email finds you well.<br><br>

            I just wanted to drop you a quick note to let you know that we have yet to receive payment from you of <strong>$.${amount}</strong> owed on invoice. 
            This is in respect of our invoice <a href="https://admin.rentrack.org" target="_blank"><strong>${invoice}</strong></a> of which was due for payment on <strong>${formattedDueDate}.</strong><br><br>
            I would be really grateful if you could confirm that everything is on track for payment.<br><br>

            Best Regards <br>Rentrack Support<br><br>
            <a href="https://rentrack.org" target="_blank">
            <img src="https://quickbooking.org/quickbooking-logo-wide.png" alt="QuickBooking Logo" style="width: 150px; height: auto;">
            </a><br>
            &copy; ${new Date().getFullYear()} All rights reserved.`;

            try {
                await sendEmail(receiverEmail, emailSubject, emailText, res);
                return Response.customResponse(res, res.statusCode, ResponseMessage.EMAIL_SUCCESS);
            } catch (error) {
                console.error("Email Error2: ", error);
                return Response.customResponse(res, 500, "Email sending failed");
            }

            // return Response.customResponse(res, 201, ResponseMessage.SUCCESS_MESSAGE, chat);
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    // latePaymentPenaltyAlert: async (req, res) => {
    //     try {
    //         const { tenantId, invoiceId } = req.body;

    //         const invoice = await Invoice.findById(invoiceId);
    //         const tenant = await Tenant.findById(tenantId);

    //         if (!tenant || !invoice) {
    //             return Response.customResponse(res, 404, !tenant ? ResponseMessage.NO_TENANT_RECORD : ResponseMessage.NO_INVOICE_RECORD);
    //         }

    //         const today = new Date();
    //         const dueDate = new Date(invoice.dueDate);

    //         if (today <= dueDate) {
    //             return res.status(200).json({ message: "Invoice is not overdue. No penalty applied." });
    //         }

    //         // 🛑 Check for existing penalty log today
    //         const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    //         const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    //         // ✅ Apply penalty
    //         const penaltyFee = 0.05 * invoice.totalAmount;
    //         const updatedTotal = invoice.totalAmount + penaltyFee;
    //         const updatedRevenue = invoice.totalRevenuesAmount + penaltyFee;

    //         const existingPenalty = await PenaltyLog.findOne({
    //             invoiceId,
    //             appliedOn: { $gte: startOfDay, $lte: endOfDay }
    //         });

    //         if (existingPenalty) {
    //             return res.status(200).json({
    //                 message: "Penalty already applied today for this invoice.",
    //                 originalAmount: invoice.totalAmount,
    //                 penaltyAmount: invoice.penaltyAmount.toFixed(2),
    //                 newAmount: invoice.totalAmount,
    //             });
    //         }

    //         invoice.totalAmount = updatedTotal;
    //         invoice.penaltyAmount = penaltyFee;
    //         invoice.totalRevenuesAmount = updatedRevenue;
    //         await invoice.save();

    //         await PenaltyLog.create({
    //             invoiceId,
    //             tenantId,
    //             penaltyAmount: penaltyFee,
    //             appliedOn: new Date()
    //         });

    //         const emailSubject = `Late Payment Charge on Invoice ${invoice.invoiceNumber}`;
    //         const formattedDueDate = dueDate.toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });
    //         const emailText = `Dear ${tenant.name},<br><br>
    //         A 5% penalty fee of <strong>$${penaltyFee.toFixed(2)}</strong> has been applied to your overdue invoice.
    //         Your new total is <strong>$${updatedTotal.toFixed(2)}</strong>.<br>
    //         This is for invoice <strong>${invoice.invoiceNumber}</strong> which was due on <strong>${formattedDueDate}</strong>.<br><br>
    //         Best Regards <br>Rentrack Support<br><br>
    //         <a href="https://rentrack.org" target="_blank">
    //         <img src="https://quickbooking.org/quickbooking-logo-wide.png" alt="QuickBooking Logo" style="width: 150px; height: auto;">
    //         </a><br>
    //         &copy; ${new Date().getFullYear()} All rights reserved.`;

    //         await sendEmail(tenant.email, emailSubject, emailText, res);

    //         return res.status(200).json({
    //             message: "Penalty applied and email sent.",
    //             originalAmount: updatedTotal - penaltyFee,
    //             penaltyAmount: penaltyFee.toFixed(2),
    //             newAmount: updatedTotal.toFixed(2),
    //         });

    //     } catch (err) {
    //         return Response.errorResponse(res, 500, err.message || err);
    //     }
    // },

}