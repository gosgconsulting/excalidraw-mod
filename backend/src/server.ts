import path from "path";

import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { initDatabase } from "./db";
import drawingsRouter from "./routes/drawings";

// Load .env from backend directory
dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [
  "http://localhost:3000",
  "http://localhost:5000",
];
console.log('allowedOrigins:', allowedOrigins);

app.use(
  cors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API routes
app.use("/api/drawings", drawingsRouter);

// Error handling middleware
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("[testing] Error:", err);
    res.status(err.status || 500).json({
      error: err.message || "Internal server error",
    });
  },
);

// Start server
const startServer = async () => {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`[testing] Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("[testing] Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
