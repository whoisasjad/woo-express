
# Nature Valley API Proxy Server

This Express.js server acts as a proxy between the Nature Valley React frontend and the WooCommerce REST API. It helps to solve CORS issues and provides a cleaner API interface.

## Setup Instructions

1. Install dependencies:
   ```
   npm install
   ```

2. Create an environment file:
   ```
   cp .env.example .env
   ```

3. Edit the `.env` file with your WooCommerce API credentials (if needed).

4. Start the development server:
   ```
   npm run dev
   ```

5. The server will run on http://localhost:5000 by default.

## API Endpoints

- `GET /api/products` - Get a list of products with pagination
- `GET /api/products/:id` - Get a single product by ID
- `GET /api/products/related` - Get related products

## Production Deployment

For production, you can deploy this server to:

- Heroku
- Vercel
- Netlify Functions
- AWS Lambda
- Any Node.js hosting service

Make sure to set the environment variables in your production environment.
