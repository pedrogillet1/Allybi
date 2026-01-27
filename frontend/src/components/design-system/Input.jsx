import React, { useState } from 'react';
import { spacing, radius, colors, typography, shadows } from '../../design/tokens';

const Input = ({
  type = 'text',
  placeholder,
  value,
  onChange,
  disabled = false,
  error = false,
  icon,
  style = {},
  inputStyle = {},
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const containerStyle = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    ...style
  };

  const inputStyles = {
    width: '100%',
    padding: icon ? `${spacing.sm} ${spacing.md} ${spacing.sm} 40px` : `${spacing.sm} ${spacing.md}`,
    borderRadius: radius.sm,
    border: `1px solid ${error ? colors.error[300] : isFocused ? colors.primary[300] : colors.neutral[200]}`,
    fontSize: typography.body.size,
    fontWeight: typography.body.weight,
    fontFamily: typography.body.family,
    color: colors.neutral[900],
    background: disabled ? colors.neutral[50] : colors.neutral[0],
    boxShadow: isFocused ? shadows.sm : shadows.none,
    transition: 'all 0.15s ease-out',
    outline: 'none',
    cursor: disabled ? 'not-allowed' : 'text',
    opacity: disabled ? 0.6 : 1,
    height: '40px',
    boxSizing: 'border-box',
    ...inputStyle
  };

  return (
    <div style={containerStyle}>
      {icon && (
        <span style={{
          position: 'absolute',
          left: spacing.md,
          display: 'flex',
          alignItems: 'center',
          color: colors.neutral[400],
          pointerEvents: 'none'
        }}>
          {icon}
        </span>
      )}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={inputStyles}
        {...props}
      />
    </div>
  );
};

export default Input;
