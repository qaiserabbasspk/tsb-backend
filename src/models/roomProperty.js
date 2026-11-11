const mongoose = require("mongoose");

// The physical-property grouping for Rooms. Named "RoomProperty" (not
// "Property") to avoid colliding with the unused legacy Rentrack "Property"
// model (models/properties.js), which already owns that model name and the
// "properties" collection.
//
// Deliberately holds no price range, unit count — those are derived from the
// property's Rooms at query time (see rooms.js search/list), so they can
// never drift out of sync with the Rooms that actually carry that data.
//
// Deliberately holds no description/gallery/amenities/features/categoryId
// either — per the Phase 3 pivot (PROPERTY_ROOM_RESTRUCTURE_DECISIONS.md),
// the property detail page shows its cheapest room's own authored content
// directly rather than inferring/blending a property-wide version of it.
const roomPropertySchema = new mongoose.Schema(
    {
        hostId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Host",
        },
        // One category per property (Hotel/Apartment/Event Centers/Resorts) —
        // set from the first room's category and inherited by every room
        // added under this property afterwards, so the admin/host never has
        // to reselect it. Optional at the schema level only because
        // properties created before this field existed don't have it yet;
        // see resolveRoomPropertyId's self-heal in rooms.js.
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
        },
        name: { type: String },
        address: {
            country: { type: String },
            city: { type: String },
            street: { type: String },
        },
        location: {
            latitude: { type: Number },
            longitude: { type: Number },
        },
        createdOn: { type: Date, immutable: true },
        updatedOn: { type: Date },
    },
    {
        versionKey: false,
        toObject: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.hostId;
            },
        },
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                delete ret._id;
                delete ret.hostId;
            },
        },
    }
);

roomPropertySchema.virtual("id").get(function () {
    return this._id.toHexString();
});

roomPropertySchema.virtual("host", {
    ref: "Host",
    localField: "hostId",
    foreignField: "_id",
    justOne: true,
});

roomPropertySchema.virtual("rooms", {
    ref: "Rooms",
    localField: "_id",
    foreignField: "propertyId",
    justOne: false,
});

// Supports "list this host's properties" (host dashboard) lookups.
roomPropertySchema.index({ hostId: 1 });

module.exports = mongoose.model("RoomProperty", roomPropertySchema, "roomproperties");
