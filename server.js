
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// WooCommerce API configuration
const API_BASE_URL = process.env.WC_API_URL;
const CONSUMER_KEY = process.env.WC_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.WC_CONSUMER_SECRET;

// Create WooCommerce API instance
const wooCommerceAPI = axios.create({
  baseURL: API_BASE_URL,
  params: {
    consumer_key: CONSUMER_KEY,
    consumer_secret: CONSUMER_SECRET
  }
});

// Initialize Express app
const app = express();
const PORT = process.env.PORT;

// Middleware
app.use(cors());
app.use(express.json());

// Log all requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Routes
app.get('/api/products', async (req, res) => {
  try {
    const { page = 1, per_page = 10 } = req.query;
    
    console.log(`Fetching products page ${page}, per_page ${per_page}`);
    
    const response = await wooCommerceAPI.get('/products', {
      params: { 
        page,
        per_page,
        ...req.query // Pass any additional query params
      }
    });
    
    // Ensure stock_quantity is correctly parsed for each product
    if (response.data && Array.isArray(response.data)) {
      response.data.forEach(product => {
        if (product.stock_quantity !== undefined) {
          product.stock_quantity = Number(product.stock_quantity);
        } else {
          // Default to 0 if stock_quantity is not provided
          product.stock_quantity = 0;
        }
      });
    }
    
    res.json({
      products: response.data,
      total: parseInt(response.headers['x-wp-total'] || '0'),
      totalPages: parseInt(response.headers['x-wp-totalpages'] || '0')
    });
  } catch (error) {
    console.error('Error fetching products from WooCommerce:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch products',
      message: error.message
    });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const response = await wooCommerceAPI.get(`/products/${req.params.id}`);
    
    // Ensure stock_quantity is properly parsed
    if (response.data) {
      if (response.data.stock_quantity !== undefined) {
        response.data.stock_quantity = Number(response.data.stock_quantity);
      } else {
        // Default to 0 if stock_quantity is not provided
        response.data.stock_quantity = 0;
      }
    }
    
    res.json({ product: response.data });
  } catch (error) {
    console.error(`Error fetching product ID ${req.params.id}:`, error.message);
    res.status(500).json({ 
      error: 'Failed to fetch product details',
      message: error.message
    });
  }
});

// Fixed related products endpoint
app.get('/api/products/related', async (req, res) => {
  try {
    const { product_id, category_id, per_page = 3 } = req.query;
    
    if (!category_id) {
      return res.status(400).json({ 
        error: 'Missing category_id parameter',
        message: 'A category ID is required to fetch related products'
      });
    }
    
    const response = await wooCommerceAPI.get('/products', {
      params: {
        category: category_id,
        exclude: product_id,
        per_page
      }
    });
    
    // Ensure stock_quantity is properly parsed for each related product
    if (response.data && Array.isArray(response.data)) {
      response.data.forEach(product => {
        if (product.stock_quantity !== undefined) {
          product.stock_quantity = Number(product.stock_quantity);
        } else {
          // Default to 0 if stock_quantity is not provided
          product.stock_quantity = 0;
        }
      });
    }
    
    res.json({ products: response.data });
  } catch (error) {
    console.error('Error fetching related products:', error.message);
    // Return empty products array instead of an error
    res.json({ products: [] });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API URL: ${API_BASE_URL}`);
});
