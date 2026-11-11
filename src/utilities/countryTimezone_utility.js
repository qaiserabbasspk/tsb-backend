const moment = require("moment-timezone");

// Shared with reservation.js's checkout-time display — the one map from a
// listing's address.country to the IANA zone its local time should be read
// in. Properties have no dedicated timezone field, just a country.
const COUNTRY_TIMEZONE = {
    Nigeria: 'Africa/Lagos', Ghana: 'Africa/Accra', Italy: 'Europe/Rome',
    Ethiopia: 'Africa/Addis_Ababa', Kenya: 'Africa/Nairobi',
    'South Africa': 'Africa/Johannesburg', Egypt: 'Africa/Cairo',
    Tanzania: 'Africa/Dar_es_Salaam', Uganda: 'Africa/Kampala',
    'United Kingdom': 'Europe/London', France: 'Europe/Paris',
    Germany: 'Europe/Berlin', Spain: 'Europe/Madrid',
    'United States': 'America/New_York', 'United Arab Emirates': 'Asia/Dubai',
};

const timezoneForCountry = (country) => COUNTRY_TIMEZONE[country?.trim()] || 'UTC';

// A hot deal's "Ends On" date is picked as a bare calendar date (no time) —
// it must expire at the end of that day in the *property's* local time, not
// UTC midnight. Saving it as UTC midnight would cut the deal short by up to
// ~24h depending on the property's country (e.g. a Lagos deal "ending Aug 15"
// would actually vanish at 1am WAT on Aug 15 instead of running through it).
const endOfDayInCountryTimezone = (dateStr, country) => {
    const tz = timezoneForCountry(country);
    return moment.tz(dateStr, 'YYYY-MM-DD', tz).endOf('day').toDate();
};

module.exports = { COUNTRY_TIMEZONE, timezoneForCountry, endOfDayInCountryTimezone };
