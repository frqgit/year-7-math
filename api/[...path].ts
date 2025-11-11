import dotenv from "dotenv";
import express from "express";
import session from "express-session";
import { registerRoutesOnly } from "../server/routes";

// Load environment variables (for local testing)
dotenv.config();

const app = express();

// CORS headers for Vercel
app.use((req, res, next) => {
	res.header('Access-Control-Allow-Credentials', 'true');
	res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
	res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
	res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	
	if (req.method === 'OPTIONS') {
		return res.sendStatus(200);
	}
	next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// In Vercel, requests may be behind a proxy/CDN
app.set("trust proxy", 1);

// Log environment check
if (!process.env.DATABASE_URL) {
	console.error('❌ DATABASE_URL not set in Vercel environment variables');
}
if (!process.env.SESSION_SECRET) {
	console.error('❌ SESSION_SECRET not set in Vercel environment variables');
}

// Session configuration
// Note: In serverless, we use simple session (not persisted across instances)
// For production, consider using a different session store like Redis
app.use(session({
	secret: process.env.SESSION_SECRET || "change-me",
	resave: false,
	saveUninitialized: false,
	cookie: {
		secure: process.env.NODE_ENV === 'production',
		httpOnly: true,
		sameSite: "lax",
		maxAge: 24 * 60 * 60 * 1000,
	},
}));

// Health check endpoint (before routes)
app.get('/api/health', (req, res) => {
	res.json({ 
		status: 'ok', 
		timestamp: new Date().toISOString(),
		hasDatabase: !!process.env.DATABASE_URL,
		hasSession: !!process.env.SESSION_SECRET
	});
});

// Attach all routes; do not call listen()
registerRoutesOnly(app);

// Error handling middleware (must be after routes)
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
	const status = err.status || err.statusCode || 500;
	const message = err.message || "Internal Server Error";
	console.error('API Error:', err);
	res.status(status).json({ message, error: process.env.NODE_ENV === 'development' ? err.message : undefined });
});

// Vercel serverless function expects a specific handler format
// Export the Express app - Vercel will wrap it automatically
module.exports = app;
export default app;
