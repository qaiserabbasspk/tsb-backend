const mongoose = require("mongoose");

const roomsSchema = new mongoose.Schema(
    {
        code: { type: String },
        title: { type: String },
        subtitle: { type: String },
        description: { type: String },
        gallery: [
            {
                name: {
                    type: String
                },
                _id: false
            }
        ],
        location: {
            latitude: {
                type: Number,
            },
            longitude: {
                type: Number,
            },
        },
        rating: { type: Number },
        // True once the host has explicitly entered their own rating for this
        // room (as opposed to the default 0, or a value written by a one-off
        // production seed script) — drives the "rate your properties" dashboard
        // prompt so seeded/placeholder values don't silently satisfy it. Once a
        // real guest review with a rating exists, the review controller
        // overwrites `rating` with the review average regardless of this flag.
        hostRatingSet: { type: Boolean, default: false },
        quantity: { type: Number },
        //availableRooms: { type: Number },
        amenities: [
            {
                id: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Amenity",
                },
                // name: { type: String, },
                // icon: { type: String, },
                _id: false,
            },
        ],
        address: {
            country: { type: String },
            city: { type: String },
            street: { type: String },
        },
        price: { type: Number },
        hasRefundableCautionFee: { type: Boolean },
        refundableCautionFee: { type: Number },
        currency: { type: String, required: true },
        guests: { type: Number },
        bedroom: { type: Number },
        bed: { type: Number },
        bath: { type: Number },
        // Optional YouTube video URL to showcase the property. Stored as a
        // normalized embeddable URL (https://www.youtube.com/embed/<id>) when
        // set via controllers. Left as a plain string at the schema level so
        // legacy records without this field remain valid.
        youtubeUrl: { type: String },
        hostId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Host"
        },
        propertyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "RoomProperty"
        },
        features: [
            {
                id: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Features",
                },
                // title: { type: String, },
                // subtitle: { type: String, },
                // icon: { type: String, },
                _id: false,
            },
        ],
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category"
        },
        status: { type: Number },
        // "unpublished" is the post-approval counterpart to "rejected" — an
        // admin pulling an already-approved listing from guest view without
        // sending it back through initial review. approvedVisibilityFilter
        // (utilities/roomVisibility_utility.js) already only treats
        // "approved" as visible, so no visibility-filter change was needed
        // to add this state.
        reviewStatus: {
            type: String,
            enum: ["pending", "approved", "rejected", "unpublished"],
            default: "approved",
        },
        reviewedBy: { type: String },
        reviewedOn: { type: Date },
        rejectionReason: { type: String },
        unpublishReason: { type: String },
        // Host-initiated delete is a soft delete — the record is kept (hidden
        // everywhere via approvedVisibilityFilter + explicit admin/host list
        // exclusions) rather than destroyed, so it can't break a guest's
        // existing reservation history and an admin can restore it. Admin's
        // own delete stays a hard delete and never sets these.
        isDeleted: { type: Boolean, default: false },
        deletedOn: { type: Date },
        deletedBy: { type: String },
        createdOn: { type: Date, immutable: true },
        updatedOn: { type: Date },
        randomNumber: { type: Number },
    },
    {
        versionKey: false,
        toObject: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.hostId;
                delete ret.categoryId;
                delete ret.amenities;
                delete ret.features;
            },
        },
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.hostId;
                delete ret.categoryId;
                delete ret.amenities;
                delete ret.features;
            },
        },
    }
);

roomsSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

roomsSchema.virtual("host", {
    ref: "Host",
    localField: "hostId",
    foreignField: "_id",
    justOne: true,
});

roomsSchema.virtual("category", {
    ref: "Category",
    localField: "categoryId",
    foreignField: "_id",
    justOne: true,
});

roomsSchema.virtual("amenitiesDetail", {
    ref: "Amenity",
    localField: "amenities.id",
    foreignField: "_id",
    justOne: false,
});

roomsSchema.virtual("featuresDetail", {
    ref: "Features",
    localField: "features.id",
    foreignField: "_id",
    justOne: false,
});

// Populate amenities
// roomsSchema.pre("save", async function (next) {
//     if (this.amenities && this.amenities.length > 0) {
//         const amenity = mongoose.model("Amenity");

//         const populatedAmenity = await Promise.all(
//             this.amenities.map(async (am) => {
//                 const amenityDetails = await Amenity.findById(am.id);

//                 if (!amenityDetails) {
//                     console.error(`Amenity with ID ${am.id} not found.`);
//                     return null;
//                 }

//                 return {
//                     id: am.id,
//                     name: am.name,
//                     icon: am.icon,
//                 };
//             })
//         );

//         this.amenities = populatedAmenity.filter(Boolean);
//     }
//     next();
// });

// Covers search()'s and getAll()'s common filter combo (category/country/city,
// scoped by review visibility).
roomsSchema.index(
    { reviewStatus: 1, categoryId: 1, "address.country": 1, "address.city": 1 },
    { name: "idx_search_filters" }
);

// Supports grouping search/list results by property (Phase 2).
roomsSchema.index({ propertyId: 1 });

// Supports the lat/lng bounding-box pre-filter used by near-me and the
// street-proximity Rank 2 fallback in search().
roomsSchema.index(
    { "location.latitude": 1, "location.longitude": 1 },
    { name: "idx_geo_bbox" }
);

// Backs the AI Concierge's keyword pre-filter (see
// utilities/aiConciergeQuery_utility.js) — title/subtitle weighted above the
// free-form description since a keyword actually named in the title is a
// stronger signal than one incidentally appearing in prose.
roomsSchema.index(
    { title: "text", subtitle: "text", description: "text" },
    { name: "idx_ai_concierge_text_search", weights: { title: 5, subtitle: 3, description: 1 } }
);

module.exports = mongoose.model("Rooms", roomsSchema);
