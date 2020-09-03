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
const { exists } = require("fs");

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
const recordSchema = yup.object().shape({
  emojis: yup
    .string()
    .trim()
    .matches(/^[\w\-]/i), // if not specified we generate one at random
  url: yup.string().trim().url().required(),
});

// check if key exists
async function keyExists(key) {
  return urls.findOne({ emojis: key }).then((doc) => {
    if (doc) {
      return true;
    } else {
      return false;
    }
  });
}

// generate random key not in use
async function generateRandomEmojis() {
  let emojis;
  let exists;
  do {
    emojis = "";
    for (let i = 0; i < 5; i++) {
      emojis += nodeEmoji.random().emoji;
    }
    exists = await keyExists(punycode.encode(emojis));
  } while (exists);
  return emojis;
}

//--------------------------------------------------------
//------------------- API ROUTES -------------------------
//--------------------------------------------------------

const router = express.Router();

// custom error messages
const existsErrorMessage = "This emoji slug already exists... 😿";
const emojiErrorMessage = "There must be at least 1 emoji in the slug... 👹";

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
        emojiURL: `https://${domain}/${url.raw}`,
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

// insert new URL
router.post("/newURL", async (req, res, next) => {
  let { emojis, url } = req.body;
  let encodedEmojis = emojis ? punycode.encode(emojis) : undefined;

  try {
    await recordSchema.validate({
      encodedEmojis,
      url,
    });

    if (!encodedEmojis) {
      emojis = await generateRandomEmojis();
      encodedEmojis = punycode.encode(emojis);
    } else {
      let exists = await keyExists(encodedEmojis);
      console.log("exists: ", exists)
      if (exists) {
        throw new Error(existsErrorMessage);
      }
    }

    if (encodedEmojis.slice(0, -1) === emojis) {
      throw new Error(emojiErrorMessage);
    }

    let newURL = { emojis: encodedEmojis, url: url, raw: emojis };
    let created = await urls.insert(newURL);
    console.log(created);
    res.send({ port: port, domain: domain, ...created });
  } catch (error) {
    console.log("Error caught on this req");
    console.log("params", req.params, "body", req.body);
    next(error);
  }
});

// register routes
app.use("/api", router);

// handle errors
app.use((error, req, res, next) => {
  if (error.status) {
    res.status(error.status);
  } else {
    switch (error.message) {
      case existsErrorMessage:
        res.status(444);
        break;
      case emojiErrorMessage:
        res.status(555);
        break;
      default:
        res.status(500);
        break;
    }
  }
  let obj = {
    message: error.message,
    stack: process.env.NODE_ENV === "production" ? "🥞" : error.stack,
    req: req.body,
  };
  res.json(obj);
  console.log(obj);
});

// start listening
app.listen(port, () => {
  console.log(`Listening on ${domain}:${port} 🦻`);
});
