"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollArea } from '@/components/ui/scroll-area';
import { AdjustmentSlider } from './AdjustmentSlider';
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ASPECT_RATIO_OPTIONS, AspectRatioOption } from '@/lib/types';

interface AdjustmentSidebarProps {
  brightness: number;
  onBrightnessChange: (value: number) => void;
  exposure: number;
  onExposureChange: (value: number) => void;
  temperature: number;
  onTemperatureChange: (value: number) => void;
  contrast: number;
  onContrastChange: (value: number) => void;
  saturation: number;
  onSaturationChange: (value: number) => void;
  tint: number;
  onTintChange: (value: number) => void;
  sharpness: number;
  onSharpnessChange: (value: number) => void;

  isCropping: boolean;
  toggleCropMode: () => void;
  currentAspectRatio: AspectRatioOption;
  onAspectRatioChange: (value: AspectRatioOption) => void;
  onApplyCrop: () => void;

  onApplyGrayscale: () => void;
  isLoading: boolean;
  selectedFile: File | null;
}

export function AdjustmentSidebar({
  brightness, onBrightnessChange, exposure, onExposureChange,
  temperature, onTemperatureChange, contrast, onContrastChange,
  saturation, onSaturationChange, tint, onTintChange,
  sharpness, onSharpnessChange,
  isCropping, toggleCropMode, currentAspectRatio, onAspectRatioChange, onApplyCrop, // Destructure crop props
  onApplyGrayscale, isLoading, selectedFile,
}: AdjustmentSidebarProps) {
  return (
    <aside className="w-72 border-l bg-card text-card-foreground p-0 flex flex-col">
      <ScrollArea className="flex-1 p-4">
        <Accordion 
          type="multiple" 
          defaultValue={["item-crop", "item-light", "item-color", "item-detail"]} // Open crop by default too
          className="w-full"
        >
          <AccordionItem value="item-crop">
            <AccordionTrigger className="text-sm font-medium">Crop & Transform</AccordionTrigger>
            <AccordionContent className="pt-2 space-y-4">
              <Button 
                onClick={toggleCropMode} 
                variant={isCropping ? "secondary" : "outline"}
                className="w-full"
                disabled={!selectedFile || isLoading}
              >
                {isCropping ? "Cancel Crop" : "Activate Crop Tool"}
              </Button>
              {isCropping && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="aspect-ratio-select" className="text-xs">Aspect Ratio</Label>
                    <Select
                      value={currentAspectRatio}
                      onValueChange={(value) => onAspectRatioChange(value as AspectRatioOption)}
                      disabled={!selectedFile || isLoading}
                    >
                      <SelectTrigger id="aspect-ratio-select">
                        <SelectValue placeholder="Select ratio" />
                      </SelectTrigger>
                      <SelectContent>
                        {ASPECT_RATIO_OPTIONS.map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Placeholder for Rotate/Straighten sliders if needed */}
                  <Button
                    onClick={onApplyCrop}
                    disabled={isLoading || !selectedFile}
                    className="w-full"
                  >
                    Apply Crop
                  </Button>
                </>
              )}
              <p className="text-xs text-muted-foreground">Rotate/Straighten coming soon.</p>
            </AccordionContent>
          </AccordionItem>

          {/* ... other AccordionItems for Light, Color, Detail, Effects ... */}
          <AccordionItem value="item-light">
            <AccordionTrigger className="text-sm font-medium">Light</AccordionTrigger>
            <AccordionContent className="pt-2 space-y-4">
              <AdjustmentSlider id="exposure-slider" label="Exposure" value={exposure} min={-2.0} max={2.0} step={0.05} onValueChange={onExposureChange} disabled={!selectedFile || isLoading} unit=" EV"/>
              <AdjustmentSlider id="brightness-slider" label="Brightness" value={brightness} min={0.1} max={2} step={0.05} onValueChange={onBrightnessChange} disabled={!selectedFile || isLoading}/>
              <AdjustmentSlider id="contrast-slider" label="Contrast" value={contrast} min={-50} max={50} step={1} onValueChange={onContrastChange} disabled={!selectedFile || isLoading}/>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-color">
            <AccordionTrigger className="text-sm font-medium">Color</AccordionTrigger>
            <AccordionContent className="pt-2 space-y-4">
              <AdjustmentSlider id="temperature-slider" label="Temperature" value={temperature} min={-100} max={100} step={1} onValueChange={onTemperatureChange} disabled={!selectedFile || isLoading}/>
              <AdjustmentSlider id="tint-slider" label="Tint" value={tint} min={-100} max={100} step={1} onValueChange={onTintChange} disabled={!selectedFile || isLoading}/>
              <AdjustmentSlider id="saturation-slider" label="Saturation" value={saturation} min={0.0} max={2.0} step={0.01} onValueChange={onSaturationChange} disabled={!selectedFile || isLoading}/>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-detail">
            <AccordionTrigger className="text-sm font-medium">Detail</AccordionTrigger>
            <AccordionContent className="pt-2 space-y-4">
              <AdjustmentSlider id="sharpness-slider" label="Sharpness" value={sharpness} min={0} max={100} step={1} onValueChange={onSharpnessChange} disabled={!selectedFile || isLoading}/>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-effects">
            <AccordionTrigger className="text-sm font-medium">Effects</AccordionTrigger>
            <AccordionContent className="pt-2 space-y-4">
              <Button onClick={onApplyGrayscale} disabled={isLoading || !selectedFile} className="w-full" variant="secondary">
                {isLoading ? 'Processing...' : 'Apply Grayscale'}
              </Button>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </ScrollArea>
      {/* Removed the global "Apply All Adjustments" button from the bottom */}
    </aside>
  );
}