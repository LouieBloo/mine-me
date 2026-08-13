import { useAuth } from './useAuth';
import { isTokenExpired } from '@mine-me/shared';
import { useCallback } from 'react';

export const useApi = () => {
    const { token, logout } = useAuth();

    const fetchWithAuth = useCallback(async (url: string, options: RequestInit = {}) => {
        // 1. Pre-check: Is the token already expired?
        if (token && isTokenExpired(token)) {
            console.warn('Token expired before request. Logging out.');
            logout();
            window.location.href = '/auth'; // Hard redirect to clear state
            return new Response(JSON.stringify({ error: 'Session expired' }), { status: 401 });
        }

        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
        const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;

        const headers: any = {
            ...options.headers,
            'Authorization': `Bearer ${token}`,
        };

        if (!(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }

        try {
            const response = await fetch(fullUrl, {
                ...options,
                headers,
            });

            // 2. Post-check: Did the server return 401?
            if (response.status === 401) {
                console.warn('Unauthorized request. Logging out.');
                logout();
                window.location.href = '/auth';
            }

            return response;
        } catch (error) {
            console.error('Network or fetch error:', error);
            throw error;
        }
    }, [token, logout]);

    return { fetchWithAuth };
};
