require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const reportRoutes = require('./routes/reports');
const employeeRoutes = require('./routes/employees');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/employees', employeeRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`DADA Report API running on port ${PORT}`));
