import { useAuth } from './useAuth';

export const useApi = () => {
    const { token } = useAuth();

    const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
        const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;

        const headers: any = {
            ...options.headers,
            'Authorization': `Bearer ${token}`,
        };

        if (!(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(fullUrl, {
            ...options,
            headers,
        });

        if (response.status === 401 || response.status === 403) {
            // Optional: handle session expiry
            console.error('Session expired or unauthorized');
        }

        return response;
    };

    return { fetchWithAuth };
};
