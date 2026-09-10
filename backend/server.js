import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import compression from "compression";
import connectDB from "./config/db.js";
import movieRoutes from "./routes/movieRoutes.js";

dotenv.config();

const app = express();
const corsOrigin = process.env.CORS_ORIGIN
  ? (process.env.CORS_ORIGIN.includes(",")
      ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
      : process.env.CORS_ORIGIN)
  : "*";

app.use(cors({ origin: corsOrigin }));
app.use(compression()); // gzip JSON — the movie list shrinks ~5-10x on the wire
app.use(express.json());

app.get("/", (req, res) => {
  res.send("API is running...");
});

app.use("/api/movies", movieRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

connectDB().catch((err) => {
  console.error("Failed to connect to MongoDB:", err.message);
  console.error("Add your current IP to MongoDB Atlas whitelist: https://cloud.mongodb.com/v2/ -> Network Access -> Add IP Address");
});
