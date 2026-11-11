const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  booking_ref_no: { type: String, maxlength: 17, default: null },
  booking_date: { type: Date, required: true },
  booking_status: { 
    type: String, 
    enum: ['confirmed', 'pending', 'cancelled'], 
    default: 'pending', 
    required: true 
  },
  price_original: { type: Number, required: true },
  price_markup: { type: String, default: null },
  vat: { type: String, required: true },
  tax: { type: String, required: true },
  gst: { type: Number, required: true },
  first_name: { type: String, maxlength: 50, required: true },
  last_name: { type: String, maxlength: 50, required: true },
  email: { type: String, maxlength: 50, required: true },
  address: { type: String, maxlength: 250, required: true },
  phone_country_code: { type: Number, required: true },
  phone: { type: Number, required: true },
  country: { type: String, maxlength: 50, required: true },
  stars: { type: String, maxlength: 5, required: true },
  hotel_id: { type: Number, required: true },
  hotel_name: { type: String, maxlength: 100, required: true },
  hotel_phone: { type: Number, required: true },
  hotel_email: { type: String, maxlength: 50, required: true },
  hotel_website: { type: String, maxlength: 50, required: true },
  hotel_address: { type: String, maxlength: 500, required: true },
  room_data: { type: String, maxlength: 500, required: true },
  location: { type: String, maxlength: 250, required: true },
  location_cords: { type: String, maxlength: 250, required: true },
  hotel_img: { type: String, required: true },
  checkin: { type: String, default: null },
  checkout: { type: String, default: null },
  booking_nights: { type: Number, default: null },
  adults: { type: Number, default: 1 },
  childs: { type: Number, default: 0 },
  child_ages: { type: String, maxlength: 200, required: true },
  currency_original: { type: String, maxlength: 50, required: true },
  currency_markup: { type: String, default: null },
  payment_date: { type: Number, default: null },
  cancellation_request: { type: Number, default: 0 },
  cancellation_status: { type: Number, default: 0 },
  booking_data: { type: String, default: null },
  payment_status: { 
    type: String, 
    enum: ['paid', 'unpaid', 'refunded'], 
    default: 'unpaid', 
    required: true 
  },
  supplier: { type: String, required: true },
  transaction_id: { type: String, default: null },
  user_id: { type: String, default: null },
  user_data: { type: String, required: true },
  guest: { type: String, default: null },
  nationality: { type: String, default: null },
  payment_gateway: { type: String, default: null },
  module_type: { type: String, default: 'hotels', required: true },
  pnr: { type: String, default: null },
  booking_response: { type: String, default: null },
  error_response: { type: String, default: null },
  agent_markup_price: { type: Number, default: null },
  agent_net_profit: { type: Number, default: null },
  agent_markup_percent: { type: Number, default: null },
  agent_markup: { type: String, default: null }
}, {
  timestamps: false,
  collection: 'hotels_bookings' // Updated to match your specific collection name
});

const Booking = mongoose.model('HotelsBookings', bookingSchema);

module.exports = Booking;