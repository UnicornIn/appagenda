import React, { useCallback, useRef } from "react";
import { Clock3 } from "lucide-react";

interface TimeInputWithPickerProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  inputClassName?: string;
  wrapperClassName?: string;
  buttonClassName?: string;
  buttonAriaLabel?: string;
}

const TimeInputWithPicker: React.FC<TimeInputWithPickerProps> = ({
  inputClassName = "",
  wrapperClassName = "",
  buttonClassName = "",
  buttonAriaLabel = "Abrir selector de hora",
  disabled,
  ...inputProps
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleOpenPicker = useCallback(() => {
    const input = inputRef.current;
    if (!input || disabled) return;

    try {
      if (typeof input.showPicker === "function") {
        input.showPicker();
        return;
      }
    } catch {
      // Algunos navegadores pueden lanzar excepción al invocar showPicker.
    }

    input.focus();
  }, [disabled]);

  const mergedInputClass = inputClassName.includes("pr-")
    ? inputClassName
    : `${inputClassName} pr-9`;

  return (
    <div className={`relative ${wrapperClassName}`}>
      <input
        ref={inputRef}
        type="time"
        disabled={disabled}
        {...inputProps}
        className={mergedInputClass.trim()}
      />

      <button
        type="button"
        onClick={handleOpenPicker}
        disabled={disabled}
        aria-label={buttonAriaLabel}
        className={`absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded border border-gray-300 bg-white text-gray-600 shadow-sm transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 ${buttonClassName}`.trim()}
      >
        <Clock3 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export default React.memo(TimeInputWithPicker);
