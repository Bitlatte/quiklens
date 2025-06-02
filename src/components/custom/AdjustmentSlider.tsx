// app/(layout-components)/AdjustmentSlider.tsx
"use client";

import React, { useState, useEffect, ChangeEvent, FocusEvent } from 'react';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input'; // Import Input component

interface AdjustmentSliderProps {
  id: string; // Unique ID for accessibility and label association
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onValueChange: (value: number) => void;
  defaultValue?: number;
  disabled?: boolean;
  unit?: string; // Optional unit to display next to the value
  className?: string; // Optional additional class names
}

export function AdjustmentSlider({
  id,
  label,
  value,
  min,
  max,
  step,
  onValueChange,
  defaultValue,
  disabled = false,
  unit = '',
  className,
}: AdjustmentSliderProps) {
  // Local state for the input field to allow temporary invalid inputs before blur/enter
  const [inputValue, setInputValue] = useState<string>(value.toFixed(2));

  // Update inputValue when the external 'value' prop changes (e.g., from slider interaction or parent)
  useEffect(() => {
    setInputValue(value.toFixed(2));
  }, [value]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
    // Optionally, you could try to parse and call onValueChange here live,
    // but it can be jerky. Better to do it on blur or enter.
  };

  const processInputValue = (currentValStr: string) => {
    let numericValue = parseFloat(currentValStr);
    if (isNaN(numericValue)) {
      numericValue = value; // Revert to last valid value if input is not a number
    }

    // Clamp the value to min/max
    numericValue = Math.max(min, Math.min(max, numericValue));

    // Optional: Snap to the nearest step (can be complex if step is float)
    // For simplicity, we'll let the parent handle final step clamping if needed,
    // or we can round to a certain number of decimal places based on step.
    // numericValue = Math.round(numericValue / step) * step;
    // numericValue = parseFloat(numericValue.toFixed(String(step).split('.')[1]?.length || 0));


    onValueChange(numericValue); // Update parent state
    setInputValue(numericValue.toFixed(2)); // Update local input display to clamped/formatted value
  };

  const handleInputBlur = (event: FocusEvent<HTMLInputElement>) => {
    processInputValue(event.target.value);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      processInputValue(inputValue);
      (event.target as HTMLInputElement).blur(); // Optional: blur on enter
    } else if (event.key === 'Escape') {
      setInputValue(value.toFixed(2)); // Revert to original value on escape
      (event.target as HTMLInputElement).blur();
    }
  };

  const handleSliderChange = (newValueArray: number[]) => {
    const numericValue = newValueArray[0];
    setInputValue(numericValue.toFixed(2)); // Keep input in sync with slider
    onValueChange(numericValue);
  };


  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex justify-between items-center mb-3">
        <Label htmlFor={id} className="text-xs">
          {label}
        </Label>
        <div className="flex items-center">
          <Input
            type="number"
            id={`${id}-input`}
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onKeyDown={handleInputKeyDown}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            className="h-7 w-14 text-xs px-2 py-1 text-right" // Adjusted styling
          />
          {unit && <span className="ml-1 text-xs text-muted-foreground">{unit}</span>}
        </div>
      </div>
      <Slider
        id={id}
        min={min}
        max={max}
        step={step}
        value={[value]} // Slider still controlled by the external 'value' prop
        defaultValue={defaultValue !== undefined ? [defaultValue] : undefined}
        onValueChange={handleSliderChange}
        disabled={disabled}
      />
    </div>
  );
}
