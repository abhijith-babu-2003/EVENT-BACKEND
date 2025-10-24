// ==================== Requires ====================
const Stripe = require('stripe');
const Event = require('../models/eventModal');
const Booking = require('../models/bookingModal');

// ==================== Stripe Instance ====================
let stripeInstance = null;
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('Missing STRIPE_SECRET_KEY. Set it in backend/.env');
  }
  if (!stripeInstance) {
    stripeInstance = new Stripe(key);
  }
  return stripeInstance;
}

// ==================== Controllers ====================

// Create PaymentIntent
exports.createPaymentIntent = async (req, res, next) => {
  try {
    const { amount, currency = 'inr', metadata = {} } = req.body || {};

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true },
      metadata,
    });

    return res.status(200).json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('Stripe createPaymentIntent error:', err);
    const message = err?.message?.includes('STRIPE_SECRET_KEY')
      ? 'Server misconfiguration: STRIPE_SECRET_KEY is not set.'
      : 'Payment initialization failed';
    return res.status(500).json({ message });
  }
};

// Confirm Payment and Create Booking
exports.confirmAndCreateBooking = async (req, res) => {
  const stripe = getStripe();
  try {
    const { paymentIntentId } = req.body || {};
    if (!paymentIntentId) {
      return res.status(400).json({ message: 'paymentIntentId is required' });
    }

    // Retrieve PI from Stripe
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (!pi) {
      return res.status(404).json({ message: 'PaymentIntent not found' });
    }
    if (pi.status !== 'succeeded') {
      return res.status(400).json({ message: `Payment not succeeded. Current status: ${pi.status}` });
    }

    // Extract metadata
    const meta = pi.metadata || {};
    const eventId = meta.eventId;
    const section = meta.section;
    const qty = Number(meta.qty || 0);
    const currency = pi.currency || 'inr';
    const totalAmountMinor = pi.amount_received || pi.amount || 0;

    let receiptEmail = pi.receipt_email;
    let billingName = undefined;

    if (!receiptEmail && pi.latest_charge) {
      try {
        const charge = await stripe.charges.retrieve(pi.latest_charge);
        receiptEmail = charge?.billing_details?.email || charge?.receipt_email || receiptEmail;
        billingName = charge?.billing_details?.name || billingName;
      } catch (e) {
        console.warn('Failed to retrieve charge for email:', e?.message);
      }
    }
    if (!receiptEmail) receiptEmail = 'unknown@example.com';

    if (!eventId || !section || !qty) {
      console.error('Missing PI metadata:', { eventId, section, qty });
      return res.status(400).json({ message: 'Missing booking metadata on PaymentIntent' });
    }

    // Idempotency check
    const existing = await Booking.findOne({ paymentIntentId });
    if (existing) {
      return res.status(200).json({ booking: existing, duplicate: true });
    }

    // Update event seats
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    const seat = event.seats.find((s) => s.section === section);
    if (!seat) {
      return res.status(400).json({ message: 'Seat section not found on event' });
    }
    if (seat.available < qty) {
      return res.status(409).json({ message: 'Not enough seats available' });
    }
    seat.available -= qty;
    event.ticketsSold = (event.ticketsSold || 0) + qty;
    await event.save();

    const customerName =
      (meta.customerName && String(meta.customerName).trim()) || billingName || undefined;
    const userId = req.user?._id;

    // Create booking
    const booking = await Booking.create({
      event: event._id,
      user: userId || undefined,
      customerName,
      customerEmail: receiptEmail,
      section,
      quantity: qty,
      totalPrice: Number((totalAmountMinor / 100).toFixed(2)),
      currency,
      paymentIntentId,
      paymentStatus: 'succeeded',
    });

    return res.status(201).json({ booking });
  } catch (err) {
    console.error('confirmAndCreateBooking error:', err?.message, err?.stack);
    if (err?.code === 11000) {
      try {
        const booking = await Booking.findOne({ paymentIntentId: req.body?.paymentIntentId });
        if (booking) return res.status(200).json({ booking, duplicate: true });
      } catch (_) {}
    }
    return res.status(500).json({ message: 'Failed to confirm payment and create booking' });
  }
};

// Get My Bookings
exports.getMyBookings = async (req, res) => {
  try {
    const userId = req.user?._id;
    const email = req.user?.email;
    if (!userId && !email) return res.status(401).json({ message: 'Unauthorized' });

    const or = [];
    if (userId) or.push({ user: userId });
    if (email) or.push({ customerEmail: email });
    const query = or.length ? { $or: or } : { _id: null };

    const bookings = await Booking.find(query)
      .populate({ 
        path: 'event', 
        select: 'eventName image date time location artistName' 
      })
      .select('totalPrice quantity section paymentStatus createdAt paymentIntentId')
      .sort({ createdAt: -1 });

    return res.status(200).json({ bookings });
  } catch (err) {
    console.error('getMyBookings error:', err?.message);
    return res.status(500).json({ message: 'Failed to fetch bookings' });
  }
};

// Cancel Booking
exports.cancelBooking = async (req, res) => {
  try {
    const userEmail = req.user?.email;
    const userId = req.user?._id;
    const { id } = req.params;

    if (!userEmail && !userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!id) return res.status(400).json({ message: 'Booking ID is required' });

    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const ownsByUser = userId && booking.user && String(booking.user) === String(userId);
    const ownsByEmail = userEmail && booking.customerEmail === userEmail;
    if (!ownsByUser && !ownsByEmail) {
      return res.status(403).json({ message: 'Not allowed to cancel this booking' });
    }

    if (booking.paymentStatus === 'canceled') {
      return res.status(200).json({ booking, alreadyCanceled: true });
    }

    // Rollback seats
    const event = await Event.findById(booking.event);
    if (event) {
      const seat = event.seats.find((s) => s.section === booking.section);
      if (seat) {
        seat.available += booking.quantity;
      }
      event.ticketsSold = Math.max(0, (event.ticketsSold || 0) - booking.quantity);
      await event.save();
    }

    booking.paymentStatus = 'canceled';
    await booking.save();

    return res.status(200).json({ booking });
  } catch (err) {
    console.error('cancelBooking error:', err?.message);
    return res.status(500).json({ message: 'Failed to cancel booking' });
  }
};

// Admin: Get All Bookings
exports.getAllBookingsAdmin = async (req, res) => {
  try {
    const bookings = await Booking.find({})
      .populate({ path: 'event', select: 'eventName image date time location' })
      .populate({ path: 'user', select: 'name email' })
      .sort({ createdAt: -1 });

    return res.status(200).json({ bookings });
  } catch (err) {
    console.error('getAllBookingsAdmin error:', err?.message);
    return res.status(500).json({ message: 'Failed to fetch bookings' });
  }
};

// Admin: Cancel any Booking
exports.adminCancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'Booking ID is required' });

    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (booking.paymentStatus === 'canceled') {
      return res.status(200).json({ booking, alreadyCanceled: true });
    }

    // Rollback seats
    const event = await Event.findById(booking.event);
    if (event) {
      const seat = event.seats.find((s) => s.section === booking.section);
      if (seat) {
        seat.available += booking.quantity;
      }
      event.ticketsSold = Math.max(0, (event.ticketsSold || 0) - booking.quantity);
      await event.save();
    }

    booking.paymentStatus = 'canceled';
    await booking.save();

    return res.status(200).json({ booking });
  } catch (err) {
    console.error('adminCancelBooking error:', err?.message);
    return res.status(500).json({ message: 'Failed to cancel booking' });
  }
};
