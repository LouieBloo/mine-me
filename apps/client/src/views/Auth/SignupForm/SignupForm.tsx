import React, { useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import './SignupForm.css';

export const SignupForm: React.FC = () => {
    const { signup, error, loading } = useAuth();
    const navigate = useNavigate();
    const [familyName, setFamilyName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await signup(familyName, phoneNumber);
            navigate('/characters');
        } catch (err) {
            // Error is handled by context
        }
    };

    return (
        <form className="signup-form mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="rounded-md shadow-sm space-y-4">
                <div>
                    <label htmlFor="family-name" className="block text-sm font-medium text-slate-300 mb-1">
                        Family Name
                    </label>
                    <input
                        id="family-name"
                        name="familyName"
                        type="text"
                        required
                        value={familyName}
                        onChange={(e) => setFamilyName(e.target.value)}
                        className="appearance-none relative block w-full px-3 py-2 border border-slate-700 bg-slate-900/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-sol focus:border-transparent sm:text-sm transition-all"
                        placeholder="e.g. Ironheart"
                    />
                </div>
                <div>
                    <label htmlFor="phone-number" className="block text-sm font-medium text-slate-300 mb-1">
                        Phone Number
                    </label>
                    <input
                        id="phone-number"
                        name="phoneNumber"
                        type="tel"
                        required
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="appearance-none relative block w-full px-3 py-2 border border-slate-700 bg-slate-900/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-sol focus:border-transparent sm:text-sm transition-all"
                        placeholder="e.g. +1234567890"
                    />
                </div>
            </div>

            {error && (
                <div className="text-error text-sm bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                    {error}
                </div>
            )}

            <div>
                <button
                    type="submit"
                    disabled={loading}
                    className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-bold rounded-lg text-slate-900 bg-sol hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sol transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                    {loading ? (
                        <span className="flex items-center">
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-slate-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Creating Account...
                        </span>
                    ) : 'Register New Family'}
                </button>
            </div>
        </form>
    );
};
