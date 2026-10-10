import './LoadingSpinner.css';

export interface LoadingSpinnerProps {
  /** Optional line shown under the spinner. */
  message?: string;
  /** Fill the whole viewport (route-level loading) instead of the parent. */
  fullScreen?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES: Record<NonNullable<LoadingSpinnerProps['size']>, string> = {
  sm: 'h-5 w-5 border-2',
  md: 'h-8 w-8 border-2',
  lg: 'h-12 w-12 border-4',
};

/** The one shared loading spinner: use it for every background load so users always see something is happening. */
export const LoadingSpinner = ({ message, fullScreen = false, size = 'lg' }: LoadingSpinnerProps) => (
  <div
    role="status"
    aria-live="polite"
    className={`flex flex-col items-center justify-center gap-3 bg-bg-dark ${
      fullScreen ? 'min-h-screen w-full' : 'h-full w-full flex-1'
    }`}
  >
    <div className={`loading-spinner-ring animate-spin rounded-full border-sol ${SIZE_CLASSES[size]}`} />
    {message && <p className="text-sm font-semibold uppercase tracking-wider text-slate-400">{message}</p>}
  </div>
);
