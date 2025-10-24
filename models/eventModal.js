const mongoose = require('mongoose');

const seatSchema = new mongoose.Schema({
  section: { type: String, enum: ['Front', 'Middle', 'Back'], required: true },
  available: { type: Number, required: true },
  price: { type: Number, required: true }
});

const eventSchema = new mongoose.Schema({
  eventName: { type: String, required: true },
  artistName: { type: String, required: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  budget: { type: Number, required: true },
  image: { type: String },
  seats: [seatSchema],
  ticketsSold: { type: Number, default: 0 },
  status: { type: String, enum: ['Scheduled', 'Completed', 'Cancelled'], default: 'Scheduled' },
  location: { type: String, required: true }
}, { timestamps: true });


module.exports = mongoose.model('Event', eventSchema);



