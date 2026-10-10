import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { LoadingSpinner } from '../LoadingSpinner/LoadingSpinner';

export const ProtectedRoute: React.FC = () => {
    const { token, loading } = useAuth();

    if (loading) {
        return <LoadingSpinner fullScreen />;
    }

    if (!token) {
        return <Navigate to="/auth" replace />;
    }

    return <Outlet />;
};
