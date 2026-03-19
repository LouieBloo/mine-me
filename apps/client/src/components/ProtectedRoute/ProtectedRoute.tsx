import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export const ProtectedRoute: React.FC = () => {
    const { token, loading } = useAuth();

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-bg-dark">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sol"></div>
            </div>
        );
    }

    if (!token) {
        return <Navigate to="/auth" replace />;
    }

    return <Outlet />;
};
