const express = require('express');
const router = express.Router();
const { createPaymentIntent, confirmAndCreateBooking, getMyBookings, cancelBooking } = require('../controllers/paymentController');
const auth = require('../middleware/auth');

router.post('/create-intent', auth, createPaymentIntent);
router.post('/confirm', auth, confirmAndCreateBooking);
router.get('/my-bookings', auth, getMyBookings);
router.patch('/:id/cancel', auth, cancelBooking);

module.exports = router;
