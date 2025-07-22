import PropTypes from 'prop-types';
import { AlertCircle, AlertTriangle, Info, XCircle } from 'lucide-react';

/**
 * A reusable error display component with various styles
 */
const ErrorDisplay = ({
  message,
  type = 'error',
  onDismiss,
  className = '',
}) => {
  const baseClasses = 'p-4 rounded-md my-4 flex items-start gap-3';
  
  const typeConfig = {
    error: {
      classes: 'bg-red-50 text-red-800 border border-red-200',
      icon: <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />,
    },
    warning: {
      classes: 'bg-yellow-50 text-yellow-800 border border-yellow-200',
      icon: <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0" />,
    },
    info: {
      classes: 'bg-sky-50 text-sky-800 border border-sky-200',
      icon: <Info className="h-5 w-5 text-sky-500 flex-shrink-0" />,
    },
  };

  const { classes, icon } = typeConfig[type] || typeConfig.error;

  return (
    <div className={`${baseClasses} ${classes} ${className}`} role="alert">
      {icon}
      <div className="flex-1 text-sm">{message}</div>
      {onDismiss && (
        <button
          type="button"
          className="flex-shrink-0 text-gray-400 hover:text-gray-600"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <XCircle className="h-5 w-5" />
        </button>
      )}
    </div>
  );
};

ErrorDisplay.propTypes = {
  /** The error message to display */
  message: PropTypes.string.isRequired,
  /** The type of error message */
  type: PropTypes.oneOf(['error', 'warning', 'info']),
  /** Optional function to call when the user dismisses the error */
  onDismiss: PropTypes.func,
  /** Additional classes to apply to the component */
  className: PropTypes.string,
};

export default ErrorDisplay;