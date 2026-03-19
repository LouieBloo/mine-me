import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { SignupForm } from './SignupForm/SignupForm';
import { SigninForm } from './SigninForm/SigninForm';
import './Auth.css';

export const Auth: React.FC = () => {
    const [isSignup, setIsSignup] = useState(false);
    const { token } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (token) {
            navigate('/characters');
        }
    }, [token, navigate]);

    return (
        <div className="min-h-[80vh] flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 bg-panel p-8 rounded-2xl shadow-2xl border border-white/5 backdrop-blur-sm">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-white tracking-tight">
                        {isSignup ? 'Start Your Journey' : 'Welcome Back'}
                    </h2>
                    <p className="mt-2 text-center text-sm text-slate-400">
                        {isSignup ? 'Join the world of Need vs Greed' : 'Resume your adventure'}
                    </p>
                </div>

                {isSignup ? <SignupForm /> : <SigninForm />}

                <div className="text-center">
                    <button
                        onClick={() => setIsSignup(!isSignup)}
                        className="text-sm font-medium text-sol hover:text-amber-400 transition-colors cursor-pointer"
                    >
                        {isSignup 
                            ? 'Already have an account? Sign in' 
                            : "Don't have an account? Sign up"}
                    </button>
                </div>
            </div>
        </div>
    );
};
