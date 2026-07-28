import React from 'react';
import { Button, Tooltip } from '@mui/material';
import type { ButtonProps } from '@mui/material';

interface CardActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  /** MUI palette color — tints icon AND label together (semantic actions like Start/Delete). Leave unset for a neutral label with a custom-tinted icon (pass the color via sx on the icon itself). */
  color?: ButtonProps['color'];
  disabled?: boolean;
  tooltip?: string;
}

// ========== CARD ACTION BUTTON ==========
// Labelled icon+text button for net/schedule card action rows, replacing
// bare icon-only IconButtons. Gives every action a visible one-word label
// (no more hover-only tooltips) and a comfortable 44px tap target on mobile,
// matching the Touch targets rule in DESIGN.md.
const CardActionButton: React.FC<CardActionButtonProps> = ({
  icon,
  label,
  onClick,
  color = 'inherit',
  disabled,
  tooltip,
}) => (
  <Tooltip title={tooltip || label}>
    <span>
      <Button
        size="small"
        color={color}
        onClick={onClick}
        disabled={disabled}
        startIcon={icon}
        sx={{
          textTransform: 'none',
          minHeight: { xs: 44, sm: 32 },
          px: { xs: 1.25, sm: 1 },
        }}
      >
        {label}
      </Button>
    </span>
  </Tooltip>
);

export default CardActionButton;
