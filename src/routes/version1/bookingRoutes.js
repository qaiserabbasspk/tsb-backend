const router = require('express').Router();
const c = require('../../controllers/bookingController');
const { protect, authorize } = require('../../middleware/auth');

router.use(protect);

router.post('/', c.createBooking);
router.get('/my', c.getMyBookings);
router.get('/pnr/:pnr', c.getBookingByPnr);
router.patch('/:id', c.updateBooking);
router.get('/', authorize('admin', 'agent'), c.getAllBookings);

module.exports = router;
