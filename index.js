const express = require("express");
const pool = require("./config/connection");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const verifyToken = require("./middleware/VerifyToken");
const adminAuth = require("./middleware/adminAuth");
require("dotenv").config();

const app = express();

app.use(express.json());

// to generate random id
function GenerateUserId() {
  const userid = Math.floor(100000 + Math.random() * 999999);
  return userid;
}

function GeneratePlaceId() {
  const userid = Math.floor(100000 + Math.random() * 999999);
  return userid;
}

function GenerateBookingId() {
  const userid = Math.floor(100000 + Math.random() * 999999);
  return userid;
}

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Api working",
  });
});


app.post("/api/signup", async (req, res) => {
  try {
    const { username, password, email } = req.body;
    //console.log(username, password, email);
    const hashedPassword = await bcrypt.hash(password, 10);
    const id = GenerateUserId();
    
    const query = "INSERT INTO users (id, username, password, email) VALUES (?, ?, ?, ?)";
    const [result] = await pool.execute(query,[id, username, hashedPassword, email]);
    res.status(200).json({
      status: "Account successfully created",
      status_code: 200,
      user_id: id,
    });

  } catch (error) {
    res.status(500).json({
      error: error.message,
      status_code: 500 });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    //console.log(username, password);
    const query = "SELECT * FROM users WHERE username = ?"
    const [result] = await pool.execute(query,[username]);
    //console.log(result.length);

    if (result.length === 0) {
      return res.status(401).json({
        status: "Incorrect username/password provided. Please retry",
        status_code: 401,
      });
    }
    const user = result[0];
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        status: "Incorrect username/password provided. Please retry",
        status_code: 401,
      });
    }

    const token = jwt.sign({id: user.id, username: user.username},process.env.JWT_SECRET,{expiresIn: "1h"});
    //console.log(token);
    res.json({
      status: "Login successful",
      status_code: 200,
      user_id: user.id,
      access_token: token,
    });

  } catch (error) {
    res.status(500).json({
      error: error.message,
      status_code: 500 });
  }
});

app.post("/api/dining-place/create", adminAuth, async (req, res) => {
  try {
    const {name, address, phone_no, website, operational_hours} = req.body;
    //console.log(name, address, phone_no, website, operational_hours);
    const placeId = GeneratePlaceId();
    //console.log(operational_hours.open_time);
    const query = "INSERT INTO dining_places (id, name, address, phone_no, website, open_time, close_time) VALUES (?,?,?,?,?,?,?)";
    const [result] = await pool.execute(
      query,[placeId,name,address,phone_no,website,operational_hours.open_time,operational_hours.close_time,]
    );
    res.status(200).json({
      message: `${name} added successfully`,
      place_id: placeId,
      status_code: 200,
    });


  } catch (error) {
    res.status(500).json({
      error: error.message,
      status_code: 500 });
  }
});


app.get("/api/dining-place", async (req, res) => {
  try {
    const {name} = req.query;
    const query = "SELECT * FROM dining_places WHERE name LIKE ?";
    const [rows] = await pool.execute(query,[`%${name}%`]);
    //console.log(rows);
    const results = rows.map((place) => ({
      place_id: place.id,
      name: place.name,
      address: place.address,
      phone_no: place.phone_no,
      website: place.website,
      operational_hours: {
        open_time: place.open_time,
        close_time: place.close_time,
      },
    }));

    res.status(200).json({
       results 
    });


  } catch (error) {
    res.status(500).json({
      error: error.message,
      status_code: 500 });
  }
});

app.get("/api/dining-place/availability", async (req, res) => {
  try {
    const {place_id, start_time, end_time} = req.query;
    //console.log(place_id, start_time, end_time);
    const query = "SELECT * FROM dining_places WHERE id = ?";
    const [place] = await pool.execute(query,[place_id]);
    //console.log(place.length);

    if (place.length === 0) {
      return res.status(404).json({ 
        status: "Dining place not found", 
        status_code: 404 });
    }

    const query2 = "SELECT * FROM bookings WHERE place_id = ? AND ((start_time <= ? AND end_time > ?) OR (start_time < ? AND end_time >= ?))";
    const [bookings] = await pool.execute(query2,[place_id, start_time, start_time, end_time, end_time]);
    const isAvailable = bookings.length === 0;
    let next = null;
    if (!isAvailable) {
      const [nextSlot] = await pool.execute("SELECT MIN(end_time) as next_slot FROM bookings WHERE place_id = ? AND end_time > ?",[place_id, start_time]);
      //console.log(nextSlot);  
      next = nextSlot[0].next_slot;

      // convert the next available slot to Indian Standard Time
      next = new Date(next);
      next.setHours(next.getHours() + 5);
      next.setMinutes(next.getMinutes() + 30);

    }

    res.json({
      place_id: place[0].id,
      name: place[0].name,
      phone_no: place[0].phone_no,
      available: isAvailable,
      next_available_slot: nextAvailableSlot,
    });


  } catch (error) {
    res.status(500).json({
      error: error.message,
      status_code: 500 });
  }
});


app.post('/api/dining-place/book', verifyToken, async (req, res) => {
  try {
    const { place_id, start_time, end_time } = req.body;
    //console.log(place_id, start_time, end_time);
    //console.log(req.user);
    const user_id = req.user.id;
    
    console.log(user_id);
    const query = "SELECT * FROM bookings WHERE place_id = ? AND ((start_time <= ? AND end_time > ?) OR (start_time < ? AND end_time >= ?))";
    const [exists] = await pool.execute(query,[place_id, start_time, start_time, end_time, end_time]);

    if (exists.length > 0) {
      return res.status(400).json({
        status: 'Slot is not available at this moment, please try some other place',
        status_code: 400
      });
    }

    const bookingId = GenerateBookingId();
    const query2 = "INSERT INTO bookings (id, user_id, place_id, start_time, end_time) VALUES (?, ?, ?, ?, ?)";
    const [result] = await pool.execute(query2,[bookingId, user_id, place_id, start_time, end_time]);
    //console.log(result);
    res.status(200).json({
      status: 'Slot booked successfully',
      status_code: 200,
      booking_id: bookingId
    });


  } catch (error) {
    res.status(500).json({
      error: error.message,
      status_code: 500 });
  }
});


const PORT = 8000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
