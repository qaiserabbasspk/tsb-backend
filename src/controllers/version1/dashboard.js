const Tenant = require("../../models/tenants");
const Invoice = require("../../models/invoices");
const Property = require("../../models/properties");
const PropertyUnit = require("../../models/propertyUnits");
const Notification = require("../../models/notifications");
const PropertyOwner = require("../../models/propertyOwners");
const PropertyAgent = require("../../models/propertyAgents");
const TenantApplication = require("../../models/tenantApplications");
const MaintenanceRequest = require("../../models/tenantMaintenanceRequest");

const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const mongoose = require("mongoose");

module.exports = {

    // invoice counts for dashboard
    getAllInvoices:  async (req, res) => {
        try {
            // Get total counts directly using filters
            const totalInvoices = await Invoice.countDocuments();
            const paidInvoices = await Invoice.countDocuments({ isPaid: true });
            const dueInvoices = await Invoice.countDocuments({ isPaid: false });
    
            // Get total amounts using aggregation
            const totalInvoicesAmount = await Invoice.aggregate([
                { $group: { _id: null, totalAmount: { $sum: "$totalAmount" } } }
            ]);
            const totalPaidInvoicesAmount = await Invoice.aggregate([
                { $match: { isPaid: true } },
                { $group: { _id: null, totalAmount: { $sum: "$totalAmount" } } }
            ]);
            const totalDueInvoicesAmount = await Invoice.aggregate([
                { $match: { isPaid: false } },
                { $group: { _id: null, totalAmount: { $sum: "$totalAmount" } } }
            ]);
    
            return res.status(200).json({
                totalInvoices,
                paidInvoices,
                dueInvoices,
                totalInvoicesAmount: totalInvoicesAmount[0]?.totalAmount || 0,
                totalPaidInvoicesAmount: totalPaidInvoicesAmount[0]?.totalAmount || 0,
                totalDueInvoicesAmount: totalDueInvoicesAmount[0]?.totalAmount || 0,
            });
        } catch (error) {
            console.error("Error fetching invoice data:", error);
            return Response.errorResponse(res, 500, error.message);
        }
    },

    getByOwnerInvoices: async (req, res) => {
        try {
            const propertyOwner = await PropertyOwner.findById(req.params.ownerId);
    
            if (!propertyOwner) {
                return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
            }
    
            // Get total counts directly using filters
            const totalInvoices = await Invoice.countDocuments({ ownerId: req.params.ownerId });
            const paidInvoices = await Invoice.countDocuments({ ownerId: req.params.ownerId, isPaid: true });
            const dueInvoices = await Invoice.countDocuments({ ownerId: req.params.ownerId, isPaid: false });
    
            // Get total amounts using aggregation
            const totalInvoicesAmount = await Invoice.aggregate([
                { $match: { ownerId: new mongoose.Types.ObjectId(req.params.ownerId) } },
                { $group: { _id: null, totalAmount: { $sum: "$totalAmount" } } }
            ]);
    
            const totalPaidInvoicesAmount = await Invoice.aggregate([
                { $match: { ownerId: new mongoose.Types.ObjectId(req.params.ownerId), isPaid: true } },
                { $group: { _id: null, totalAmount: { $sum: "$totalAmount" } } }
            ]);
    
            const totalDueInvoicesAmount = await Invoice.aggregate([
                { $match: { ownerId: new mongoose.Types.ObjectId(req.params.ownerId), isPaid: false } },
                { $group: { _id: null, totalAmount: { $sum: "$totalAmount" } } }
            ]);
    
            return res.status(200).json({
                totalInvoices,
                paidInvoices,
                dueInvoices,
                totalInvoicesAmount: totalInvoicesAmount[0]?.totalAmount || 0,
                totalPaidInvoicesAmount: totalPaidInvoicesAmount[0]?.totalAmount || 0,
                totalDueInvoicesAmount: totalDueInvoicesAmount[0]?.totalAmount || 0,
            });
        } catch (error) {
            console.error("Error fetching invoice counts:", error);
            return Response.customResponse(res, 500, error.message);
        }
    },    

    getByTenantInvoices: async (req, res) => {
        try {
            const tenant = await Tenant.findById(req.params.tenantId);
    
            if (!tenant) {
                return Response.customResponse(res, 404, ResponseMessage.NO_TENANT_RECORD);
            }
    
            // Get total counts directly using filters
            const totalInvoices = await Invoice.countDocuments({ tenantId: req.params.tenantId });
            const paidInvoices = await Invoice.countDocuments({ tenantId: req.params.tenantId, isPaid: true });
            const dueInvoices = await Invoice.countDocuments({ tenantId: req.params.tenantId, isPaid: false });
    
            // Get total amounts using aggregation
            const totalInvoicesAmount = await Invoice.aggregate([
                { $match: { tenantId: new mongoose.Types.ObjectId(req.params.tenantId) } },
                { $group: { _id: null, totalAmount: { $sum: "$totalAmount" } } }
            ]);
    
            const totalPaidInvoicesAmount = await Invoice.aggregate([
                { $match: { tenantId: new mongoose.Types.ObjectId(req.params.tenantId), isPaid: true } },
                { $group: { _id: null, totalAmount: { $sum: "$totalAmount" } } }
            ]);
    
            const totalDueInvoicesAmount = await Invoice.aggregate([
                { $match: { tenantId: new mongoose.Types.ObjectId(req.params.tenantId), isPaid: false } },
                { $group: { _id: null, totalAmount: { $sum: "$totalAmount" } } }
            ]);
    
            return res.status(200).json({
                totalInvoices,
                paidInvoices,
                dueInvoices,
                totalInvoicesAmount: totalInvoicesAmount[0]?.totalAmount || 0,
                totalPaidInvoicesAmount: totalPaidInvoicesAmount[0]?.totalAmount || 0,
                totalDueInvoicesAmount: totalDueInvoicesAmount[0]?.totalAmount || 0,
            });
        } catch (error) {
            console.error("Error fetching invoice counts:", error);
            return Response.customResponse(res, 500, error.message);
        }
    },

    // properties counts for dashboard
    getAllProperties: async (req, res) => {
        try {
            // Get total counts directly using filters
            const totalProperties = await Property.countDocuments();

            // Return only the counts
            return res.status(200).json({
                totalProperties,
            });
        } catch (error) {
            console.error("Error fetching property counts:", error);
            return Response.customResponse(res, 500, error.message);
        }
    },

    getByOwnerProperties: async (req, res) => {
        try {

            const propertyOwner = await PropertyOwner.findById(req.params.ownerId);

            if (!propertyOwner) {
                return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
            }

            // Get total counts directly using filters
            const totalProperties = await Property.countDocuments({ propertyOwnerId: req.params.ownerId });

            // Return only the counts
            return res.status(200).json({
                totalProperties,
            });
        } catch (error) {
            console.error("Error fetching properties counts:", error);
            return Response.customResponse(res, 500, error.message);
        }
    },

    // units counts for dashboard
    getAllUnits: async (req, res) => {
        try {
            // Get total counts directly using filters
            const totalUnits = await PropertyUnit.countDocuments();

            // Return only the counts
            return res.status(200).json({
                totalUnits,
            });
        } catch (error) {
            console.error("Error fetching propertyUnits counts:", error);
            return Response.customResponse(res, 500, error.message);
        }
    },

    getByOwnerUnits: async (req, res) => {
        try {
            const propertyOwner = await PropertyOwner.findById(req.params.ownerId);

            if (!propertyOwner) {
                return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
            }

            // Get total counts directly using filters
            const totalUnits = await PropertyUnit.countDocuments({ ownerCode: propertyOwner.code });

            // Return only the counts
            return res.status(200).json({
                totalUnits,
            });
        } catch (error) {
            console.error("Error fetching propertyUnits counts:", error);
            return Response.customResponse(res, 500, error.message);
        }
    },

    getByTenantUnits: async (req, res) => {
        try {
            const tenant = await Tenant.findById(req.params.tenantId);

            if (!tenant) {
                return Response.customResponse(res, 404, ResponseMessage.NO_TENANT_RECORD);
            }

            // Get total counts directly using filters
            const totalInvoices = await Invoice.countDocuments({ tenantId: req.params.tenantId });
            const paidInvoices = await Invoice.countDocuments({ tenantId: req.params.tenantId, isPaid: true });
            const dueInvoices = await Invoice.countDocuments({ tenantId: req.params.tenantId, isPaid: false });

            // Return only the counts
            return res.status(200).json({
                totalInvoices,
                paidInvoices,
                dueInvoices,
            });
        } catch (error) {
            console.error("Error fetching invoice counts:", error);
            return Response.customResponse(res, 500, error.message);
        }
    },

    // agents counts for dashboard
    getAllAgents: async (req, res) => {
        try {
            // Get total counts directly using filters
            const totalAgents = await PropertyAgent.countDocuments();
            const activeAgents = await PropertyAgent.countDocuments({ status: 1 });
            const inactiveAgents = await PropertyAgent.countDocuments({ status: 0 });

            // Return only the counts
            return res.status(200).json({
                totalAgents,
                activeAgents,
                inactiveAgents,
            });
        } catch (error) {
            console.error("Error fetching propertyAgents counts:", error);
            return Response.customResponse(res, 500, error.message);
        }
    },

    getByOwnerAgents: async (req, res) => {
        // console.log(req.params);
        try {

            const propertyOwner = await PropertyOwner.findById(req.params.ownerId);

            if (!propertyOwner) {
                return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
            }

            // Get total counts directly using filters
            const totalAgents = await PropertyAgent.countDocuments({ ownerCode: propertyOwner.code });
            const activeAgents = await PropertyAgent.countDocuments({ ownerCode: propertyOwner.code, status: 1 });
            const inactiveAgents = await PropertyAgent.countDocuments({ ownerCode: propertyOwner.code, status: 0 });

            // Return only the counts
            return res.status(200).json({
                totalAgents,
                activeAgents,
                inactiveAgents,
            });
        } catch (error) {
            console.error("Error fetching propertyAgents counts:", error);
            return Response.customResponse(res, 500, error.message);
        }
    },

    // maintenanceTickets counts for dashboard
    getAllTickets: async (req, res) => {
        try {
            // Get total counts directly using filters
            const totalTickets = await MaintenanceRequest.countDocuments();
            const unAssignedTickets = await MaintenanceRequest.countDocuments({ messageStatus: 0 });
            const closedTickets = await MaintenanceRequest.countDocuments({ messageStatus: 2 });
            const assignedTickets = await MaintenanceRequest.countDocuments({ messageStatus: 1 });

            // Return only the counts
            return res.status(200).json({
                totalTickets,
                closedTickets,
                assignedTickets,
                unAssignedTickets,
            });
        } catch (error) {
            console.error("Error fetching tickets counts:", error);
            return Response.customResponse(res, 500, error.message);
        }
    },

    getByOwnerTickets: async (req, res) => {
        try {

            const propertyOwner = await PropertyOwner.findById(req.params.ownerId);

            if (!propertyOwner) {
                return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
            }

            // Get total counts directly using filters
            const totalTickets = await MaintenanceRequest.countDocuments({ ownerId: req.params.ownerId });
            const unAssignedTickets = await MaintenanceRequest.countDocuments({ ownerId: req.params.ownerId, messageStatus: 0 });
            const closedTickets = await MaintenanceRequest.countDocuments({ ownerId: req.params.ownerId, messageStatus: 2 });
            const assignedTickets = await MaintenanceRequest.countDocuments({ ownerId: req.params.ownerId, messageStatus: 1 });

            // Return only the counts
            return res.status(200).json({
                totalTickets,
                closedTickets,
                assignedTickets,
                unAssignedTickets,
            });
        } catch (error) {
            console.error("Error fetching tickets counts:", error);
            return Response.customResponse(res, 500, error.message);
        }
    },

    getByTenantTickets: async (req, res) => {
        try {

            const tenant = await Tenant.findById(req.params.tenantId);

            if (!tenant) {
                return Response.customResponse(res, 404, ResponseMessage.NO_TENANT_RECORD);
            }

            // Get total counts directly using filters
            const totalTickets = await MaintenanceRequest.countDocuments({ tenantId: req.params.tenantId });
            const unAssignedTickets = await MaintenanceRequest.countDocuments({ tenantId: req.params.tenantId, messageStatus: 0 });
            const closedTickets = await MaintenanceRequest.countDocuments({ tenantId: req.params.tenantId, messageStatus: 2 });
            const assignedTickets = await MaintenanceRequest.countDocuments({ tenantId: req.params.tenantId, messageStatus: 1 });

            // Return only the counts
            return res.status(200).json({
                totalTickets,
                closedTickets,
                assignedTickets,
                unAssignedTickets,
            });
        } catch (error) {
            console.error("Error fetching tickets counts:", error);
            return Response.customResponse(res, 500, error.message);
        }
    },

    // notifications counts for dashboard
    getAllNotifications: async (req, res) => {
        try {
            // Get total counts directly using filters
            const totalNotifications = await Notification.countDocuments();
            const read = await Notification.countDocuments({ status: 1 });
            const unRead = await Notification.countDocuments({ status: 0 });

            // Return only the counts
            return res.status(200).json({
                totalNotifications,
                read,
                unRead,
            });
        } catch (error) {
            console.error("Error fetching notifications counts:", error);
            return Response.customResponse(res, 500, error.message);
        }
    },

    getByOwnerNotifications: async (req, res) => {
        try {

            const { ownerId } = req.params;

            // Ensure ownerId is provided
            if (!ownerId) {
                return Response.customResponse(res, 400, "ownerId is required.");
            }

            // Get total counts directly using filters
            const totalNotifications = await Notification.countDocuments({ senderId: req.params.ownerId });
            const read = await Notification.countDocuments({ senderId: req.params.ownerId, status: 1 });
            const unRead = await Notification.countDocuments({ senderId: req.params.ownerId, status: 0 });

            // Return only the counts
            return res.status(200).json({
                totalNotifications,
                read,
                unRead,
            });
        } catch (error) {
            console.error("Error fetching notifications counts:", error);
            return Response.customResponse(res, 500, error.message);
        }
    },
   
    // getByOwnerNotifications: async (req, res) => {
    //     try {
    //         const { ownerId } = req.params;
    
    //         if (!ownerId) {
    //             return Response.customResponse(res, 400, "ownerId is required.");
    //         }
    
    //         const matchOwner = {
    //             $or: [
    //                 { senderId: ownerId },
    //                 { 'recipients.receiverId': ownerId }
    //             ]
    //         };
    
    //         const [totalNotifications, read, unRead] = await Promise.all([
    //             Notification.countDocuments(matchOwner),
    //             Notification.countDocuments({ ...matchOwner, status: 1 }),
    //             Notification.countDocuments({ ...matchOwner, status: 0 })
    //         ]);
    
    //         return res.status(200).json({
    //             totalNotifications,
    //             read,
    //             unRead,
    //         });
    //     } catch (error) {
    //         console.error("Error fetching notifications counts:", error);
    //         return Response.customResponse(res, 500, error.message);
    //     }
    // },

    getByTenantNotifications: async (req, res) => {
        try {
            const { tenantId } = req.params;
    
            if (!tenantId) {
                return Response.customResponse(res, 400, "tenantId is required.");
            }
    
            const matchTenant = {
                $or: [
                    { senderId: tenantId },
                    { 'recipients.receiverId': tenantId }
                ]
            };
    
            const [totalNotifications, read, unRead] = await Promise.all([
                Notification.countDocuments(matchTenant),
                Notification.countDocuments({ ...matchTenant, status: 1 }),
                Notification.countDocuments({ ...matchTenant, status: 0 })
            ]);
    
            return res.status(200).json({
                totalNotifications,
                read,
                unRead,
            });
        } catch (error) {
            console.error("Error fetching notifications counts:", error);
            return Response.customResponse(res, 500, error.message);
        }
    },   
    
    getAllApplications: async (req, res) => {
        try {
            // Get total counts directly using filters
            const totalApplication = await TenantApplication.countDocuments();
            const inReview = await TenantApplication.countDocuments({ applicationStatus: 1 });
            const accepted = await TenantApplication.countDocuments({ applicationStatus: 2 });
            const rejected = await TenantApplication.countDocuments({ applicationStatus: 3 });
            const inComplete = await TenantApplication.countDocuments({ applicationStatus: 0 });
            const requiresUpdate = await TenantApplication.countDocuments({ applicationStatus: 4 });

            // Return only the counts
            return res.status(200).json({
                totalApplication,
                inComplete,
                inReview,
                accepted,
                rejected,
                requiresUpdate
            });
        } catch (error) {
            console.error("Error fetching applications counts:", error);
            return Response.customResponse(res, 500, error.message);
        }
    },

    getByOwnerApplications: async (req, res) => {
        try {

            const { ownerId } = req.params;

            // Ensure ownerId is provided
            if (!ownerId) {
                return Response.customResponse(res, 400, "ownerId is required.");
            }

            const propertyOwner = await PropertyOwner.findById(ownerId);

            if (!propertyOwner) {
                return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
            }

            // Get total counts directly using filters
            const totalApplication = await TenantApplication.countDocuments({ ownerCode: propertyOwner.code });
            const inReview = await TenantApplication.countDocuments({ ownerCode: propertyOwner.code, applicationStatus: 1 });
            const accepted = await TenantApplication.countDocuments({ ownerCode: propertyOwner.code, applicationStatus: 2 });
            const rejected = await TenantApplication.countDocuments({ ownerCode: propertyOwner.code, applicationStatus: 3 });
            const inComplete = await TenantApplication.countDocuments({ ownerCode: propertyOwner.code, applicationStatus: 0 });
            const requiresUpdate = await TenantApplication.countDocuments({ ownerCode: propertyOwner.code, applicationStatus: 4 });

            // Return only the counts
            return res.status(200).json({
                totalApplication,
                inComplete,
                inReview,
                accepted,
                rejected,
                requiresUpdate
            });
        } catch (error) {
            console.error("Error fetching applications counts:", error);
            return Response.customResponse(res, 500, error.message);
        }
    },

    getByTenantApplications: async (req, res) => {
        try {

            const tenant = await Tenant.findById(req.params.tenantId);

            if (!tenant) {
                return Response.customResponse(res, 404, ResponseMessage.NO_TENANT_RECORD);
            }

            // Get total counts directly using filters
            const totalApplication = await TenantApplication.countDocuments({ tenantId: tenant._id });
            const inReview = await TenantApplication.countDocuments({ tenantId: tenant._id, applicationStatus: 1 });
            const accepted = await TenantApplication.countDocuments({ tenantId: tenant._id, applicationStatus: 2 });
            const rejected = await TenantApplication.countDocuments({ tenantId: tenant._id, applicationStatus: 3 });
            const inComplete = await TenantApplication.countDocuments({ tenantId: tenant._id, applicationStatus: 0 });
            const requiresUpdate = await TenantApplication.countDocuments({ tenantId: tenant._id, applicationStatus: 4 });

            // Return only the counts
            return res.status(200).json({
                totalApplication,
                inComplete,
                inReview,
                accepted,
                rejected,
                requiresUpdate
            });
        } catch (error) {
            console.error("Error fetching applications counts:", error);
            return Response.customResponse(res, 500, error.message);
        }
    },
}