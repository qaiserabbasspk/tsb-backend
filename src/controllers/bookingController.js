const Booking = require('../models/HotelsBookings');

exports.createBooking = async (req, res, next) => {
  try {
    const booking = await HotelsBookings.create({ ...req.body, user: req.user._id });
    res.status(201).json({ success: true, booking });
  } catch (err) {
    next(err);
  }
};

exports.getMyBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, count: bookings.length, bookings });
  } catch (err) {
    next(err);
  }
};

exports.getBookingByPnr = async (req, res, next) => {
  try {
    const filter = { pnr: req.params.pnr.toUpperCase() };
    if (req.user.role === 'user') filter.user = req.user._id;
    const booking = await Booking.findOne(filter);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    res.json({ success: true, booking });
  } catch (err) {
    next(err);
  }
};

exports.updateBooking = async (req, res, next) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role === 'user') filter.user = req.user._id;
    const booking = await Booking.findOneAndUpdate(filter, req.body, { new: true, runValidators: true });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    res.json({ success: true, booking });
  } catch (err) {
    next(err);
  }
};

exports.getAllBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.find().populate('user', 'name email').sort({ createdAt: -1 });
    res.json({ success: true, count: bookings.length, bookings });
  } catch (err) {
    next(err);
  }
};
