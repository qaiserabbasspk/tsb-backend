const mongoose = require("mongoose");

// Machine-translated copy of a Room's guest-facing text fields, kept in a
// side collection - never as embedded fields on Rooms itself - so a Rentrack
// sync of the source room can never silently wipe a translation. Staleness is
// tracked by comparing sourceUpdatedOn against the live room's updatedOn; the
// translation pipeline only re-translates when the source has actually changed.
const roomTranslationSchema = new mongoose.Schema(
  {
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Rooms", required: true },
    locale: { type: String, required: true },
    title: { type: String },
    subtitle: { type: String },
    description: { type: String },
    sourceUpdatedOn: { type: Date, required: true },
    translatedOn: { type: Date, required: true },
  },
  {
    versionKey: false,
    toObject: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret._id;
        delete ret.roomId;
      },
    },
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret._id;
        delete ret.roomId;
      },
    },
  }
);

roomTranslationSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

roomTranslationSchema.index({ roomId: 1, locale: 1 }, { unique: true });

module.exports = mongoose.model("RoomTranslation", roomTranslationSchema);
