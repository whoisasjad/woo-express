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

// Get shipping zones and methods
app.get('/api/shipping/zones', async (req, res) => {
  try {
    console.log('Fetching shipping zones from WooCommerce');
    const response = await wooCommerceAPI.get('/shipping/zones');
    
    console.log(`Found ${response.data.length} shipping zones`);
    
    res.json({ shipping_zones: response.data });
  } catch (error) {
    console.error('Error fetching shipping zones:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch shipping zones',
      message: error.message
    });
  }
});

// Get shipping methods for a specific zone
app.get('/api/shipping/zones/:zone_id/methods', async (req, res) => {
  try {
    const { zone_id } = req.params;
    console.log(`Fetching shipping methods for zone ${zone_id}`);
    
    const response = await wooCommerceAPI.get(`/shipping/zones/${zone_id}/methods`);
    
    console.log(`Found ${response.data.length} shipping methods for zone ${zone_id}`);
    
    res.json({ shipping_methods: response.data });
  } catch (error) {
    console.error(`Error fetching shipping methods for zone ${req.params.zone_id}:`, error.message);
    res.status(500).json({ 
      error: 'Failed to fetch shipping methods',
      message: error.message
    });
  }
});

// Calculate shipping for cart
app.post('/api/shipping/calculate', async (req, res) => {
  try {
    const { cart_items, shipping_address } = req.body;
    console.log('Calculating shipping for cart with', cart_items?.length || 0, 'items');
    console.log('Shipping address country:', shipping_address?.country);
    
    // First get shipping zones
    const zonesResponse = await wooCommerceAPI.get('/shipping/zones');
    
    // Find the appropriate zone based on shipping address country
    let selectedZone = null;
    
    // Look for a zone that specifically covers the shipping country
    for (const zone of zonesResponse.data) {
      try {
        // Get zone locations to check if it covers the shipping country
        const locationsResponse = await wooCommerceAPI.get(`/shipping/zones/${zone.id}/locations`);
        const locations = locationsResponse.data;
        
        // Check if any location matches the shipping country
        const countryMatch = locations.find(location => 
          location.type === 'country' && 
          location.code === shipping_address.country
        );
        
        if (countryMatch) {
          selectedZone = zone;
          console.log(`Found matching zone: ${zone.name} for country ${shipping_address.country}`);
          break;
        }
      } catch (error) {
        console.log(`Could not fetch locations for zone ${zone.id}`);
      }
    }
    
    // If no specific zone found, use the first available zone or default zone
    if (!selectedZone) {
      selectedZone = zonesResponse.data.find(zone => 
        zone.name !== 'Locations not covered by your other zones'
      ) || zonesResponse.data[0];
      
      console.log(`Using fallback zone: ${selectedZone?.name} (ID: ${selectedZone?.id})`);
    }
    
    if (!selectedZone) {
      throw new Error('No shipping zones available');
    }
    
    // Get shipping methods for the selected zone
    const methodsResponse = await wooCommerceAPI.get(`/shipping/zones/${selectedZone.id}/methods`);
    const enabledMethods = methodsResponse.data.filter(method => method.enabled === true);
    
    console.log(`Found ${enabledMethods.length} enabled shipping methods for zone ${selectedZone.name}`);
    
    // Calculate total cart value for percentage-based shipping
    const cartTotal = cart_items.reduce((total, item) => {
      return total + (item.price * item.quantity);
    }, 0);
    
    console.log(`Cart total for shipping calculation: ${cartTotal}`);
    
    // Process shipping methods and calculate costs
    const shippingOptions = enabledMethods.map(method => {
      let cost = 0;
      let title = method.method_title || method.title || 'Shipping';
      let description = '';
      
      // Parse the cost based on method settings
      if (method.settings && method.settings.cost) {
        const costValue = method.settings.cost.value;
        if (costValue) {
          // Handle different cost formats
          if (costValue.includes('%')) {
            // Percentage of cart total
            const percentage = parseFloat(costValue.replace('%', ''));
            cost = (cartTotal * percentage) / 100;
          } else if (costValue === 'min_amount') {
            // Use minimum amount if set
            cost = method.settings.min_amount ? parseFloat(method.settings.min_amount.value) : 0;
          } else {
            // Fixed amount
            cost = parseFloat(costValue) || 0;
          }
        }
      }
      
      // Get custom title if available
      if (method.settings && method.settings.title && method.settings.title.value) {
        title = method.settings.title.value;
      }
      
      // Clean up description - remove HTML tags and get meaningful description
      if (method.method_description) {
        description = method.method_description.replace(/<[^>]*>/g, '').trim();
      } else if (method.settings && method.settings.description && method.settings.description.value) {
        description = method.settings.description.value.replace(/<[^>]*>/g, '').trim();
      }
      
      // Provide default descriptions based on method type
      if (!description || description.length < 5) {
        switch (method.method_id) {
          case 'free_shipping':
            description = 'Free delivery to your address';
            break;
          case 'flat_rate':
            description = cost > 0 ? `Fixed rate delivery` : 'Standard delivery';
            break;
          case 'local_pickup':
            description = 'Pick up from our location';
            break;
          default:
            description = 'Delivery service';
        }
      }
      
      return {
        id: method.method_id,
        instance_id: method.instance_id,
        title: title,
        cost: cost,
        description: description,
        enabled: method.enabled
      };
    });
    
    console.log('Calculated shipping options:', shippingOptions.map(opt => ({
      title: opt.title,
      cost: opt.cost,
      description: opt.description
    })));
    
    res.json({ 
      shipping_options: shippingOptions,
      zone: selectedZone
    });
  } catch (error) {
    console.error('Error calculating shipping:', error.message);
    res.status(500).json({ 
      error: 'Failed to calculate shipping',
      message: error.message
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
