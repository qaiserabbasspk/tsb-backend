const mongoose = require('mongoose');

const airportSchema = new mongoose.Schema({
  airport: {
    type: String,
    required: true
  },
  city: {
    type: String,
    required: true
  },
  country: {
    type: String,
    required: true
  },
  code: {
    type: String,
    required: true,
    unique: true // Usually airport codes like IATA are unique
  },
  late: {
    type: String,
    default: null
  },
  long: {
    type: String,
    default: null
  },
  region: {
    type: String,
    default: null
  },
  type: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['1', '0'],
    required: true,
    default: '1'
  }
}, {
  timestamps: true // Automatically adds createdAt and updatedAt fields
});

const Airport = mongoose.model('Airport', airportSchema);

module.exports = Airport;