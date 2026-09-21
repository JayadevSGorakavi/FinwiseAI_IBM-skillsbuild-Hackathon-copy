/**
 * Vercel serverless entry point for the FinWise AI API.
 *
 * The root package.json sets "type": "module", so every .js file in this
 * repo is loaded as an ES module — including this one. That is why the old
 * `const app = require("../server/index.cjs")` crashed the function with
 * "require is not defined in ES module scope", which made every /api/* call
 * return a 500 HTML page and pushed FinBot into its offline fallback.
 *
 * ESM can import a CommonJS file directly as long as the extension is .cjs,
 * and the default export is that file's module.exports (the Express app).
 * Express apps are themselves (req, res) handlers, so Vercel can invoke this
 * export straight away.
 */
import app from "../server/index.cjs";

export default app;
