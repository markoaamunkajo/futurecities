import React from 'react';

interface LogoSpinnerProps {
  className?: string;
  style?: React.CSSProperties;
  color: string; // The C64 green color
}

// ViewBox constants
const VIEWBOX_SIZE = 64;
// const VIEWBOX_CENTER = VIEWBOX_SIZE / 2; // 32 // Not explicitly used for path, but good to keep in mind
const STROKE_WIDTH = 1; 

// Infinity symbol path: M17,32 Q17,17 32,17 T47,32 Q47,47 32,47 T17,32
// This path creates a continuous loop for the infinity symbol,
// centered within a 64x64 viewBox.
// Width: 47-17 = 30 units. Height: 47-17 = 30 units.
const INFINITY_PATH_D = "M17,32 Q17,17 32,17 T47,32 Q47,47 32,47 T17,32";

const LogoSpinner: React.FC<LogoSpinnerProps> = ({
  className,
  style,
  color,
}) => {
  const filterId = "glow-filter";

  return (
    <div
      className={className}
      style={style}
      role="img"
      aria-label="Loading animation: spinning glowing infinity symbol"
    >
      <svg
        viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
        className="animate-spin" // Tailwind's spin animation
        style={{ width: '100%', height: '100%' }}
        aria-hidden="true" // Decorative image, label is on the div
      >
        <defs>
          <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
            {/* Blur the source alpha */}
            <feGaussianBlur in="SourceAlpha" stdDeviation="1.2" result="blur"/>
            {/* Create a flood of the desired color */}
            <feFlood floodColor={color} result="floodColor"/>
            {/* Composite the color onto the blur */}
            <feComposite in="floodColor" in2="blur" operator="in" result="glowEffect"/>
            {/* Merge the glow with the original graphic */}
            <feMerge>
              <feMergeNode in="glowEffect"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Infinity Symbol Path */}
        <path
          d={INFINITY_PATH_D}
          stroke={color}
          strokeWidth={STROKE_WIDTH}
          fill="none"
          filter={`url(#${filterId})`}
          strokeLinecap="round" // Makes the ends of the path (if it were open) and joins smoother
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

export default LogoSpinner;