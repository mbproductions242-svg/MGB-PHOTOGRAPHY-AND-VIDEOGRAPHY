// server.js
// Entry point for the photo gallery app: sets up Express, sessions, view engine, and routes.

require('./db/db'); // ensures DB + default admin exist before anything else runs

const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');

const adminRoutes = require('./routes/admin');
const clientRoutes = require('./routes/client');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret-in-production';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  cookieSession({
    name: 'gallery_session',
    keys: [SESSION_SECRET],
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  })
);

app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});

app.get('/', (req, res) => {
  if (req.session && req.session.adminId) return res.redirect('/admin');
  res.render('landing');
});

app.use('/admin', adminRoutes);
app.use('/gallery', clientRoutes);

app.use((req, res) => {
  res.status(404).send('Page not found.');
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Something went wrong on our end. Please try again.');
});

app.listen(PORT, () => {
  console.log(`Photo gallery app running at http://localhost:${PORT}`);
});
