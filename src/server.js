import dotenv from "dotenv";
import express from "express";
import cors from "cors";

import { handleMessage } from "./honeypot_agent.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).json({
    status: "online",
    message: "Hasta La Vista Honeypot API is running.",
  });
});

// Token validation middleware
app.use((req, res, next) => {
  const apiKey = req.headers["x-api-key"];

  console.log("Received API Key:", apiKey);
  console.log("Expected API Key:", process.env.API_KEY);

  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(403).json({
      status: "error",
      message: "Forbidden: Invalid API Key",
    });
  }

  next();
});

// Main endpoint that responds to scam
app.post("/api/message", async (req, res) => {
  try {
    const result = await handleMessage(req.body);

    return res.status(200).json(result);
  } catch (error) {
    console.error("Server Error:", error);

    return res.status(200).json({
      status: "success",
      reply:
        "One moment sir, I am checking the details. Please stay connected...",
    });
  }
});

app.listen(PORT, () => {
  console.log(`🔥 Hasta La Vista Honeypot running on port ${PORT}`);
});
