import { Capacitor } from '@capacitor/core';

/**
 * Determines the base URL for API calls.
 * - In Native App (Android/iOS): returns the production Vercel URL
 * - In Web App: returns empty string (relative path)
 */
export const API_BASE_URL = Capacitor.isNativePlatform()
    ? 'https://softw.vercel.app'
    : '';

/**
 * Returns the full URL for an API endpoint
 * @param {string} endpoint - '/api/...' path
 * @returns {string} Full URL
 */
export const getApiUrl = (endpoint) => {
    return `${API_BASE_URL}${endpoint}`;
};
