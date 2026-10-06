const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', authRoutes);

app.use('/api', require('./routes/classes'));
app.use('/api', require('./routes/admin'));
app.use('/api', require('./routes/notifications'));
app.use('/api', require('./routes/tips'));
app.use('/api', require('./routes/social'));
app.use('/api', require('./routes/discovery'));
app.use('/api', require('./routes/profile'));
app.use('/api', require('./routes/planner'));
app.use('/api', require('./routes/collections'));
app.use('/api', require('./routes/cookbooks'));

app.get('/', (req, res) => res.send('Nutriverse backend is running'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));