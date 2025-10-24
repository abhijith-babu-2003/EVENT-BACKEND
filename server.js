// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const connectDB = require('./config/db.js');
const userRoutes = require('./routes/usersRoutes.js');
const adminRoutes = require('./routes/adminRoutes.js');
const eventRoutes = require('./routes/eventRoutes.js');
const paymentRoutes = require('./routes/paymentRoutes.js');
const { notFound, errorHandler } = require('./middleware/errorHandleMiddeware.js');

const app = express();

connectDB();

app.use(helmet());

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean)
  : ['http://localhost:5174'];

console.log('Allowed origins:', allowedOrigins);  // Startup log for verification

app.use(
  cors({
    origin: function (origin, callback) {
      console.log('Request origin:', origin);  // Temporary debug log (remove in prod)
      if (!origin || allowedOrigins.includes(origin)) {
        console.log('CORS allowed for origin:', origin || 'no-origin');  // Temporary debug log
        callback(null, true);
      } else {
        console.log('CORS blocked for origin:', origin);  // Temporary debug log
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],  // Explicit for preflight
    allowedHeaders: ['Content-Type', 'Authorization'],    // Common headers; add more if needed
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/payments', paymentRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));