import React, { Ref } from 'react';
import { useRef, useEffect, useState, createRef, RefObject } from 'react';

export default function GameOfLife() {
  const [sliderValue, setSliderValue] = useState(0);
  const [pixelSize, setPixelSize] = useState(20);
  const [gridSize, setGridSize] = useState(256);
  useEffect(() => {
    if (sliderValue !== 0) {
      setGridSize(2 ** sliderValue);
    }
    console.log('gridSize', gridSize);
  }, [sliderValue]);
  useEffect(() => {}, []);
  return (
    <>
      <div>
        <div className="p-4">
          <input
            type="range"
            className="transparent w-128 h-1.5 cursor-pointer appearance-none rounded-lg border-transparent bg-neutral-200"
            id="customRange1"
            step={1}
            max={8}
            min={1}
            onChange={(e) => {
              setSliderValue(parseInt(e.target.value));
            }}
          />

          <div
            // className="grid-rows-8  grid grid-cols-8 gap-0.5"
            style={{
              width: '512px',
              height: '512px',
              gridRowGap: '1px',
              gridColumnGap: '1px',
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fill, ${32}px)`,
            }}
          >
            {Array.from({ length: gridSize - 1 }).map((_, index) => (
              <div className="">
                <div
                  key={index}
                  style={{ width: pixelSize, height: pixelSize }}
                  className={`border border-gray-300 bg-green-500`}
                ></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
