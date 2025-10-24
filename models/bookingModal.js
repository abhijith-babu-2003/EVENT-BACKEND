const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  customerName: { type: String },
  customerEmail: { type: String, required: true },
  section: { type: String, enum: ['Front', 'Middle', 'Back'], required: true },
  quantity: { type: Number, required: true },
  totalPrice: { type: Number, required: true },
  currency: { type: String, default: 'inr' },
  paymentIntentId: { type: String, index: true, unique: true },
  paymentStatus: { type: String, enum: ['succeeded', 'processing', 'requires_payment_method', 'requires_action', 'canceled', 'failed'], default: 'succeeded' },
  bookingDate: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Booking', bookingSchema);
