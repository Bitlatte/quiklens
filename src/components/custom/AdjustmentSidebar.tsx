// components/custom/AdjustmentSidebar.tsx
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
import { AdjustmentSlider } from './AdjustmentSlider'; // Assuming this path is correct
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ASPECT_RATIO_OPTIONS, AspectRatioOption } from '@/lib/types';
import { useEditorStore } from '@/lib/store'; // Import the Zustand store

// Removed all props that will now come from the store
interface AdjustmentSidebarProps {}

export function AdjustmentSidebar({}: AdjustmentSidebarProps) {
  // Select state from the store
  const brightness = useEditorStore(state => state.brightness);
  const exposure = useEditorStore(state => state.exposure);
  const temperature = useEditorStore(state => state.temperature);
  const contrast = useEditorStore(state => state.contrast);
  const saturation = useEditorStore(state => state.saturation);
  const tint = useEditorStore(state => state.tint);
  const sharpness = useEditorStore(state => state.sharpness);

  const isCropping = useEditorStore(state => state.isCropping);
  const currentAspectRatio = useEditorStore(state => state.currentAspectRatio);
  const isLoading = useEditorStore(state => state.isLoading);
  const selectedFile = useEditorStore(state => state.selectedFile);

  // Get actions from the store
  const setBrightness = useEditorStore(state => state.setBrightness);
  const setExposure = useEditorStore(state => state.setExposure);
  const setTemperature = useEditorStore(state => state.setTemperature);
  const setContrast = useEditorStore(state => state.setContrast);
  const setSaturation = useEditorStore(state => state.setSaturation);
  const setTint = useEditorStore(state => state.setTint);
  const setSharpness = useEditorStore(state => state.setSharpness);

  const toggleCropMode = useEditorStore(state => state.toggleCropMode);
  const setCurrentAspectRatio = useEditorStore(state => state.setCurrentAspectRatio);
  const applyCrop = useEditorStore(state => state.applyCrop);
  // For applyNamedEffect, if you need to call it with specific parameters:
  const applyGrayscale = () => useEditorStore.getState().applyNamedEffect('grayscale');


  return (
    <aside className="w-72 border-l bg-card text-card-foreground p-0 flex flex-col">
      <ScrollArea className="flex-1 p-4">
        <Accordion
          type="multiple"
          defaultValue={["item-crop", "item-light", "item-color", "item-detail"]}
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
                      onValueChange={(value) => setCurrentAspectRatio(value as AspectRatioOption)}
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
                  <Button
                    onClick={applyCrop}
                    disabled={isLoading || !selectedFile} // Consider also disabling if uiCropRegion is not valid
                    className="w-full"
                  >
                    Apply Crop
                  </Button>
                </>
              )}
              <p className="text-xs text-muted-foreground">Rotate/Straighten coming soon.</p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-light">
            <AccordionTrigger className="text-sm font-medium">Light</AccordionTrigger>
            <AccordionContent className="pt-2 space-y-4">
              <AdjustmentSlider id="exposure-slider" label="Exposure" value={exposure} min={-2.0} max={2.0} step={0.05} onValueChange={setExposure} disabled={!selectedFile || isLoading} unit=" EV"/>
              <AdjustmentSlider id="brightness-slider" label="Brightness" value={brightness} min={0.1} max={2} step={0.05} onValueChange={setBrightness} disabled={!selectedFile || isLoading}/>
              <AdjustmentSlider id="contrast-slider" label="Contrast" value={contrast} min={-50} max={50} step={1} onValueChange={setContrast} disabled={!selectedFile || isLoading}/>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-color">
            <AccordionTrigger className="text-sm font-medium">Color</AccordionTrigger>
            <AccordionContent className="pt-2 space-y-4">
              <AdjustmentSlider id="temperature-slider" label="Temperature" value={temperature} min={-100} max={100} step={1} onValueChange={setTemperature} disabled={!selectedFile || isLoading}/>
              <AdjustmentSlider id="tint-slider" label="Tint" value={tint} min={-100} max={100} step={1} onValueChange={setTint} disabled={!selectedFile || isLoading}/>
              <AdjustmentSlider id="saturation-slider" label="Saturation" value={saturation} min={0.0} max={2.0} step={0.01} onValueChange={setSaturation} disabled={!selectedFile || isLoading}/>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-detail">
            <AccordionTrigger className="text-sm font-medium">Detail</AccordionTrigger>
            <AccordionContent className="pt-2 space-y-4">
              <AdjustmentSlider id="sharpness-slider" label="Sharpness" value={sharpness} min={0} max={100} step={1} onValueChange={setSharpness} disabled={!selectedFile || isLoading}/>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-effects">
            <AccordionTrigger className="text-sm font-medium">Effects</AccordionTrigger>
            <AccordionContent className="pt-2 space-y-4">
              <Button onClick={applyGrayscale} disabled={isLoading || !selectedFile} className="w-full" variant="secondary">
                {isLoading ? 'Processing...' : 'Apply Grayscale'}
              </Button>
              {/* Add more named effects here */}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </ScrollArea>
    </aside>
  );
}