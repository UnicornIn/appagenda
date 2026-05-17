import React, { useEffect, useRef, useState } from 'react';
import { DayPicker, type DateRange } from 'react-day-picker';
import { es } from 'date-fns/locale';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';

function parseYMD(str?: string): Date | undefined {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return undefined;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${dy}`;
}

function displayDate(str?: string): string {
  const d = parseYMD(str);
  return d ? format(d, 'dd/MM/yyyy') : (str ?? '');
}

interface BaseProps {
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  min?: string;
  max?: string;
  'aria-label'?: string;
}

export interface SingleDatePickerProps extends BaseProps {
  mode?: 'single';
  value?: string;
  onChange?: (value: string) => void;
}

export interface RangeDatePickerProps extends BaseProps {
  mode: 'range';
  value?: { from?: string; to?: string };
  onChange?: (value: { from?: string; to?: string }) => void;
}

export interface MultipleDatePickerProps extends BaseProps {
  mode: 'multiple';
  value?: string[];
  onChange?: (value: string[]) => void;
}

export type DatePickerProps =
  | SingleDatePickerProps
  | RangeDatePickerProps
  | MultipleDatePickerProps;

export function DatePicker(props: DatePickerProps) {
  const { disabled, placeholder = 'Seleccionar fecha', className, min, max } = props;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Build disabled matchers from min/max
  const disabledMatchers: object[] = [];
  const minDate = parseYMD(min);
  const maxDate = parseYMD(max);
  if (minDate) disabledMatchers.push({ before: minDate });
  if (maxDate) disabledMatchers.push({ after: maxDate });

  // Trigger display text
  let triggerText = placeholder;
  if (props.mode === 'range') {
    const v = props.value;
    if (v?.from || v?.to) {
      triggerText = [v.from && displayDate(v.from), v.to && displayDate(v.to)]
        .filter(Boolean)
        .join(' — ');
    }
  } else if (props.mode === 'multiple') {
    const v = props.value;
    if (v && v.length > 0) triggerText = `${v.length} fecha${v.length > 1 ? 's' : ''}`;
  } else {
    const v = (props as SingleDatePickerProps).value;
    if (v) triggerText = displayDate(v);
  }

  const commonPickerProps = {
    locale: es,
    ...(disabledMatchers.length > 0 && { disabled: disabledMatchers as Parameters<typeof DayPicker>[0]['disabled'] }),
  };

  let pickerNode: React.ReactNode;

  if (props.mode === 'range') {
    const v = props.value;
    const selected: DateRange = { from: parseYMD(v?.from), to: parseYMD(v?.to) };
    pickerNode = (
      <DayPicker
        {...commonPickerProps}
        mode="range"
        selected={selected}
        onSelect={(range) =>
          props.onChange?.({
            from: range?.from ? toYMD(range.from) : undefined,
            to: range?.to ? toYMD(range.to) : undefined,
          })
        }
      />
    );
  } else if (props.mode === 'multiple') {
    const selected = (props.value ?? []).map(parseYMD).filter((d): d is Date => d !== undefined);
    pickerNode = (
      <DayPicker
        {...commonPickerProps}
        mode="multiple"
        selected={selected}
        onSelect={(dates) => props.onChange?.((dates ?? []).map(toYMD))}
      />
    );
  } else {
    const singleProps = props as SingleDatePickerProps;
    pickerNode = (
      <DayPicker
        {...commonPickerProps}
        mode="single"
        selected={parseYMD(singleProps.value)}
        onSelect={(date) => {
          singleProps.onChange?.(date ? toYMD(date) : '');
          setOpen(false);
        }}
      />
    );
  }

  return (
    <div ref={containerRef} className={`relative w-full ${className ?? ''}`}>
      <button
        type="button"
        disabled={disabled}
        aria-label={props['aria-label'] ?? placeholder}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={[
          'datepicker-trigger w-full flex items-center gap-2 px-3 py-2',
          'border border-gray-300 rounded text-sm bg-white text-left',
          'hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-black',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          triggerText === placeholder ? 'text-gray-400' : 'text-gray-900',
        ].join(' ')}
      >
        <CalendarIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
        <span className="flex-1 truncate">{triggerText}</span>
      </button>

      {open && (
        <div className="datepicker-popover" role="dialog" aria-label="Calendario">
          {pickerNode}
        </div>
      )}
    </div>
  );
}

export default DatePicker;
