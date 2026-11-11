const LeadHost = require("../../models/leadsHost");
const Category = require("../../models/category");
const EmailLog = require("../../models/EmailLog");
const { leadsHostValidation } = require("../../validations/leadsHost");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const { status } = require("../../utilities/status_change_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");
const { sendEmail } = require("../../utilities/quickbookingEmailer_utility");

const moduleName = `Lead Host`;

module.exports = {
    create: async (req, res) => {
        try {
            const body = req.body;

            const { error } = leadsHostValidation(body);

            if (error) {
                return Response.errorResponse(res, 400, error);
            }

            const category = await Category.findById(body.categoryId);

            if (!category)
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            const phone = { ...body.phone };

            const leadHost = LeadHost({
                name: body.name,
                email: body.email,
                phone,
                businessName: body.businessName,
                categoryId: body.categoryId,
                isActive: true,
                createdOn: DateUtil.currentDate(),
            });

            const newLead = await leadHost.save();

            const senderName = body.name;
            const senderEmail = body.email;
            const senderBusinessName = body.businessName;
            const senderCategory = category.name;
            const senderPhone = phone;

            const emailSubject = `New Lead (Host) - QuickBooking`;
            const emailText = `
                    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                        <p>Hello,</p>
            
                        <p>You have received a lead  <strong>${senderName} : ${senderEmail}</strong>.</p><br>
                        <p>Name: <strong>${senderName}</p><br>
                        <p>Email: <strong>${senderEmail}</p><br>
                        <p>Business Name: <strong>${senderBusinessName}</p><br>
                        <p>Category: <strong>${senderCategory}</p><br>
                        <p>Phone: <strong>${senderPhone.code} ${senderPhone.number}</p><br>
            
                        <h3 style="color: #444; margin-top: 25px;">💬 Client's Message</h3>
                        <blockquote style="background-color: #f9f9f9; border-left: 4px solid #ccc; padding: 10px 15px; margin: 20px 0;">
                            ${body.message || "No additional comments were provided."}
                        </blockquote>
            
                        <p>looking forward to hearing from you.</p>
            
                        <br>
                        <p style="font-weight: bold;">Best Regards,<br>${senderName}</p>
            
                        <br>
                        <div style="border-top: 1px solid #ddd; padding-top: 15px;">
                           <a href="https://quickbooking.org" target="_blank">
                        <img src="https://quickbooking.org/quickbooking-logo.png" alt="QuickBooking Logo" style="width: 150px; height: auto; margin-top: 20px;">
                        </a>
                            <span style="font-size: 12px; color: #999;">&copy; ${new Date().getFullYear()} QuickBooking. All rights reserved.</span>
                        </div>
                    </div>
                  `;

            const emailResponse = await sendEmail("info@quickbooking.org", emailSubject, emailText, res);

            if (emailResponse.status === 'error') {
                await EmailLog.create({
                    //to: 'info@quickbooking.org',
                    to: 'usmanumer32@gmail.com',
                    subject: emailSubject,
                    message: emailText,
                    status: "failed",
                    error: emailResponse.message,
                    createdOn: DateUtil.currentDate()
                });
                return Response.customResponse(res, 500, emailResponse.message);
            }

            const action = `New ${moduleName} - ${newLead.title}`;
            const person = body.actionBy;
            await createActivityLog(moduleName, action, person);

            return Response.successResponse(res, res.statusCode, newLead);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getAll: async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            const filter = {};

            if (startDate || endDate) {
                filter.createdAt = {};
                if (startDate) filter.createdAt.$gte = new Date(startDate);
                if (endDate) filter.createdAt.$lte = new Date(`${endDate}T23:59:59.999Z`);
            }

            const totalLeads = await LeadHost.countDocuments(filter);
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalLeads
            );

            if (pagination.page > pagination.pages) {
                return res.status(200).json({
                    message: `Page number ${pagination.page} is greater than the total number of pages that is ${pagination.pages}`,
                });
            }

            pagination.data = await LeadHost.find(filter)
                .populate([
                    { path: "category", select: "id name icon iconCodePoint" },
                ])
                .select()
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            pagination.data = pagination.data.map((pagination) => {
                pagination.id = pagination._id.toHexString();
                return pagination;
            });

            if (pagination.length === 0) {
                return Response.customResponse(
                    res,
                    res.statusCode,
                    ResponseMessage.NO_DATA
                );
            }

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    update: async (req, res) => {
        try {
            const lead = await LeadHost.findById(req.body.id);

            if (!lead) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            lead.name = req.body.name || lead.name;
            lead.email = req.body.email || lead.email;
            lead.isActive = req.body.isActive;
            lead.phone = req.body.phone || lead.phone;
            lead.businessName = req.body.businessName || lead.businessName;
            lead.categoryId = req.body.categoryId || lead.categoryId;

            const updatedLead = await lead.save();

            // const action = `Update ${moduleName}`;
            // const person = req.body.actionBy;
            // await createActivityLog(feature, action, person);

            return Response.successResponse(res, res.statusCode, updatedLead);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    delete: async (req, res) => {
        try {
            const lead = await LeadHost.findById(req.params.id);

            if (!lead) {
                return Response.customResponse(res, 404, ResponseMessage.NO_DATA);
            }

            await lead.deleteOne();

            const action = `Deleted ${moduleName} - ${lead.name}`;
            const person = req.param.actionBy;
            await createActivityLog(moduleName, action, person);

            return Response.customResponse(
                res,
                res.statusCode,
                ResponseMessage.SUCCESS_MESSAGE
            );
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },
}