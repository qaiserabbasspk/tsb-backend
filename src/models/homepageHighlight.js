const mongoose = require("mongoose");

// Small cached pool of AI-generated, guest-facing value-prop snippets shown
// in the homepage hero's floating cards. Refreshed periodically by
// cronjobs/refreshHomepageHighlights.js (not generated per-request) so the
// homepage never makes a live OpenAI call on page load.
const homepageHighlightSchema = new mongoose.Schema(
    {
        text: { type: String, required: true },
        active: { type: Boolean, default: true },
        createdOn: { type: Date, immutable: true, default: Date.now },
    },
    {
        versionKey: false,
    }
);

module.exports = mongoose.model("HomepageHighlight", homepageHighlightSchema);
