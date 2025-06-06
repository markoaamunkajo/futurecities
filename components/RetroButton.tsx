import React from 'react';

interface RetroButtonProps {
  onClick: () => void;
  children?: React.ReactNode;
  disabled?: boolean;
}

const RetroButton: React.FC<RetroButtonProps> = ({ onClick, children, disabled }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      className={`
        min-w-[180px] px-6 py-3 
        bg-neutral-700 text-green-400 
        font-['VT323'] text-2xl sm:text-3xl tracking-wider uppercase
        border-2 border-t-neutral-500 border-l-neutral-500 
        border-b-neutral-900 border-r-neutral-900 
        rounded-sm shadow-md
        transition-all duration-75 ease-out
        focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-60
        
        ${!disabled ? `
          hover:bg-neutral-600 hover:text-green-300 hover:border-t-neutral-400 hover:border-l-neutral-400
          active:bg-neutral-800 active:border-t-neutral-900 active:border-l-neutral-900 
          active:border-b-neutral-500 active:border-r-neutral-500
          active:translate-y-0.5 active:shadow-none
          cursor-pointer
        ` : `
          bg-neutral-800 text-neutral-500 cursor-not-allowed
          border-neutral-700
          opacity-60
        `}
      `}
    >
      {children || "Generate"}
    </button>
  );
};

export default RetroButton;