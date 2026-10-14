const express = require('express');
const { DatabaseSync } = require('node:sqlite')
const crypto = require('crypto')

const PASSWORD = process.env.PASSWORD
let token = ""
const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173"

const app = express();

const db = new DatabaseSync("weather.sqlite")

db.exec(`
    CREATE TABLE IF NOT EXISTS cities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
    )
`)

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", clientOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, DELETE, POST");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type",
    );
    if (req.method === "OPTIONS") {
        res.sendStatus(204)
        return
    }
    next();
})

app.use(express.json())

app.post("/login", (req, res) => {
    if (req.body.password !== PASSWORD) {
        res.status(401).json({error: "Неверный пароль"})
        return
    }
    token = crypto.randomBytes(16).toString("hex")
    res.json({token})
})

app.get("/weather", async (req, res) => {
    const city = req.query.city;
    try {
        if (!city) {
            res.status(400).json({error: "Город не указан"})
            return
        }

        const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ru`)

        if (!response.ok) {
            res.status(500).json({error: `Ошибка HTTP ${response.status}`})
            return
        }

        const data = await response.json()

        const place = data?.results?.[0];

        if (!data?.results?.length || !place) {
            res.status(404).json({error: "Город не найден"})
            return
        }

        const { latitude, longitude, country, name } = place;

        const responseWeather = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto`,
        );

        if (!responseWeather.ok) {
            res.status(500).json({error: `Ошибка HTTP ${responseWeather.status}`})
            return
        }

        const dataWeather = await responseWeather.json();

        const { current } = dataWeather;

        db.prepare(`INSERT OR IGNORE INTO cities (name) VALUES (?)`).run(name);

        res.json({ current, country, name });
    } catch (error) {
        res.status(500).json({error: error.message})
        return
    }
})

app.get("/history", (req, res) => {
    const rows = db.prepare(`SELECT name FROM cities ORDER BY id`).all()
    res.json(rows)
})

app.delete("/history", (req, res) => {
    const header = req.headers.authorization;
    if (header !== token || !token) {
        res.status(401).json({error: "Нет допуска"})
        return
    }
    db.prepare(`DELETE FROM cities`).run();
    res.json([])
})

app.listen(3000, () => {
    console.log("http://localhost:3000")
})