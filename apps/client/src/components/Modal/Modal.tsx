// @ts-nocheck
import React, { Fragment } from 'react';
import type { ReactNode } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import './Modal.css';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  maxWidthClass?: string;
  noPadding?: boolean;
  hideHeader?: boolean;
}

export const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  maxWidthClass = 'max-w-md',
  noPadding = false,
  hideHeader = false
}) => {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className={`w-full ${maxWidthClass} transform overflow-hidden rounded-2xl bg-slate-900 border-2 border-slate-700 text-left align-middle shadow-2xl transition-all flex flex-col relative`}>
                
                {/* Header (optional if no title provided, though usually you want the close button) */}
                {!hideHeader && (title || !noPadding) && (
                  <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-slate-800/50 z-10 relative">
                    <Dialog.Title as="h3" className="text-xl font-black text-slate-100 uppercase tracking-widest">
                      {title as any}
                    </Dialog.Title>
                    <button
                      type="button"
                      className="ml-4 rounded-full p-1.5 hover:bg-red-500/20 hover:text-red-400 text-slate-400 transition-colors cursor-pointer"
                      onClick={onClose}
                    >
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}

                {/* Body Content */}
                <div className={`text-slate-300 flex-1 flex flex-col relative ${noPadding ? '' : 'p-6'}`}>
                  {children}
                </div>

                {/* Absolute Close Button (when header is hidden) - Rendered last to ensure stacking priority */}
                {hideHeader && (
                  <button
                    type="button"
                    className="absolute top-4 right-4 z-[999] rounded-full p-2 bg-black/40 backdrop-blur-md hover:bg-red-500 text-white transition-all cursor-pointer border border-white/20"
                    onClick={onClose}
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};
