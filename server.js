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
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Log all requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Helper function to properly parse stock information
const parseStockInfo = (product) => {
  if (!product) return product;
  
  // Parse stock_quantity to a number or default to 0
  if (product.stock_quantity !== undefined) {
    product.stock_quantity = Number(product.stock_quantity);
  } else {
    product.stock_quantity = 0;
  }
  
  // Check stock_status if stock_quantity is 0
  if (product.stock_quantity === 0 && product.stock_status === 'instock') {
    // If stock_status is instock but quantity is 0, set a default quantity
    product.stock_quantity = 1;
  }
  
  return product;
};

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
    
    // Ensure stock information is correctly parsed for each product
    if (response.data && Array.isArray(response.data)) {
      response.data = response.data.map(product => parseStockInfo(product));
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

// New endpoint for featured products
app.get('/api/products/featured', async (req, res) => {
  try {
    const { per_page = 6 } = req.query;
    
    console.log(`Fetching featured products, per_page ${per_page}`);
    
    const response = await wooCommerceAPI.get('/products', {
      params: {
        featured: true,
        per_page
      }
    });
    
    // Ensure stock information is correctly parsed for each product
    const products = Array.isArray(response.data) 
      ? response.data.map(product => parseStockInfo(product))
      : [];
    
    console.log(`Found ${products.length} featured products`);
    
    res.json({
      products: products,
      total: parseInt(response.headers['x-wp-total'] || '0'),
      totalPages: parseInt(response.headers['x-wp-totalpages'] || '0')
    });
  } catch (error) {
    console.error('Error fetching featured products from WooCommerce:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch featured products',
      message: error.message
    });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const response = await wooCommerceAPI.get(`/products/${req.params.id}`);
    
    // Process the product with our helper function
    const product = parseStockInfo(response.data);
    
    // Log the product stock information for debugging
    console.log(`Product ID ${req.params.id} stock info:`, {
      stock_quantity: product.stock_quantity,
      stock_status: product.stock_status
    });
    
    res.json({ product });
  } catch (error) {
    console.error(`Error fetching product ID ${req.params.id}:`, error.message);
    res.status(500).json({ 
      error: 'Failed to fetch product details',
      message: error.message
    });
  }
});

// Updated related products endpoint - use a query approach instead of a path parameter
app.get('/api/related-products', async (req, res) => {
  try {
    const { product_id, category_id, per_page = 3 } = req.query;
    
    console.log(`Fetching related products for product ${product_id} in category ${category_id}`);
    
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
    
    // Process each related product with our helper function
    const products = Array.isArray(response.data) 
      ? response.data.map(product => parseStockInfo(product))
      : [];
    
    console.log(`Found ${products.length} related products for product ${product_id}`);
    res.json({ products });
  } catch (error) {
    console.error('Error fetching related products:', error.message);
    // Return empty products array instead of an error
    res.json({ products: [] });
  }
});

// Get available payment gateways
app.get('/api/payment-gateways', async (req, res) => {
  try {
    console.log('Fetching payment gateways from WooCommerce');
    const response = await wooCommerceAPI.get('/payment_gateways');
    
    // Filter to only return enabled payment gateways
    const enabledGateways = response.data.filter(gateway => gateway.enabled === true);
    
    // Make sure we log instructions for debugging
    enabledGateways.forEach(gateway => {
      if (gateway.id === 'bacs' && gateway.instructions) {
        console.log(`BACS payment instructions: ${gateway.instructions}`);
      }
    });
    
    console.log(`Found ${enabledGateways.length} enabled payment gateways`);
    
    res.json({ payment_gateways: enabledGateways });
  } catch (error) {
    console.error('Error fetching payment gateways:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch payment gateways',
      message: error.message
    });
  }
});

// Create a new order - Fixed endpoint
app.post('/api/orders', async (req, res) => {
  try {
    // Clone the request body to avoid circular reference issues
    const orderData = JSON.parse(JSON.stringify(req.body));
    console.log('Creating new order with data:', JSON.stringify(orderData));
    
    // Make sure shipping is not a circular reference
    if (orderData.shipping && orderData.shipping.message && 
        orderData.shipping.message.includes('Circular Reference')) {
      // If shipping is a circular reference, use billing address for shipping
      console.log('Detected circular reference in shipping address, using billing address instead');
      orderData.shipping = { ...orderData.billing };
    }
    
    // Send to WooCommerce API
    const response = await wooCommerceAPI.post('/orders', orderData);
    console.log('Order created successfully:', response.data.id);
    
    res.json({ 
      success: true, 
      order: response.data 
    });
  } catch (error) {
    console.error('Error creating order:', error);
    let errorMessage = error.message;
    
    // Check if there's a more specific error message from the WooCommerce API
    if (error.response && error.response.data) {
      errorMessage = error.response.data.message || errorMessage;
      console.error('WooCommerce API error:', error.response.data);
    }
    
    res.status(500).json({ 
      error: 'Failed to create order',
      message: errorMessage
    });
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
