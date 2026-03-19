import React from 'react';
import { CircularProgress, Box } from '@mui/material';
import './LoadingSpinner.css';

interface LoadingSpinnerProps {
  size?: number;
  color?: "primary" | "secondary" | "error" | "info" | "success" | "warning" | "inherit";
  fullScreen?: boolean;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 40, 
  color = "primary", 
  fullScreen = false 
}) => {
  return (
    <Box 
      className={`loading-spinner-container ${fullScreen ? 'full-screen' : ''}`}
      display="flex" 
      justifyContent="center" 
      alignItems="center"
    >
      <CircularProgress size={size} color={color} />
    </Box>
  );
};

export default LoadingSpinner;
