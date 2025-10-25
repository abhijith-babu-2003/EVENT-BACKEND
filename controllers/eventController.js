const asyncHandler = require('express-async-handler');
const Event = require('../models/eventModal');
const cloudinary = require('../config/cloudinary');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');


const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'events',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 800, height: 600, crop: 'limit' }]
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 
  }
});


const getAllEvents = asyncHandler(async (req, res) => {
  try {
    const events = await Event.find({}).sort({ createdAt: -1 });
    res.json({
      success: true,
      data: events
    });
  } catch (error) {
    res.status(500);
    throw new Error('Failed to fetch events');
  }
});


const getEventById = asyncHandler(async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      res.status(404);
      throw new Error('Event not found');
    }
    
    res.json({
      success: true,
      data: event
    });
  } catch (error) {
    if (error.name === 'CastError') {
      res.status(404);
      throw new Error('Event not found');
    }
    throw error;
  }
});


const createEvent = asyncHandler(async (req, res) => {
  try {
    const { eventName, artistName, date, time, budget, seats, location } = req.body;

 
    if (!eventName || !artistName || !date || !time || !budget || !location) {
      res.status(400);
      throw new Error('Please provide all required fields: eventName, artistName, date, time, budget, location');
    }

    
    let parsedSeats = seats;
    if (typeof seats === 'string') {
      try {
        parsedSeats = JSON.parse(seats);
      } catch (error) {
        res.status(400);
        throw new Error('Invalid seats format - must be valid JSON');
      }
    }

   
    if (!Array.isArray(parsedSeats) || parsedSeats.length !== 3) {
      res.status(400);
      throw new Error('Seats must be an array with exactly 3 sections');
    }

  
    const requiredSections = ['Front', 'Middle', 'Back'];
    for (let i = 0; i < parsedSeats.length; i++) {
      const seat = parsedSeats[i];

      if (!requiredSections.includes(seat.section)) {
        res.status(400);
        throw new Error(`Invalid seat section: ${seat.section}. Must be one of: ${requiredSections.join(', ')}`);
      }

      if (seat.available === undefined || seat.available < 0 || isNaN(Number(seat.available))) {
        res.status(400);
        throw new Error(`Available seats for ${seat.section} section must be a valid number >= 0`);
      }

      if (seat.price === undefined || seat.price < 0 || isNaN(Number(seat.price))) {
        res.status(400);
        throw new Error(`Price for ${seat.section} section must be a valid number >= 0`);
      }
    }

    let imageUrl = '';

   
    if (req.file) {
      imageUrl = req.file.path;
    }

  
    const eventDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (eventDate < today) {
      res.status(400);
      throw new Error('Event date cannot be in the past');
    }

    const event = await Event.create({
      eventName: eventName.trim(),
      artistName: artistName.trim(),
      date: eventDate,
      time,
      budget: Number(budget),
      seats: parsedSeats.map(seat => ({
        section: seat.section,
        available: Number(seat.available),
        price: Number(seat.price)
      })),
      image: imageUrl,
      location: location.trim()
    });

    res.status(201).json({
      success: true,
      message: 'Event created successfully',
      data: event
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const message = Object.values(error.errors).map(val => val.message);
      res.status(400);
      throw new Error(message.join(', '));
    }
    throw error;
  }
});


const updateEvent = asyncHandler(async (req, res) => {
  try {
    const { eventName, artistName, date, time, budget, seats, location } = req.body;

    const event = await Event.findById(req.params.id);

    if (!event) {
      res.status(404);
      throw new Error('Event not found');
    }

    
    let parsedSeats = seats;
    if (seats && typeof seats === 'string') {
      try {
        parsedSeats = JSON.parse(seats);
      } catch (error) {
        res.status(400);
        throw new Error('Invalid seats format - must be valid JSON');
      }
    }

  
    if (parsedSeats) {
      if (!Array.isArray(parsedSeats) || parsedSeats.length !== 3) {
        res.status(400);
        throw new Error('Seats must be an array with exactly 3 sections');
      }

      const requiredSections = ['Front', 'Middle', 'Back'];
      for (let i = 0; i < parsedSeats.length; i++) {
        const seat = parsedSeats[i];

        if (!requiredSections.includes(seat.section)) {
          res.status(400);
          throw new Error(`Invalid seat section: ${seat.section}`);
        }

        if (seat.available < 0 || isNaN(Number(seat.available))) {
          res.status(400);
          throw new Error(`Available seats for ${seat.section} must be a valid number >= 0`);
        }

        if (seat.price < 0 || isNaN(Number(seat.price))) {
          res.status(400);
          throw new Error(`Price for ${seat.section} must be a valid number >= 0`);
        }
      }
    }

   
    if (date) {
      const eventDate = new Date(date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (eventDate < today) {
        res.status(400);
        throw new Error('Event date cannot be in the past');
      }
    }

    let imageUrl = event.image;

   
    if (req.file) {
      
      if (event.image) {
        try {
          const urlParts = event.image.split('/');
          const fileName = urlParts[urlParts.length - 1];
          const publicId = fileName.split('.')[0];
          await cloudinary.uploader.destroy(`events/${publicId}`);
        } catch (error) {
          console.error('Error deleting old image:', error);
         
        }
      }
      imageUrl = req.file.path; 
    }

  
    if (eventName) event.eventName = eventName.trim();
    if (artistName) event.artistName = artistName.trim();
    if (date) event.date = new Date(date);
    if (time) event.time = time;
    if (budget) event.budget = Number(budget);
    if (location) event.location = location.trim(); // Add location
    if (parsedSeats) {
      event.seats = parsedSeats.map(seat => ({
        section: seat.section,
        available: Number(seat.available),
        price: Number(seat.price)
      }));
    }
    event.image = imageUrl;

    const updatedEvent = await event.save();

    res.json({
      success: true,
      message: 'Event updated successfully',
      data: updatedEvent
    });
  } catch (error) {
    if (error.name === 'CastError') {
      res.status(404);
      throw new Error('Event not found');
    }
    if (error.name === 'ValidationError') {
      const message = Object.values(error.errors).map(val => val.message);
      res.status(400);
      throw new Error(message.join(', '));
    }
    throw error;
  }
});


const deleteEvent = asyncHandler(async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      res.status(404);
      throw new Error('Event not found');
    }

    // Delete image from Cloudinary if it exists
    if (event.image) {
      try {
        const urlParts = event.image.split('/');
        const fileName = urlParts[urlParts.length - 1];
        const publicId = fileName.split('.')[0];
        await cloudinary.uploader.destroy(`events/${publicId}`);
      } catch (error) {
        console.error('Error deleting image from Cloudinary:', error);
        // Continue with deletion even if image deletion fails
      }
    }

    await Event.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Event deleted successfully'
    });
  } catch (error) {
    if (error.name === 'CastError') {
      res.status(404);
      throw new Error('Event not found');
    }
    throw error;
  }
});


const updateEventStatus = asyncHandler(async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['Scheduled', 'Completed', 'Cancelled'].includes(status)) {
      res.status(400);
      throw new Error('Invalid status value. Must be one of: Scheduled, Completed, Cancelled');
    }

    const event = await Event.findById(req.params.id);
    
    if (!event) {
      res.status(404);
      throw new Error('Event not found');
    }

    event.status = status;
    const updatedEvent = await event.save();

    res.json({
      success: true,
      message: 'Event status updated successfully',
      data: updatedEvent
    });
  } catch (error) {
    if (error.name === 'CastError') {
      res.status(404);
      throw new Error('Event not found');
    }
    throw error;
  }
});


const getEventsByDateRange = asyncHandler(async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      res.status(400);
      throw new Error('Start date and end date are required');
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start > end) {
      res.status(400);
      throw new Error('Start date must be before end date');
    }

    const events = await Event.find({
      date: {
        $gte: start,
        $lte: end
      }
    }).sort({ date: 1 });

    res.json({
      success: true,
      data: events
    });
  } catch (error) {
    throw error;
  }
});

module.exports = {
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  updateEventStatus,
  getEventsByDateRange,
  upload 
};