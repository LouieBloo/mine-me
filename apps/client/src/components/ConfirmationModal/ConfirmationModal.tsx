import React from 'react';
import { Modal } from '../Modal/Modal';
import './ConfirmationModal.css';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  variant?: 'primary' | 'danger' | 'warning' | 'info' | 'success';
  showCancel?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirmation',
  message = 'Are you sure you want to proceed?',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isLoading = false,
  variant = 'primary',
  showCancel = true,
}) => {
  // Variant styling
  const variantStyles = {
    primary: {
      button: 'bg-sol hover:bg-amber-400 text-slate-900',
      icon: 'text-sol bg-sol/10',
      svg: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    danger: {
      button: 'bg-red-600 hover:bg-red-500 text-white',
      icon: 'text-red-500 bg-red-500/10',
      svg: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      )
    },
    warning: {
      button: 'bg-amber-600 hover:bg-amber-500 text-white',
      icon: 'text-amber-500 bg-amber-500/10',
      svg: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      )
    },
    info: {
      button: 'bg-blue-600 hover:bg-blue-500 text-white',
      icon: 'text-blue-500 bg-blue-500/10',
      svg: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    success: {
      button: 'bg-lear hover:bg-emerald-500 text-white',
      icon: 'text-lear bg-lear/10',
      svg: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )
    }
  };

  const currentVariant = variantStyles[variant] || variantStyles.primary;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidthClass="max-w-md">
      <div className="flex flex-col items-center text-center space-y-6">
        {/* Icon */}
        <div className={`w-20 h-20 rounded-full flex items-center justify-center ${currentVariant.icon} border-4 border-white/5 shadow-2xl transition-all duration-500`}>
          <div className="w-10 h-10">
            {currentVariant.svg}
          </div>
        </div>

        {/* Content */}
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter italic">
            {title}
          </h2>
          <p className="text-slate-400 text-lg leading-relaxed">
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 w-full pt-4">
          {showCancel && (
            <button
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-6 py-4 rounded-xl font-bold uppercase tracking-widest text-slate-400 bg-slate-800 hover:bg-slate-700 hover:text-white transition-all order-2 sm:order-1 cursor-not-allowed disabled:opacity-50 sm:cursor-pointer"
            >
              {cancelLabel}
            </button>
          )}
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 px-6 py-4 rounded-xl font-black uppercase tracking-widest shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center min-h-[60px] order-1 sm:order-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${currentVariant.button}`}
          >
            {isLoading ? (
              <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};
