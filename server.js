const express = require("express");
const cors = require("cors");
const axios = require("axios");
const dotenv = require("dotenv");

// Load environment variables
dotenv.config();

// WooCommerce API configuration
const API_BASE_URL =
  process.env.WC_API_URL ||
  "https://realcroco-co.stackstaging.com/wp-json/wc/v3";
const CONSUMER_KEY =
  process.env.WC_CONSUMER_KEY || "ck_ef5eb1720075668ef51df07f865d20a18f329c4e";
const CONSUMER_SECRET =
  process.env.WC_CONSUMER_SECRET ||
  "cs_e44ce6712f96870c73861adb4b4b2771853b04e5";

// Create WooCommerce API instance
const wooCommerceAPI = axios.create({
  baseURL: API_BASE_URL,
  params: {
    consumer_key: CONSUMER_KEY,
    consumer_secret: CONSUMER_SECRET,
  },
});

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Log all requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Routes
app.get("/api/products", async (req, res) => {
  try {
    const { page = 1, per_page = 10 } = req.query;

    console.log(`Fetching products page ${page}, per_page ${per_page}`);

    const response = await wooCommerceAPI.get("/products", {
      params: {
        page,
        per_page,
        ...req.query, // Pass any additional query params
      },
    });

    res.json({
      products: response.data,
      total: parseInt(response.headers["x-wp-total"] || "0"),
      totalPages: parseInt(response.headers["x-wp-totalpages"] || "0"),
    });
  } catch (error) {
    console.error("Error fetching products from WooCommerce:", error.message);
    res.status(500).json({
      error: "Failed to fetch products",
      message: error.message,
    });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const response = await wooCommerceAPI.get(`/products/${req.params.id}`);
    res.json({ product: response.data });
  } catch (error) {
    console.error(`Error fetching product ID ${req.params.id}:`, error.message);
    res.status(500).json({
      error: "Failed to fetch product details",
      message: error.message,
    });
  }
});

app.get("/api/products/related", async (req, res) => {
  try {
    const { product_id, category_id, per_page = 3 } = req.query;

    const response = await wooCommerceAPI.get("/products", {
      params: {
        category: category_id,
        exclude: product_id,
        per_page,
      },
    });

    res.json({ products: response.data });
  } catch (error) {
    console.error("Error fetching related products:", error.message);
    res.status(500).json({
      error: "Failed to fetch related products",
      message: error.message,
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API URL: ${API_BASE_URL}`);
});
