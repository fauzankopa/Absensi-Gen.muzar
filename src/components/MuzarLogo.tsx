import React from 'react';

interface MuzarLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showBackground?: boolean;
}

export const MuzarLogo: React.FC<MuzarLogoProps> = ({ 
  className = '', 
  size = 'md',
  showBackground = true 
}) => {
  const sizeClasses = {
    sm: 'w-7 h-7',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    xl: 'w-20 h-20'
  };

  const currentSize = sizeClasses[size] || sizeClasses.md;

  return (
    <div 
      className={`inline-flex items-center justify-center select-none overflow-hidden ${currentSize} ${
        showBackground ? 'bg-[#A83236] shadow-sm rounded-2xl p-1' : ''
      } ${className}`}
      title="Logo Muzar"
    >
      <svg 
        viewBox="0 0 320 220" 
        className="w-full h-full"
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Golden Sun Arc situated in the upper center dip */}
        <path 
          d="M 152 74 A 23 23 0 0 1 198 74 Z" 
          fill="#F9B417"
        />

        {/* First Wave (Left Wing / Stroke) */}
        <path 
          d="M 18 128 C 42 128 66 114 88 88 C 104 68 120 54 136 54 C 150 54 160 62 166 74 L 140 106 C 134 114 126 118 116 118 C 100 118 84 130 70 148 C 54 168 38 174 20 174 C 12 174 6 172 2 170 C 12 158 18 144 18 128 Z" 
          fill="#FAF0DA"
        />

        {/* Second Wave (Middle Flowing Stroke) */}
        <path 
          d="M 68 148 C 88 148 112 126 136 94 C 150 74 164 62 180 62 C 194 62 204 70 210 82 L 184 116 C 176 126 166 132 154 132 C 138 132 124 142 110 160 C 96 178 80 184 64 184 C 54 184 48 182 44 180 C 56 170 64 158 68 148 Z" 
          fill="#FAF0DA"
        />

        {/* Third Wave & Circular Loop (Right Ribbon with Inner Swirl & Star Notch) */}
        <path 
          d="M 124 158 C 144 158 168 136 192 102 C 208 80 226 64 252 64 C 286 64 312 88 312 122 C 312 158 284 186 246 186 C 214 186 188 164 184 136 C 182 124 190 112 202 112 C 216 112 222 122 224 130 C 226 142 236 150 248 150 C 262 150 274 138 274 122 C 274 108 264 96 250 96 C 238 96 226 104 214 122 L 188 158 C 172 178 154 188 134 188 C 124 188 116 186 112 184 C 120 174 124 164 124 158 Z" 
          fill="#FAF0DA"
        />

        {/* Star Notch / Accent inside right circle */}
        <path 
          d="M 262 122 Q 267 122 267 117 Q 267 122 272 122 Q 267 122 267 127 Q 267 122 262 122 Z" 
          fill={showBackground ? "#A83236" : "#FAF0DA"}
        />
      </svg>
    </div>
  );
};
