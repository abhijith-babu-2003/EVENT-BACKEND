const express = require('express');
const router = express.Router();
const {
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  updateEventStatus,
  getEventsByDateRange,
  upload
} = require('../controllers/eventController');
const { protect, adminOnly } = require('../middleware/adminAuth');

// Public routes
router.route('/').get(getAllEvents);
router.route('/date-range').get(getEventsByDateRange);
router.route('/:id').get(getEventById);

// Protected/Admin routes - Fixed the middleware order and structure
router.route('/')
  .post(protect, adminOnly, upload.single('image'), createEvent);

router.route('/:id')
  .put(protect, adminOnly, upload.single('image'), updateEvent)
  .delete(protect, adminOnly, deleteEvent);

router.route('/:id/status')
  .patch(protect, adminOnly, updateEventStatus);

module.exports = router;