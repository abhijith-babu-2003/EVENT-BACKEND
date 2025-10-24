// adminRoutes.js
const express = require('express');
const router = express.Router();
const { adminLogin, logout, getCurrentAdmin } = require('../controllers/adminController');
const { getAllBookingsAdmin, adminCancelBooking } = require('../controllers/paymentController');
const { protect, adminOnly } = require('../middleware/adminAuth');

router.post('/login', adminLogin);
router.post('/logout', protect, adminOnly, logout);
router.get('/me', protect, adminOnly, getCurrentAdmin);

// Admin bookings endpoints
router.get('/bookings', protect, adminOnly, getAllBookingsAdmin);
router.patch('/bookings/:id/cancel', protect, adminOnly, adminCancelBooking);

module.exports = router;