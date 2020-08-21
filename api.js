const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const monk = require("monk");
const helmet = require("helmet");
const punycode = require("punycode");
const yup = require("yup");
const nodeEmoji = require("node-emoji");
const rateLimit = require("express-rate-limit");
const slowDown = require("express-slow-down");

// reading database address + secret
require("dotenv").config();

//--------------------------------------------------------
//------------------ DATABASE SETUP ----------------------
//--------------------------------------------------------

const db = monk(process.env.MONGODB_URL);
// check connection is established
db.then(() => {
  console.log("Monk connected to database 🔗");
});
// choose collection
const urls = db.get("urls");
urls.createIndex({ emojis: 1 }, { unique: true });

//--------------------------------------------------------
//--------------------- API SETUP ------------------------
//--------------------------------------------------------

// create app
const app = express();
const port = process.env.PORT || 4000;

// get domain name
const domain = process.env.DOMAIN || "localhost";

// middleware
app.use(morgan("combined")); // log requests
app.use(cors()); // enable CORS
app.use(helmet()); // secure app & set headers
app.use(express.json()); // parse request body as JSON

//--------------------------------------------------------
//------------------ HELPER FUNCTIONS --------------------
//--------------------------------------------------------

// data validation schema
const schema = yup.object().shape({
  emojis: yup
    .string()
    .trim()
    .matches(/^[\w\-]/i), // if not specified we generate one at random
  url: yup.string().trim().url().required(),
});

// check if key exists
function keyExists(key) {
  urls.findOne({ emojis: key }).then((doc) => {
    if (doc) {
      return true;
    } else {
      return false;
    }
  });
}

// generate random key not in use
function generateRandomEmojis() {
  let emojis;
  let exists;
  do {
    emojis = "";
    for (let i = 0; i < 5; i++) {
      emojis += nodeEmoji.random().emoji;
    }
    exists = keyExists(punycode.encode(emojis));
    console.log(`${emojis}: keyExists? ${exists}`);
  } while (exists);
  return emojis;
}

//--------------------------------------------------------
//------------------- API ROUTES -------------------------
//--------------------------------------------------------

const router = express.Router();

// get all urls from most recent to oldest
router.get("/", async (req, res) => {
  let records = await urls.find({});
  res.json(records.reverse());
});

// get last n urls from most recent to oldest
router.get("/last/:num", async (req, res) => {
  let index = Number(req.params.num);
  let records = await urls.find({});
  res.json(records.slice(-index).reverse());
});

// get specific URL
router.get("/:id", async (req, res, next) => {
  try {
    const url = await urls.findOne({ emojis: req.params.id });
    if (url) {
      res.json({
        emojiURL: `http://${domain}/${url.raw}`,
        redirectURL: url.url,
      });
    } else {
      console.log("not found");
      return res.status(404).send("not found");
    }
  } catch (error) {
    console.log(error);
    return res.status(500).send("Error");
  }
});

// register routes
app.use("/api", router);

// start listening
app.listen(port, () => {
  console.log(`Listening on ${domain}:${port} 🦻`);
});