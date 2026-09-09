import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });

    // Guard against the classic "my data vanished" trap: when the URI has no
    // database name, Mongoose silently writes everything into a default db.
    if (!conn.connection.name) {
      console.warn(
        "⚠️  MONGODB_URI has no database name (add /moviesmod before the '?')." +
        " Data is going into a default database and may appear 'missing' later."
      );
    }
    console.log(`MongoDB Connected: ${conn.connection.host} / db: ${conn.connection.name || "(default)"}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    throw error;
  }
};

export default connectDB;
