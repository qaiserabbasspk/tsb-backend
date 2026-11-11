const mongoose = require('mongoose');

const airlineSchema = new mongoose.Schema({
  name: {
    type: String,
    default: null
  },
  code: {
    type: String,
    default: null
  },
  iata: {
    type: String,
    default: null
  },
  sign: {
    type: String,
    default: null
  },
  country: {
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
  timestamps: true
});

const Airline = mongoose.model('Airline', airlineSchema);

module.exports = Airline;